import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Card, Empty, Popconfirm, Space, Tag, Tooltip, Typography, App as AntdApp } from "antd";
import { CheckCircleFilled, DeleteOutlined, ImportOutlined, ReloadOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import type { ClusterConfig } from "../types";
import { useClusterStore } from "../store/clusterStore";
import ImportKubeconfigModal from "../components/Cluster/ImportKubeconfigModal";

const { Text } = Typography;

export default function Cluster() {
  const { message } = AntdApp.useApp();
  const navigate = useNavigate();
  const { clusters, refreshClusters, currentClusterId, setCurrentClusterId, addClusterRequestId } =
    useClusterStore();
  const [importOpen, setImportOpen] = useState(false);
  const [reloading, setReloading] = useState(false);

  // Auto-open the Import modal when the sidebar "Add Cluster" entry requests it.
  // A ref skips the initial mount value so opening the page never pops the modal.
  const lastSeenAddRequest = useRef(addClusterRequestId);
  useEffect(() => {
    if (addClusterRequestId === lastSeenAddRequest.current) return;
    lastSeenAddRequest.current = addClusterRequestId;
    setImportOpen(true);
  }, [addClusterRequestId]);

  const sortedClusters = useMemo(
    () => [...clusters].sort((a, b) => a.name.localeCompare(b.name)),
    [clusters],
  );

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
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 12,
          }}
        >
          {sortedClusters.map((c: ClusterConfig) => {
            const active = c.id === currentClusterId;
            return (
              <Card
                key={c.id}
                hoverable
                size="small"
                styles={{ body: { padding: 12, cursor: "pointer" } }}
                onClick={() => navigate(`/cluster/${encodeURIComponent(c.id)}`)}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 6,
                  }}
                >
                  <Text strong ellipsis style={{ minWidth: 0, flex: 1 }}>
                    {c.name}
                  </Text>
                  <Space size={2} onClick={(e) => e.stopPropagation()}>
                    {active ? (
                      <Tag icon={<CheckCircleFilled />} color="success" style={{ marginInlineEnd: 0 }}>
                        Active
                      </Tag>
                    ) : (
                      <Tooltip title="Switch to this cluster">
                        <Tag
                          color="default"
                          style={{ marginInlineEnd: 0, cursor: "pointer" }}
                          onClick={() => setCurrentClusterId(c.id)}
                        >
                          Set active
                        </Tag>
                      </Tooltip>
                    )}
                    <Popconfirm
                      title="Remove this cluster?"
                      description="Its context is removed from the managed kubeconfig."
                      onConfirm={() => handleDelete(c.id)}
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

                <Space size={4}>
                  <Tag style={{ marginInlineEnd: 0 }} color={c.source === "imported" ? "blue" : "default"}>
                    {c.source}
                  </Tag>
                  {c.namespace && (
                    <Tag bordered={false} style={{ marginInlineEnd: 0 }}>
                      ns: {c.namespace}
                    </Tag>
                  )}
                </Space>
              </Card>
            );
          })}
        </div>
      )}

      <ImportKubeconfigModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onSaved={async () => {
          await refreshClusters();
        }}
      />
    </Card>
  );
}
