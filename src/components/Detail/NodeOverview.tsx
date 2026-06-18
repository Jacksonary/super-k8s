import { useEffect, useMemo, useState } from "react";
import { App, Button, Card, Descriptions, Popconfirm, Space, Table, Tag, Tooltip, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { api } from "../../api";
import { useClusterStore } from "../../store/clusterStore";
import type { PodInfo } from "../../types";
import type { ResourceTarget, KubeObject } from "./ResourceDetailDrawer";
import { formatAge, formatTimestamp } from "../../utils/format";
import { useResizableColumns, ResizableHeaderCell } from "../Common/ResizableColumns";
import MetadataEditor from "../Common/MetadataEditor";

const { Text } = Typography;

interface Props {
  obj: KubeObject;
  clusterId: string;
  target: ResourceTarget;
  reload: () => void;
  onChanged?: () => void | Promise<void>;
}

const ROLE_PREFIX = "node-role.kubernetes.io/";

function tsToMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

interface ConditionRow {
  key: string;
  type: string;
  status: string;
  reason: string;
  message: string;
  lastTransitionTime: string;
}

interface ResourceRow {
  key: string;
  resource: string;
  capacity: string;
  allocatable: string;
}

interface TaintRow {
  key: string;
  taintKey: string;
  value: string;
  effect: string;
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

export default function NodeOverview({ obj, clusterId, target, reload, onChanged }: Props) {
  const { message } = App.useApp();
  const { currentNamespace } = useClusterStore();

  const metadata = obj?.metadata ?? {};
  const status = obj?.status ?? {};
  const spec = obj?.spec ?? {};

  const unschedulable: boolean = spec.unschedulable === true;
  const [cordoning, setCordoning] = useState(false);

  const [pods, setPods] = useState<PodInfo[]>([]);
  const [podsLoading, setPodsLoading] = useState(false);

  const handleCordon = async () => {
    setCordoning(true);
    try {
      await api.cordonNode(clusterId, target.name, !unschedulable);
      message.success(unschedulable ? "Uncordoned" : "Cordoned");
      reload();
    } catch (e) {
      message.error(`${unschedulable ? "Uncordon" : "Cordon"} failed: ${(e as Error).message}`);
    } finally {
      setCordoning(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    setPodsLoading(true);
    api
      .listNodePods(clusterId, target.name, currentNamespace || null)
      .then((rows) => {
        if (!cancelled) setPods(Array.isArray(rows) ? rows : []);
      })
      .catch((e) => {
        if (!cancelled) {
          setPods([]);
          message.error(`Failed to load pods: ${(e as Error).message}`);
        }
      })
      .finally(() => {
        if (!cancelled) setPodsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clusterId, target.name, currentNamespace]);

  const podColumns: ColumnsType<PodInfo> = [
    { title: "Namespace", dataIndex: "namespace", key: "namespace", width: 160, ellipsis: true },
    { title: "Name", dataIndex: "name", key: "name", ellipsis: true },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      width: 120,
      render: (s: string) => <Tag color={podStatusColor(s)}>{s ?? "-"}</Tag>,
    },
    { title: "Ready", dataIndex: "ready", key: "ready", width: 80 },
    { title: "Restarts", dataIndex: "restarts", key: "restarts", width: 90 },
    {
      title: "Age",
      dataIndex: "age_ms",
      key: "age_ms",
      width: 90,
      render: (ms: number) => formatAge(ms),
    },
  ];

  const labels: Record<string, string> = metadata.labels ?? {};
  const annotations: Record<string, string> = metadata.annotations ?? {};

  const conditions: any[] = Array.isArray(status.conditions) ? status.conditions : [];
  const readyCond = conditions.find((c) => c?.type === "Ready");
  const isReady = readyCond?.status === "True";

  const roles = useMemo(
    () =>
      Object.keys(labels)
        .filter((k) => k.startsWith(ROLE_PREFIX))
        .map((k) => k.slice(ROLE_PREFIX.length) || "<none>"),
    [labels],
  );

  const nodeInfo = status.nodeInfo ?? {};
  const addresses: any[] = Array.isArray(status.addresses) ? status.addresses : [];
  const addrByType = (type: string) =>
    addresses.find((a) => a?.type === type)?.address ?? "-";
  const internalIp = addrByType("InternalIP");
  const externalIp = addrByType("ExternalIP");

  const ageMs = tsToMs(metadata.creationTimestamp);

  const capacity: Record<string, string> = status.capacity ?? {};
  const allocatable: Record<string, string> = status.allocatable ?? {};
  const resourceRows: ResourceRow[] = useMemo(() => {
    const keys = ["cpu", "memory", "pods", "ephemeral-storage"];
    return keys
      .filter((k) => capacity[k] != null || allocatable[k] != null)
      .map((k) => ({
        key: k,
        resource: k,
        capacity: capacity[k] ?? "-",
        allocatable: allocatable[k] ?? "-",
      }));
  }, [capacity, allocatable]);

  const conditionRows: ConditionRow[] = conditions.map((c, i) => ({
    key: `${c?.type ?? i}`,
    type: c?.type ?? "-",
    status: c?.status ?? "-",
    reason: c?.reason ?? "-",
    message: c?.message ?? "-",
    lastTransitionTime: c?.lastTransitionTime ?? "-",
  }));

  const taints: any[] = Array.isArray(spec.taints) ? spec.taints : [];
  const taintRows: TaintRow[] = taints.map((t, i) => ({
    key: `${t?.key ?? i}-${t?.effect ?? ""}`,
    taintKey: t?.key ?? "-",
    value: t?.value ?? "-",
    effect: t?.effect ?? "-",
  }));

  const resourceColumns: ColumnsType<ResourceRow> = [
    { title: "Resource", dataIndex: "resource", key: "resource" },
    { title: "Capacity", dataIndex: "capacity", key: "capacity", align: "right" },
    { title: "Allocatable", dataIndex: "allocatable", key: "allocatable", align: "right" },
  ];

  const conditionColumns: ColumnsType<ConditionRow> = [
    { title: "Type", dataIndex: "type", key: "type", width: 160 },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      width: 90,
      render: (s: string) => {
        const color = s === "True" ? "green" : s === "False" ? "default" : "orange";
        return <Tag color={color}>{s}</Tag>;
      },
    },
    { title: "Reason", dataIndex: "reason", key: "reason", width: 180, ellipsis: true },
    {
      title: "Message",
      dataIndex: "message",
      key: "message",
      ellipsis: true,
      render: (m: string) =>
        m && m !== "-" ? (
          <Tooltip title={m}>
            <span>{m}</span>
          </Tooltip>
        ) : (
          "-"
        ),
    },
    {
      title: "Last Transition",
      dataIndex: "lastTransitionTime",
      key: "lastTransitionTime",
      width: 170,
      render: (iso: string) => {
        const ms = tsToMs(iso);
        return ms ? formatTimestamp(ms) : "-";
      },
    },
  ];

  const taintColumns: ColumnsType<TaintRow> = [
    { title: "Key", dataIndex: "taintKey", key: "taintKey" },
    { title: "Value", dataIndex: "value", key: "value" },
    { title: "Effect", dataIndex: "effect", key: "effect", width: 180 },
  ];

  const { columns: resizableConditionColumns } = useResizableColumns("detail-node-conditions", conditionColumns);
  const { columns: resizablePodColumns } = useResizableColumns("detail-node-pods", podColumns);

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Card size="small" title="Actions">
        <Space wrap>
          {unschedulable ? (
            <Button loading={cordoning} onClick={handleCordon}>
              Uncordon
            </Button>
          ) : (
            <Popconfirm
              title="Cordon this node?"
              description="This node will be marked unschedulable."
              onConfirm={handleCordon}
              okText="Cordon"
              cancelText="Cancel"
            >
              <Button danger loading={cordoning}>
                Cordon
              </Button>
            </Popconfirm>
          )}
          {unschedulable && <Tag color="orange">SchedulingDisabled</Tag>}
        </Space>
      </Card>

      <Card size="small" title="Status">
        <Descriptions size="small" column={2} bordered>
          <Descriptions.Item label="Ready">
            <Tag color={isReady ? "green" : "red"}>{isReady ? "Ready" : "NotReady"}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="Roles">
            {roles.length === 0 ? (
              <Text type="secondary">&lt;none&gt;</Text>
            ) : (
              <Space size={4} wrap>
                {roles.map((r) => (
                  <Tag key={r} bordered={false}>
                    {r}
                  </Tag>
                ))}
              </Space>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="Kubelet Version">
            {nodeInfo.kubeletVersion ?? "-"}
          </Descriptions.Item>
          <Descriptions.Item label="Container Runtime">
            {nodeInfo.containerRuntimeVersion ?? "-"}
          </Descriptions.Item>
          <Descriptions.Item label="OS Image">{nodeInfo.osImage ?? "-"}</Descriptions.Item>
          <Descriptions.Item label="Kernel Version">
            {nodeInfo.kernelVersion ?? "-"}
          </Descriptions.Item>
          <Descriptions.Item label="Internal IP">
            <Text code>{internalIp}</Text>
          </Descriptions.Item>
          <Descriptions.Item label="External IP">
            {externalIp === "-" ? "-" : <Text code>{externalIp}</Text>}
          </Descriptions.Item>
          <Descriptions.Item label="Age">{formatAge(ageMs)}</Descriptions.Item>
          <Descriptions.Item label="Created">{formatTimestamp(ageMs)}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card size="small" title="Capacity / Allocatable">
        <Table<ResourceRow>
          size="small"
          rowKey="key"
          columns={resourceColumns}
          dataSource={resourceRows}
          pagination={false}
          locale={{ emptyText: "No resource data" }}
        />
      </Card>

      <Card size="small" title="Conditions">
        <Table<ConditionRow>
          size="small"
          rowKey="key"
          columns={resizableConditionColumns}
          dataSource={conditionRows}
          pagination={false}
          locale={{ emptyText: "No conditions" }}
          components={{ header: { cell: ResizableHeaderCell } }}
          scroll={{ x: "max-content" }}
        />
      </Card>

      <Card size="small" title="Taints">
        <Table<TaintRow>
          size="small"
          rowKey="key"
          columns={taintColumns}
          dataSource={taintRows}
          pagination={false}
          locale={{ emptyText: "No taints" }}
        />
      </Card>

      <Card size="small" title={`Pods on this node (${pods.length})`}>
        <Table<PodInfo>
          size="small"
          rowKey={(r) => `${r.namespace}/${r.name}`}
          columns={resizablePodColumns}
          dataSource={pods}
          loading={podsLoading}
          pagination={false}
          locale={{ emptyText: "No pods" }}
          components={{ header: { cell: ResizableHeaderCell } }}
          scroll={{ x: "max-content" }}
        />
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
