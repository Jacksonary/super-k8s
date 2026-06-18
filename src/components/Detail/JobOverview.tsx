import { App, Button, Card, Descriptions, Popconfirm, Space, Tag, Tooltip, Typography } from "antd";
import type { ResourceTarget, KubeObject } from "./ResourceDetailDrawer";
import { api } from "../../api";
import { formatAge, formatTimestamp } from "../../utils/format";
import MetadataEditor from "../Common/MetadataEditor";

const { Text } = Typography;

interface Props {
  obj: KubeObject;
  clusterId: string;
  target: ResourceTarget;
  reload: () => void;
  onChanged?: () => void | Promise<void>;
}

function toMs(ts: unknown): number | null {
  if (typeof ts !== "string" || !ts) return null;
  const ms = Date.parse(ts);
  return Number.isNaN(ms) ? null : ms;
}

export default function JobOverview({ obj, clusterId, target, reload, onChanged }: Props) {
  const { message } = App.useApp();

  const meta = obj?.metadata ?? {};
  const spec = obj?.spec ?? {};
  const status = obj?.status ?? {};

  const createdMs = toMs(meta.creationTimestamp);
  const startMs = toMs(status.startTime);
  const completionMs = toMs(status.completionTime);

  const succeeded: number = status.succeeded ?? 0;
  const failed: number = status.failed ?? 0;
  const active: number = status.active ?? 0;
  const completions: number | null = spec.completions ?? null;

  const isComplete = (status.conditions ?? []).some(
    (c: KubeObject) => c?.type === "Complete" && c?.status === "True",
  );
  const isFailed = (status.conditions ?? []).some(
    (c: KubeObject) => c?.type === "Failed" && c?.status === "True",
  );

  const statusTag = active > 0
    ? <Tag color="blue">Running</Tag>
    : isComplete ? <Tag color="green">Complete</Tag>
    : isFailed ? <Tag color="red">Failed</Tag>
    : <Tag color="default">Pending</Tag>;

  const labels: Record<string, string> = meta.labels ?? {};
  const annotations: Record<string, string> = meta.annotations ?? {};

  const handleDelete = async () => {
    try {
      await api.deleteResource(clusterId, target.apiVersion, target.kind, target.namespace, target.name);
      message.success(`Deleted Job ${target.name}`);
      await onChanged?.();
    } catch (e) {
      message.error(`Delete failed: ${(e as Error).message}`);
    }
  };

  return (
    <Space direction="vertical" size="middle" style={{ display: "flex" }}>

      {/* Overview */}
      <Card
        size="small"
        title="Overview"
        extra={
          <Popconfirm title="Delete this Job?" okText="Delete" okButtonProps={{ danger: true }}
            cancelText="Cancel" onConfirm={handleDelete}>
            <Button size="small" danger>Delete</Button>
          </Popconfirm>
        }
      >
        <Descriptions size="small" column={2} bordered>
          <Descriptions.Item label="Name">{meta.name ?? "-"}</Descriptions.Item>
          <Descriptions.Item label="Namespace">{meta.namespace ?? "-"}</Descriptions.Item>
          <Descriptions.Item label="Status">{statusTag}</Descriptions.Item>
          <Descriptions.Item label="Age">
            <Tooltip title={formatTimestamp(createdMs)}>{formatAge(createdMs)}</Tooltip>
          </Descriptions.Item>
          <Descriptions.Item label="Completions">
            {succeeded} / {completions ?? "∞"}
          </Descriptions.Item>
          <Descriptions.Item label="Parallelism">{spec.parallelism ?? 1}</Descriptions.Item>
          <Descriptions.Item label="Active">{active}</Descriptions.Item>
          <Descriptions.Item label="Failed">
            {failed > 0 ? <Text type="danger">{failed}</Text> : failed}
          </Descriptions.Item>
          <Descriptions.Item label="Start Time">
            <Tooltip title={formatTimestamp(startMs)}>{startMs ? formatAge(startMs) : "-"}</Tooltip>
          </Descriptions.Item>
          <Descriptions.Item label="Completion Time">
            {completionMs
              ? <Tooltip title={formatTimestamp(completionMs)}>{formatAge(completionMs)}</Tooltip>
              : <Text type="secondary">-</Text>}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <MetadataEditor
        clusterId={clusterId}
        target={target}
        labels={labels}
        annotations={annotations}
        reload={reload}
        onChanged={onChanged}
      />

    </Space>
  );
}
