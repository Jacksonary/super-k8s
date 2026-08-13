import { useEffect, useRef, useState } from "react";
import { Button, Card, Empty, Popconfirm, Space, Tag, Tooltip, Typography, App as AntdApp } from "antd";
import { DeleteOutlined, ImportOutlined, LinkOutlined, DisconnectOutlined, PartitionOutlined, ReloadOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { api } from "../api";
import type { ClusterConfig } from "../types";
import { useClusterStore } from "../store/clusterStore";
import { useClusterOrder } from "../hooks/useClusterOrder";
import ImportKubeconfigModal from "../components/Cluster/ImportKubeconfigModal";
import NamespaceConfigModal from "../components/Cluster/NamespaceConfigModal";

const { Text } = Typography;

interface SortableCardProps {
  c: ClusterConfig;
  active: boolean;
  onNavigate: (id: string) => void;
  onSetActive: (id: string) => void;
  onNsEdit: (c: ClusterConfig) => void;
  onDelete: (id: string) => void;
}

function SortableClusterCard({ c, active, onNavigate, onSetActive, onNsEdit, onDelete }: SortableCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: c.id });

  return (
    <Card
      ref={setNodeRef}
      hoverable
      size="small"
      styles={{ body: { padding: 12, cursor: isDragging ? "grabbing" : "grab" } }}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
      {...attributes}
      {...listeners}
      onClick={() => onNavigate(c.id)}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <Text strong ellipsis style={{ minWidth: 0, flex: 1 }}>
          {c.name}
        </Text>
        <Space size={2} onClick={(e) => e.stopPropagation()}>
          {active ? (
            <Tooltip title="Active">
              <Button type="text" size="small" icon={<LinkOutlined style={{ color: "#52c41a" }} />} />
            </Tooltip>
          ) : (
            <Tooltip title="Set as active">
              <Button type="text" size="small" icon={<DisconnectOutlined />} onClick={() => onSetActive(c.id)} />
            </Tooltip>
          )}
          <Tooltip title="Configure namespaces">
            <Button type="text" size="small" icon={<PartitionOutlined />} onClick={() => onNsEdit(c)} />
          </Tooltip>
          <Popconfirm
            title="Remove this cluster?"
            description="Its context is removed from the managed kubeconfig."
            onConfirm={() => onDelete(c.id)}
            okButtonProps={{ danger: true }}
          >
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      </div>

      <Text
        code
        ellipsis={{ tooltip: c.server }}
        style={{ fontSize: 12, display: "block", marginBottom: 6 }}
      >
        {c.server}
      </Text>

      <Space size={4} wrap>
        <Tag style={{ marginInlineEnd: 0 }} color={c.source === "imported" ? "blue" : "default"}>
          {c.source}
        </Tag>
        {c.namespace && (
          <Tag bordered={false} style={{ marginInlineEnd: 0 }}>
            ns: {c.namespace}
          </Tag>
        )}
        {c.custom_namespaces.length > 0 && (
          <Tooltip title={c.custom_namespaces.join(", ")}>
            <Tag color="geekblue" style={{ marginInlineEnd: 0 }}>
              {c.custom_namespaces.length} ns
            </Tag>
          </Tooltip>
        )}
      </Space>
    </Card>
  );
}

export default function Cluster() {
  const { message } = AntdApp.useApp();
  const navigate = useNavigate();
  const {
    clusters,
    refreshClusters,
    currentClusterId,
    setCurrentClusterId,
    addClusterRequestId,
    refreshNamespaces,
  } = useClusterStore();
  const { saveOrder } = useClusterOrder();
  const [importOpen, setImportOpen] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [nsEditing, setNsEditing] = useState<ClusterConfig | null>(null);

  const lastSeenAddRequest = useRef(addClusterRequestId);
  useEffect(() => {
    if (addClusterRequestId === lastSeenAddRequest.current) return;
    lastSeenAddRequest.current = addClusterRequestId;
    setImportOpen(true);
  }, [addClusterRequestId]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  async function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const oldIndex = clusters.findIndex((c) => c.id === active.id);
    const newIndex = clusters.findIndex((c) => c.id === over.id);
    const reordered = arrayMove(clusters, oldIndex, newIndex);
    await saveOrder(reordered.map((c) => c.id));
    await refreshClusters();
  }

  async function handleDelete(id: string) {
    try {
      await api.deleteCluster(id);
      message.success("Cluster removed");
      await refreshClusters();
    } catch (e) {
      message.error(String(e));
    }
  }

  async function handleReload() {
    setReloading(true);
    try {
      const res = await api.reloadDefaultKubeconfig();
      const added = res.added ?? 0;
      message.success(
        added > 0 ? `Loaded ${added} new cluster${added === 1 ? "" : "s"}` : "Reloaded ~/.kube/config",
      );
      await refreshClusters();
    } catch (e) {
      message.error(String(e));
    } finally {
      setReloading(false);
    }
  }

  return (
    <Card
      title="Cluster Management"
      style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
      styles={{ body: { flex: 1, minHeight: 0, overflow: "auto" } }}
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} loading={reloading} onClick={handleReload}>
            Reload ~/.kube/config
          </Button>
          <Button type="primary" icon={<ImportOutlined />} onClick={() => setImportOpen(true)}>
            Import kubeconfig
          </Button>
        </Space>
      }
    >
      {clusters.length === 0 ? (
        <Empty description="No clusters. Import a kubeconfig or reload ~/.kube/config." />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={clusters.map((c) => c.id)} strategy={rectSortingStrategy}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                gap: 12,
              }}
            >
              {clusters.map((c) => (
                <SortableClusterCard
                  key={c.id}
                  c={c}
                  active={c.id === currentClusterId}
                  onNavigate={(id) => navigate(`/cluster/${encodeURIComponent(id)}`)}
                  onSetActive={setCurrentClusterId}
                  onNsEdit={setNsEditing}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <ImportKubeconfigModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onSaved={async () => {
          await refreshClusters();
        }}
      />

      <NamespaceConfigModal
        open={nsEditing !== null}
        cluster={nsEditing}
        onClose={() => setNsEditing(null)}
        onSaved={async () => {
          const editedId = nsEditing?.id;
          await refreshClusters();
          if (editedId && editedId === currentClusterId) {
            await refreshNamespaces();
          }
        }}
      />
    </Card>
  );
}
