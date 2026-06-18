import { useEffect, useMemo, useState } from "react";
import {
  App,
  Button,
  Card,
  Descriptions,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import { EditOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { api } from "../../api";
import { formatAge, formatTimestamp } from "../../utils/format";
import type { PodInfo } from "../../types";
import type { ResourceTarget, KubeObject } from "./ResourceDetailDrawer";
import { useResizableColumns } from "../Common/ResizableColumns";
import MetadataEditor from "../Common/MetadataEditor";

const { Text } = Typography;

interface Props {
  obj: KubeObject;
  clusterId: string;
  target: ResourceTarget;
  reload: () => void;
  onChanged?: () => void | Promise<void>;
}

function toMs(ts: string | null | undefined): number | null {
  if (!ts) return null;
  const ms = Date.parse(ts);
  return Number.isNaN(ms) ? null : ms;
}

function podStatusColor(s: string): string {
  switch (s) {
    case "Running":
    case "Succeeded":
      return "green";
    case "Pending":
    case "ContainerCreating":
      return "gold";
    case "Failed":
    case "CrashLoopBackOff":
    case "Error":
      return "red";
    default:
      return "default";
  }
}

interface ContainerRow {
  key: string;
  name: string;
  image: string;
  ports: string;
  envCount: number;
}

interface ConditionRow {
  key: string;
  type: string;
  status: string;
  reason: string;
  time: string;
}

export default function DeploymentOverview({ obj, clusterId, target, reload, onChanged }: Props) {
  const { message } = App.useApp();

  const spec = obj?.spec ?? {};
  const status = obj?.status ?? {};
  const meta = obj?.metadata ?? {};

  const desired: number = typeof spec.replicas === "number" ? spec.replicas : 0;
  const ready: number = status.readyReplicas ?? 0;
  const updated: number = status.updatedReplicas ?? 0;
  const available: number = status.availableReplicas ?? 0;

  // ── Action states ─────────────────────────────────────────────
  const [scaleOpen, setScaleOpen] = useState(false);
  const [scaleReplicas, setScaleReplicas] = useState<number>(desired);
  const [scaling, setScaling] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // ── Pods ──────────────────────────────────────────────────────
  const [pods, setPods] = useState<PodInfo[]>([]);
  const [podsLoading, setPodsLoading] = useState(false);

  // ── Strategy edit ─────────────────────────────────────────────
  const [strategyOpen, setStrategyOpen] = useState(false);
  const [draftStrategyType, setDraftStrategyType] = useState("RollingUpdate");
  const [draftMaxSurge, setDraftMaxSurge] = useState("25%");
  const [draftMaxUnavailable, setDraftMaxUnavailable] = useState("25%");
  const [savingStrategy, setSavingStrategy] = useState(false);

  // ── Image edit ────────────────────────────────────────────────
  const [imageEditCtx, setImageEditCtx] = useState<{ name: string; image: string } | null>(null);
  const [newImage, setNewImage] = useState("");
  const [savingImage, setSavingImage] = useState(false);

  // ── Derived values ────────────────────────────────────────────
  const strategyType: string = spec.strategy?.type ?? "RollingUpdate";
  const rollingUpdate = spec.strategy?.rollingUpdate ?? {};
  const maxSurgeValue = rollingUpdate.maxSurge != null ? String(rollingUpdate.maxSurge) : "25%";
  const maxUnavailableValue = rollingUpdate.maxUnavailable != null ? String(rollingUpdate.maxUnavailable) : "25%";

  const selectorLabels: Record<string, string> = spec.selector?.matchLabels ?? {};
  const labels: Record<string, string> = meta.labels ?? {};
  const annotations: Record<string, string> = meta.annotations ?? {};
  const createdMs = toMs(meta.creationTimestamp);

  const containers: ContainerRow[] = (spec.template?.spec?.containers ?? []).map(
    (c: KubeObject, i: number) => ({
      key: c?.name ?? String(i),
      name: c?.name ?? "-",
      image: c?.image ?? "-",
      ports: Array.isArray(c?.ports)
        ? c.ports.map((p: KubeObject) => p?.containerPort).filter(Boolean).join(", ") || "-"
        : "-",
      envCount: Array.isArray(c?.env) ? c.env.length : 0,
    }),
  );

  const conditions: ConditionRow[] = (status.conditions ?? []).map(
    (c: KubeObject, i: number) => ({
      key: `${c?.type ?? i}`,
      type: c?.type ?? "-",
      status: c?.status ?? "-",
      reason: c?.reason ?? "-",
      time: formatTimestamp(toMs(c?.lastUpdateTime ?? c?.lastTransitionTime)),
    }),
  );

  // ── Load pods ─────────────────────────────────────────────────
  useEffect(() => {
    if (!target.namespace) return;
    let cancelled = false;
    setPodsLoading(true);
    api
      .listDeploymentPods(clusterId, target.namespace, target.name)
      .then((rows) => { if (!cancelled) setPods(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (!cancelled) setPods([]); })
      .finally(() => { if (!cancelled) setPodsLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clusterId, target.namespace, target.name]);

  // ── Handlers ──────────────────────────────────────────────────
  const handleScale = async () => {
    if (!target.namespace) return;
    setScaling(true);
    try {
      await api.scaleDeployment(clusterId, target.namespace, target.name, scaleReplicas);
      message.success(`Scaled to ${scaleReplicas}`);
      setScaleOpen(false);
      reload();
      await onChanged?.();
    } catch (e) {
      message.error(`Scale failed: ${(e as Error).message}`);
    } finally {
      setScaling(false);
    }
  };

  const handleRestart = async () => {
    if (!target.namespace) return;
    setRestarting(true);
    try {
      await api.restartDeployment(clusterId, target.namespace, target.name);
      message.success("Rollout restart triggered");
      reload();
      await onChanged?.();
    } catch (e) {
      message.error(`Restart failed: ${(e as Error).message}`);
    } finally {
      setRestarting(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.deleteResource(clusterId, "apps/v1", "Deployment", target.namespace, target.name);
      message.success("Deleted Deployment");
      await onChanged?.();
    } catch (e) {
      message.error(`Delete failed: ${(e as Error).message}`);
    } finally {
      setDeleting(false);
    }
  };

  const openStrategyEdit = () => {
    setDraftStrategyType(strategyType);
    setDraftMaxSurge(maxSurgeValue);
    setDraftMaxUnavailable(maxUnavailableValue);
    setStrategyOpen(true);
  };

  const handleSaveStrategy = async () => {
    if (!target.namespace) return;
    setSavingStrategy(true);
    try {
      await api.updateDeploymentStrategy(
        clusterId, target.namespace, target.name,
        draftStrategyType,
        draftStrategyType === "RollingUpdate" ? draftMaxSurge : null,
        draftStrategyType === "RollingUpdate" ? draftMaxUnavailable : null,
      );
      message.success("Strategy updated");
      setStrategyOpen(false);
      reload();
    } catch (e) {
      message.error(`Update failed: ${(e as Error).message}`);
    } finally {
      setSavingStrategy(false);
    }
  };

  const openImageEdit = (row: ContainerRow) => {
    setImageEditCtx({ name: row.name, image: row.image });
    setNewImage(row.image);
  };

  const handleSaveImage = async () => {
    if (!imageEditCtx || !target.namespace) return;
    setSavingImage(true);
    try {
      await api.updateDeploymentImage(
        clusterId, target.namespace, target.name, imageEditCtx.name, newImage,
      );
      message.success("Image updated");
      setImageEditCtx(null);
      reload();
    } catch (e) {
      message.error(`Update failed: ${(e as Error).message}`);
    } finally {
      setSavingImage(false);
    }
  };

  // ── Column definitions ────────────────────────────────────────
  const podBaseCols: ColumnsType<PodInfo> = [
    { title: "Name", dataIndex: "name", key: "name", ellipsis: true, width: 200 },
    {
      title: "Status", dataIndex: "status", key: "status", width: 120,
      render: (s: string) => <Tag color={podStatusColor(s)}>{s ?? "-"}</Tag>,
    },
    { title: "Ready", dataIndex: "ready", key: "ready", width: 80 },
    { title: "Restarts", dataIndex: "restarts", key: "restarts", width: 90 },
    { title: "Node", dataIndex: "node", key: "node", ellipsis: true, width: 160 },
    {
      title: "Age", dataIndex: "age_ms", key: "age_ms", width: 80,
      render: (ms: number) => formatAge(ms),
    },
  ];

  const containerBaseCols: ColumnsType<ContainerRow> = [
    { title: "Name", dataIndex: "name", key: "name", width: 140 },
    {
      title: "Image", dataIndex: "image", key: "image",
      render: (image: string, row: ContainerRow) => (
        <Space size={4}>
          <Tooltip title={image}>
            <Text ellipsis style={{ maxWidth: 220, display: "inline-block" }}>{image}</Text>
          </Tooltip>
          <Button
            size="small" type="text" icon={<EditOutlined />}
            onClick={() => openImageEdit(row)}
          />
        </Space>
      ),
    },
    { title: "Ports", dataIndex: "ports", key: "ports", width: 120 },
    { title: "Env", dataIndex: "envCount", key: "envCount", width: 60 },
  ];

  const conditionBaseCols: ColumnsType<ConditionRow> = [
    { title: "Type", dataIndex: "type", key: "type", width: 160 },
    {
      title: "Status", dataIndex: "status", key: "status", width: 90,
      render: (s: string) => <Tag color={s === "True" ? "green" : s === "False" ? "red" : "default"}>{s}</Tag>,
    },
    { title: "Reason", dataIndex: "reason", key: "reason", width: 160 },
    { title: "Last Update", dataIndex: "time", key: "time", width: 170 },
  ];

  const { columns: podCols, components: podComponents } = useResizableColumns("detail-dep-pods", podBaseCols);
  const { columns: containerCols, components: containerComponents } = useResizableColumns("detail-dep-containers", containerBaseCols);
  const { columns: conditionCols, components: conditionComponents } = useResizableColumns("detail-dep-conditions", conditionBaseCols);

  // ── Render ────────────────────────────────────────────────────
  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>

      {/* Overview Card */}
      <Card
        size="small"
        title="Overview"
        extra={
          <Space>
            <Button size="small" onClick={() => { setScaleReplicas(desired); setScaleOpen(true); }}>
              Scale
            </Button>
            <Popconfirm title="Restart this Deployment?" onConfirm={handleRestart} okText="Restart" cancelText="Cancel">
              <Button size="small" loading={restarting}>Restart</Button>
            </Popconfirm>
            <Popconfirm
              title="Delete this Deployment?"
              description="This action cannot be undone."
              onConfirm={handleDelete}
              okText="Delete"
              okButtonProps={{ danger: true }}
              cancelText="Cancel"
            >
              <Button size="small" danger loading={deleting}>Delete</Button>
            </Popconfirm>
          </Space>
        }
      >
        <Descriptions size="small" column={2} bordered>
          <Descriptions.Item label="Namespace">
            {meta.namespace ?? target.namespace ?? "-"}
          </Descriptions.Item>
          <Descriptions.Item label="Age">
            <Tooltip title={formatTimestamp(createdMs)}>{formatAge(createdMs)}</Tooltip>
          </Descriptions.Item>
          <Descriptions.Item label="Strategy" span={2}>
            <Space size={4}>
              <span>
                {strategyType}
                {strategyType === "RollingUpdate" && (
                  <Text type="secondary" style={{ marginLeft: 4 }}>
                    (maxSurge: {maxSurgeValue}, maxUnavailable: {maxUnavailableValue})
                  </Text>
                )}
              </span>
              <Button size="small" type="text" icon={<EditOutlined />} onClick={openStrategyEdit} />
            </Space>
          </Descriptions.Item>
          <Descriptions.Item label="Selector" span={2}>
            {Object.keys(selectorLabels).length === 0 ? (
              <Text type="secondary">-</Text>
            ) : (
              <Space size={[4, 4]} wrap>
                {Object.entries(selectorLabels).map(([k, v]) => (
                  <Tag key={k}>{k}={v}</Tag>
                ))}
              </Space>
            )}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {/* Replicas Card */}
      <Card size="small" title="Replicas">
        <Descriptions size="small" column={2} bordered>
          <Descriptions.Item label="Desired">{desired}</Descriptions.Item>
          <Descriptions.Item label="Ready">
            <Text style={{ color: desired === 0 ? undefined : ready >= desired ? "#52c41a" : "#fa8c16" }}>
              {ready} / {desired}
            </Text>
          </Descriptions.Item>
          <Descriptions.Item label="Updated">{updated}</Descriptions.Item>
          <Descriptions.Item label="Available">{available}</Descriptions.Item>
        </Descriptions>
      </Card>

      {/* Containers Card */}
      <Card size="small" title={`Containers (${containers.length})`}>
        <Table<ContainerRow>
          rowKey="key"
          columns={containerCols}
          dataSource={containers}
          size="small"
          pagination={false}
          components={containerComponents}
          scroll={{ x: "max-content" }}
          locale={{ emptyText: "No containers" }}
        />
      </Card>

      {/* Pods Card */}
      <Card size="small" title={`Pods (${pods.length})`}>
        <Table<PodInfo>
          rowKey="name"
          columns={podCols}
          dataSource={pods}
          loading={podsLoading}
          size="small"
          pagination={false}
          components={podComponents}
          scroll={{ x: "max-content" }}
          locale={{ emptyText: "No pods" }}
        />
      </Card>

      {/* Labels + Annotations */}
      <MetadataEditor
        clusterId={clusterId}
        target={target}
        labels={labels}
        annotations={annotations}
        reload={reload}
        onChanged={onChanged}
      />

      {/* Conditions Card */}
      <Card size="small" title={`Conditions (${conditions.length})`}>
        <Table<ConditionRow>
          rowKey="key"
          columns={conditionCols}
          dataSource={conditions}
          size="small"
          pagination={false}
          components={conditionComponents}
          scroll={{ x: "max-content" }}
          locale={{ emptyText: "No conditions" }}
        />
      </Card>

      {/* Scale Modal */}
      <Modal
        title="Scale Deployment"
        open={scaleOpen}
        onCancel={() => setScaleOpen(false)}
        onOk={handleScale}
        okText="Scale"
        confirmLoading={scaling}
        destroyOnClose
      >
        <Space direction="vertical" style={{ width: "100%", paddingTop: 16 }}>
          <Text>Current replicas: <Text strong>{desired}</Text></Text>
          <InputNumber
            min={0}
            max={1000}
            value={scaleReplicas}
            onChange={(v) => setScaleReplicas(typeof v === "number" ? v : 0)}
            style={{ width: "100%" }}
            autoFocus
          />
        </Space>
      </Modal>

      {/* Strategy Edit Modal */}
      <Modal
        title="Edit Upgrade Strategy"
        open={strategyOpen}
        onCancel={() => setStrategyOpen(false)}
        onOk={handleSaveStrategy}
        okText="Save"
        confirmLoading={savingStrategy}
        destroyOnClose
      >
        <Space direction="vertical" style={{ width: "100%", paddingTop: 16 }} size="middle">
          <div>
            <Text>Strategy Type</Text>
            <Select
              value={draftStrategyType}
              onChange={setDraftStrategyType}
              style={{ width: "100%", marginTop: 4 }}
              options={[
                { value: "RollingUpdate", label: "RollingUpdate" },
                { value: "Recreate", label: "Recreate" },
              ]}
            />
          </div>
          {draftStrategyType === "RollingUpdate" && (
            <>
              <div>
                <Text>Max Surge (e.g. 25% or 1)</Text>
                <Input
                  value={draftMaxSurge}
                  onChange={(e) => setDraftMaxSurge(e.target.value)}
                  style={{ marginTop: 4 }}
                />
              </div>
              <div>
                <Text>Max Unavailable (e.g. 25% or 1)</Text>
                <Input
                  value={draftMaxUnavailable}
                  onChange={(e) => setDraftMaxUnavailable(e.target.value)}
                  style={{ marginTop: 4 }}
                />
              </div>
            </>
          )}
        </Space>
      </Modal>

      {/* Image Edit Modal */}
      <Modal
        title={`Edit Image: ${imageEditCtx?.name}`}
        open={imageEditCtx !== null}
        onCancel={() => setImageEditCtx(null)}
        onOk={handleSaveImage}
        okText="Save"
        confirmLoading={savingImage}
        destroyOnClose
      >
        <Space direction="vertical" style={{ width: "100%", paddingTop: 16 }}>
          <Text>Container: <Text strong>{imageEditCtx?.name}</Text></Text>
          <Input
            value={newImage}
            onChange={(e) => setNewImage(e.target.value)}
            placeholder="image:tag"
            autoFocus
          />
        </Space>
      </Modal>

    </Space>
  );
}
