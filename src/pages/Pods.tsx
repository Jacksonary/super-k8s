import { useCallback, useEffect, useState } from "react";
import { Button, Card, Empty, Popconfirm, Space, Table, Tag, Typography, App as AntdApp } from "antd";
import { DeleteOutlined, FileTextOutlined, ReloadOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { api } from "../api";
import { useClusterStore } from "../store/clusterStore";
import { useSettings } from "../store/settingsStore";
import type { PodInfo } from "../types";
import { formatAge } from "../utils/format";
import PodLogsDrawer from "../components/Pod/PodLogsDrawer";

const { Text } = Typography;

function phaseColor(status: string): string {
  switch (status) {
    case "Running":
    case "Succeeded":
      return "green";
    case "Pending":
    case "ContainerCreating":
      return "orange";
    case "Failed":
    case "CrashLoopBackOff":
    case "Error":
      return "red";
    default:
      return "default";
  }
}

export default function Pods() {
  const { currentClusterId, currentNamespace } = useClusterStore();
  const { config } = useSettings();
  const { message } = AntdApp.useApp();

  const [pods, setPods] = useState<PodInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [logsPod, setLogsPod] = useState<PodInfo | null>(null);
  const [logsOpen, setLogsOpen] = useState(false);

  const load = useCallback(async () => {
    if (!currentClusterId) return;
    setLoading(true);
    try {
      const data = await api.listPods(currentClusterId, currentNamespace || null);
      setPods(data);
    } catch (err) {
      message.error(String(err));
    } finally {
      setLoading(false);
    }
  }, [currentClusterId, currentNamespace, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDelete = useCallback(
    async (pod: PodInfo) => {
      if (!currentClusterId) return;
      try {
        await api.deletePod(currentClusterId, pod.namespace, pod.name);
        message.success(`Pod "${pod.name}" deleted`);
        void load();
      } catch (err) {
        message.error(String(err));
      }
    },
    [currentClusterId, load, message],
  );

  const openLogs = useCallback((pod: PodInfo) => {
    setLogsPod(pod);
    setLogsOpen(true);
  }, []);

  const columns: ColumnsType<PodInfo> = [
    {
      title: "Namespace",
      dataIndex: "namespace",
      key: "namespace",
      width: 160,
      sorter: (a, b) => a.namespace.localeCompare(b.namespace),
      render: (ns: string) => <Text type="secondary">{ns}</Text>,
    },
    {
      title: "Name",
      dataIndex: "name",
      key: "name",
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (name: string) => <Text strong>{name}</Text>,
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      width: 150,
      render: (status: string) => <Tag color={phaseColor(status)}>{status}</Tag>,
    },
    { title: "Ready", dataIndex: "ready", key: "ready", width: 90, align: "center" },
    {
      title: "Restarts",
      dataIndex: "restarts",
      key: "restarts",
      width: 100,
      align: "right",
      sorter: (a, b) => a.restarts - b.restarts,
    },
    { title: "Node", dataIndex: "node", key: "node", width: 180, ellipsis: true },
    {
      title: "Pod IP",
      dataIndex: "pod_ip",
      key: "pod_ip",
      width: 150,
      render: (ip: string) => <Text code>{ip || "-"}</Text>,
    },
    {
      title: "Age",
      dataIndex: "age_ms",
      key: "age_ms",
      width: 100,
      align: "right",
      sorter: (a, b) => a.age_ms - b.age_ms,
      render: (ms: number) => formatAge(ms),
    },
    {
      title: "",
      key: "actions",
      width: 110,
      align: "right",
      render: (_, record) => (
        <Space size={2} onClick={(e) => e.stopPropagation()}>
          <Button
            type="text"
            size="small"
            icon={<FileTextOutlined />}
            onClick={() => openLogs(record)}
          />
          <Popconfirm
            title={`Delete pod "${record.name}"?`}
            description="This action cannot be undone."
            okText="Delete"
            okButtonProps={{ danger: true }}
            onConfirm={() => handleDelete(record)}
          >
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  if (!currentClusterId) {
    return (
      <Card style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <Empty description="No cluster selected. Choose one from the sidebar." />
      </Card>
    );
  }

  return (
    <Card
      title="Pods"
      style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
      styles={{ body: { flex: 1, minHeight: 0, overflow: "hidden", padding: 0 } }}
      extra={
        <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
          Refresh
        </Button>
      }
    >
      <Table<PodInfo>
        size="small"
        rowKey={(r) => `${r.namespace}/${r.name}`}
        dataSource={pods}
        columns={columns}
        loading={loading}
        pagination={{ defaultPageSize: 20, showSizeChanger: true, showTotal: (t) => `Total ${t}` }}
        locale={{ emptyText: <Empty description="No pods" /> }}
        scroll={{ y: "max(200px, calc(100vh - 240px))" }}
      />

      <PodLogsDrawer
        open={logsOpen}
        clusterId={currentClusterId}
        pod={logsPod}
        defaultTailLines={config.log_tail_lines_default}
        onClose={() => setLogsOpen(false)}
      />
    </Card>
  );
}
