import { App, Button, Card, Descriptions, Popconfirm, Space, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { ResourceTarget, KubeObject } from "./ResourceDetailDrawer";
import { api } from "../../api";
import { formatAge, formatTimestamp } from "../../utils/format";
import type { PodInfo } from "../../types";
import { useResizableColumns, ResizableHeaderCell } from "../Common/ResizableColumns";
import MetadataEditor from "../Common/MetadataEditor";

const { Text } = Typography;

interface Props {
  obj: KubeObject;
  clusterId: string;
  target: ResourceTarget;
  reload: () => void;
  onChanged?: () => void | Promise<void>;
  onOpenBottomPanel?: (type: "logs" | "terminal") => void;
}


function toMs(s: string | null | undefined): number | null {
  if (!s) return null;
  const ms = Date.parse(s);
  return Number.isNaN(ms) ? null : ms;
}

function phaseColor(phase: string | undefined): string {
  switch (phase) {
    case "Running":
    case "Succeeded":
      return "green";
    case "Pending":
      return "orange";
    case "Failed":
      return "red";
    default:
      return "default";
  }
}

interface ContainerRow {
  key: string;
  name: string;
  image: string;
  ready?: boolean;
  restarts: number;
  state: string;
  reason?: string;
}

interface ConditionRow {
  key: string;
  type: string;
  status: string;
  reason?: string;
  lastTransitionTime?: string;
}

export default function PodOverview({ obj, clusterId, target, reload, onChanged, onOpenBottomPanel }: Props) {
  const { message } = App.useApp();

  const meta = obj?.metadata ?? {};
  const spec = obj?.spec ?? {};
  const status = obj?.status ?? {};

  const containerStatuses: any[] = Array.isArray(status.containerStatuses)
    ? status.containerStatuses
    : [];
  const statusByName = new Map<string, any>(
    containerStatuses.map((cs) => [cs?.name, cs]),
  );

  const restartTotal = containerStatuses.reduce(
    (acc, cs) => acc + (Number(cs?.restartCount) || 0),
    0,
  );

  const containerNames: string[] = (Array.isArray(spec.containers) ? spec.containers : [])
    .map((c: any) => c?.name)
    .filter((n: unknown): n is string => typeof n === "string");

  const handleDelete = async () => {
    if (!target.namespace) {
      message.error("Missing namespace, cannot delete");
      return;
    }
    try {
      await api.deletePod(clusterId, target.namespace, target.name);
      message.success(`Deleted Pod ${target.name}`);
      await onChanged?.();
    } catch (e) {
      message.error(`Delete failed: ${(e as Error).message}`);
    }
  };

  const containerRows: ContainerRow[] = (Array.isArray(spec.containers) ? spec.containers : []).map(
    (c: any, idx: number) => {
      const cs = statusByName.get(c?.name);
      const stateObj = cs?.state ?? {};
      const stateKey = Object.keys(stateObj)[0] ?? "-";
      const reason =
        stateObj?.waiting?.reason ?? stateObj?.terminated?.reason ?? undefined;
      return {
        key: c?.name ?? String(idx),
        name: c?.name ?? "-",
        image: c?.image ?? "-",
        ready: cs?.ready,
        restarts: Number(cs?.restartCount) || 0,
        state: stateKey,
        reason,
      };
    },
  );

  const conditionRows: ConditionRow[] = (
    Array.isArray(status.conditions) ? status.conditions : []
  ).map((c: any, idx: number) => ({
    key: `${c?.type ?? idx}`,
    type: c?.type ?? "-",
    status: c?.status ?? "-",
    reason: c?.reason,
    lastTransitionTime: c?.lastTransitionTime,
  }));

  const containerBaseColumns: ColumnsType<ContainerRow> = [
    { title: "Name", dataIndex: "name", key: "name" },
    { title: "Image", dataIndex: "image", key: "image", ellipsis: true },
    {
      title: "Ready",
      dataIndex: "ready",
      key: "ready",
      width: 80,
      render: (ready?: boolean) =>
        ready == null ? (
          <Tag>-</Tag>
        ) : (
          <Tag color={ready ? "green" : "red"}>{ready ? "True" : "False"}</Tag>
        ),
    },
    { title: "Restarts", dataIndex: "restarts", key: "restarts", width: 90 },
    {
      title: "State",
      key: "state",
      render: (_: unknown, r: ContainerRow) =>
        r.reason ? `${r.state} (${r.reason})` : r.state,
    },
  ];

  const conditionBaseColumns: ColumnsType<ConditionRow> = [
    { title: "Type", dataIndex: "type", key: "type" },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      width: 90,
      render: (s: string) => (
        <Tag color={s === "True" ? "green" : s === "False" ? "red" : "default"}>{s}</Tag>
      ),
    },
    {
      title: "Reason",
      dataIndex: "reason",
      key: "reason",
      render: (r?: string) => r ?? "-",
    },
    {
      title: "Last Transition",
      dataIndex: "lastTransitionTime",
      key: "lastTransitionTime",
      width: 160,
      render: (t?: string) => formatTimestamp(toMs(t)),
    },
  ];

  const { columns: resizableContainerColumns } = useResizableColumns("detail-pod-containers", containerBaseColumns);
  const { columns: resizableConditionColumns } = useResizableColumns("detail-pod-conditions", conditionBaseColumns);

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Card
        size="small"
        title="Status"
        extra={
          <Space>
            <Button
              size="small"
              disabled={!target.namespace}
              onClick={() => onOpenBottomPanel?.("logs")}
            >
              Logs
            </Button>
            <Button
              size="small"
              disabled={!target.namespace || containerNames.length === 0}
              onClick={() => onOpenBottomPanel?.("terminal")}
            >
              Terminal
            </Button>
            <Popconfirm
              title="Delete this Pod?"
              okText="Delete"
              okButtonProps={{ danger: true }}
              cancelText="Cancel"
              onConfirm={handleDelete}
            >
              <Button size="small" danger>
                Delete
              </Button>
            </Popconfirm>
          </Space>
        }
      >
        <Descriptions size="small" column={2} bordered>
          <Descriptions.Item label="Phase">
            <Tag color={phaseColor(status.phase)}>{status.phase ?? "-"}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="QoS">{status.qosClass ?? "-"}</Descriptions.Item>
          <Descriptions.Item label="Pod IP">{status.podIP ?? "-"}</Descriptions.Item>
          <Descriptions.Item label="Host IP">{status.hostIP ?? "-"}</Descriptions.Item>
          <Descriptions.Item label="Node">{spec.nodeName ?? "-"}</Descriptions.Item>
          <Descriptions.Item label="Restarts">{restartTotal}</Descriptions.Item>
          <Descriptions.Item label="Start Time">
            {formatTimestamp(toMs(status.startTime))}
          </Descriptions.Item>
          <Descriptions.Item label="Age">
            {formatAge(toMs(meta.creationTimestamp))}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card size="small" title="Containers">
        <Table<ContainerRow>
          size="small"
          dataSource={containerRows}
          pagination={false}
          components={{ header: { cell: ResizableHeaderCell } }}
          scroll={{ x: "max-content" }}
          columns={resizableContainerColumns}
        />
      </Card>

      <Card size="small" title="Conditions">
        <Table<ConditionRow>
          size="small"
          dataSource={conditionRows}
          pagination={false}
          components={{ header: { cell: ResizableHeaderCell } }}
          scroll={{ x: "max-content" }}
          columns={resizableConditionColumns}
        />
      </Card>

      <MetadataEditor
        clusterId={clusterId}
        target={target}
        labels={meta.labels ?? {}}
        annotations={meta.annotations ?? {}}
        reload={reload}
        onChanged={onChanged}
      />
    </Space>
  );
}
