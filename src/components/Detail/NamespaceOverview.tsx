import { useMemo, useState } from "react";
import {
  Alert,
  App,
  Button,
  Card,
  Descriptions,
  Empty,
  Input,
  Modal,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import type { ResourceTarget, KubeObject } from "./ResourceDetailDrawer";
import { api } from "../../api";
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

interface ConditionRow {
  key: string;
  type: string;
  status: string;
  reason: string;
  message: string;
  lastTransitionTime: string;
}

const SYSTEM_NAMESPACES = new Set(["default", "kube-system", "kube-public", "kube-node-lease"]);

function toMs(ts: string | null | undefined): number | null {
  if (!ts) return null;
  const ms = Date.parse(ts);
  return Number.isNaN(ms) ? null : ms;
}

function phaseColor(phase: string | undefined): string {
  switch (phase) {
    case "Active":
      return "green";
    case "Terminating":
      return "orange";
    default:
      return "default";
  }
}

function conditionColor(status: string): string {
  switch (status) {
    case "True":
      return "green";
    case "False":
      return "default";
    default:
      return "orange";
  }
}

function LongTextCell({ value, code = false }: { value: string; code?: boolean }) {
  const content = value || "-";
  return (
    <Tooltip title={content}>
      <Text code={code} ellipsis style={{ display: "block", maxWidth: "100%" }}>
        {content}
      </Text>
    </Tooltip>
  );
}

export default function NamespaceOverview({
  obj,
  clusterId,
  target,
  reload,
  onChanged,
}: Props) {
  const { message } = App.useApp();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const metadata = obj?.metadata ?? {};
  const phase: string | undefined = obj?.status?.phase;
  const createdMs = toMs(metadata?.creationTimestamp);

  const labels: Record<string, string> = metadata?.labels ?? {};
  const annotations: Record<string, string> = metadata?.annotations ?? {};
  const finalizers: string[] = obj?.spec?.finalizers ?? [];
  const conditions: any[] = Array.isArray(obj?.status?.conditions) ? obj.status.conditions : [];
  const isSystemNamespace = SYSTEM_NAMESPACES.has(target.name);
  const isTerminating = phase === "Terminating";

  const conditionRows: ConditionRow[] = useMemo(
    () =>
      conditions.map((condition, index) => ({
        key: `${condition?.type ?? index}`,
        type: condition?.type ?? "-",
        status: condition?.status ?? "-",
        reason: condition?.reason ?? "-",
        message: condition?.message ?? "-",
        lastTransitionTime: condition?.lastTransitionTime ?? "-",
      })),
    [conditions],
  );

  const conditionColumns: ColumnsType<ConditionRow> = [
    {
      title: "Type",
      dataIndex: "type",
      key: "type",
      width: 180,
      ellipsis: true,
      render: (value: string) => <LongTextCell value={value} />,
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      width: 90,
      render: (status: string) => <Tag color={conditionColor(status)}>{status}</Tag>,
    },
    {
      title: "Reason",
      dataIndex: "reason",
      key: "reason",
      width: 180,
      ellipsis: true,
      render: (value: string) => <LongTextCell value={value} />,
    },
    {
      title: "Message",
      dataIndex: "message",
      key: "message",
      ellipsis: true,
      render: (value: string) => <LongTextCell value={value} />,
    },
    {
      title: "Last Transition",
      dataIndex: "lastTransitionTime",
      key: "lastTransitionTime",
      width: 170,
      render: (value: string) => {
        const ms = toMs(value);
        return ms != null ? formatTimestamp(ms) : "-";
      },
    },
  ];

  const { columns: resizableConditionColumns } = useResizableColumns("detail-ns-conditions", conditionColumns);

  const handleDelete = async () => {
    if (deleteText !== target.name) return;
    setDeleting(true);
    try {
      await api.deleteResource(clusterId, target.apiVersion, target.kind, target.namespace, target.name);
      message.success(`Deleted Namespace ${target.name}`);
      setDeleteOpen(false);
      setDeleteText("");
      reload();
      await onChanged?.();
    } catch (error) {
      message.error(`Delete failed: ${(error as Error).message}`);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      {isTerminating && finalizers.length > 0 && (
        <Alert
          type="warning"
          showIcon
          message="Namespace is terminating"
          description="Deletion is waiting for finalizers to complete. Workloads in this namespace may still be cleaning up."
        />
      )}

      {isSystemNamespace && (
        <Alert
          type="warning"
          showIcon
          message="System namespace"
          description="Deleting this namespace can break cluster components. Proceed only if you know exactly what depends on it."
        />
      )}

      <Card
        size="small"
        title="Status"
        extra={
          <Button size="small" danger onClick={() => setDeleteOpen(true)} loading={deleting}>
            Delete
          </Button>
        }
      >
        <Descriptions column={2} size="small" bordered>
          <Descriptions.Item label="Name">
            <LongTextCell value={metadata?.name ?? target.name} code />
          </Descriptions.Item>
          <Descriptions.Item label="Phase">
            {phase ? <Tag color={phaseColor(phase)}>{phase}</Tag> : "-"}
          </Descriptions.Item>
          <Descriptions.Item label="Age">{createdMs != null ? formatAge(createdMs) : "-"}</Descriptions.Item>
          <Descriptions.Item label="Created">
            {createdMs != null ? formatTimestamp(createdMs) : "-"}
          </Descriptions.Item>
          <Descriptions.Item label="UID" span={2}>
            <LongTextCell value={metadata?.uid ?? "-"} />
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

      <Card size="small" title="Lifecycle">
        {finalizers.length > 0 ? (
          <Space size={[4, 8]} wrap style={{ maxWidth: "100%" }}>
            {finalizers.map((finalizer) => (
              <Tag key={finalizer} color="blue" style={{ maxWidth: "100%" }}>
                <span style={{ display: "inline-block", maxWidth: 620, overflow: "hidden", textOverflow: "ellipsis", verticalAlign: "bottom" }}>
                  {finalizer}
                </span>
              </Tag>
            ))}
          </Space>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No finalizers" />
        )}
      </Card>

      <Card size="small" title="Conditions">
        <Table<ConditionRow>
          size="small"
          rowKey="key"
          dataSource={conditionRows}
          columns={resizableConditionColumns}
          pagination={false}
          locale={{ emptyText: "No conditions" }}
          components={{ header: { cell: ResizableHeaderCell } }}
          scroll={{ x: "max-content" }}
        />
      </Card>

      <Modal
        title="Delete Namespace"
        open={deleteOpen}
        okText="Delete"
        okButtonProps={{ danger: true, disabled: deleteText !== target.name }}
        confirmLoading={deleting}
        onOk={handleDelete}
        onCancel={() => {
          if (deleting) return;
          setDeleteOpen(false);
          setDeleteText("");
        }}
        destroyOnClose
      >
        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          <Alert
            type="error"
            showIcon
            message="This will delete the namespace and all resources in it."
            description="This action cannot be undone. Type the namespace name to confirm."
          />
          <Input
            autoFocus
            placeholder={target.name}
            value={deleteText}
            onChange={(event) => setDeleteText(event.target.value)}
          />
        </Space>
      </Modal>
    </Space>
  );
}
