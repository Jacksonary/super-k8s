import { useCallback, useEffect, useState } from "react";
import { Button, Card, Empty, Space, Table, Tag, Typography, App as AntdApp } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { api } from "../api";
import { useClusterStore } from "../store/clusterStore";
import type { NodeInfo } from "../types";
import { formatAge } from "../utils/format";

const { Text } = Typography;

export default function Nodes() {
  const { currentClusterId } = useClusterStore();
  const { message } = AntdApp.useApp();

  const [nodes, setNodes] = useState<NodeInfo[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!currentClusterId) return;
    setLoading(true);
    try {
      const data = await api.listNodes(currentClusterId);
      setNodes(data);
    } catch (err) {
      message.error(String(err));
    } finally {
      setLoading(false);
    }
  }, [currentClusterId, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: ColumnsType<NodeInfo> = [
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
      width: 120,
      render: (status: string, record) => (
        <Tag color={record.ready ? "green" : "red"}>{status}</Tag>
      ),
    },
    {
      title: "Roles",
      dataIndex: "roles",
      key: "roles",
      width: 200,
      render: (roles: string[]) =>
        roles.length === 0 ? (
          <Text type="secondary">&lt;none&gt;</Text>
        ) : (
          <Space size={4} wrap>
            {roles.map((r) => (
              <Tag key={r} bordered={false}>
                {r}
              </Tag>
            ))}
          </Space>
        ),
    },
    { title: "Version", dataIndex: "version", key: "version", width: 140 },
    {
      title: "Internal IP",
      dataIndex: "internal_ip",
      key: "internal_ip",
      width: 160,
      render: (ip: string) => <Text code>{ip || "-"}</Text>,
    },
    { title: "CPU", dataIndex: "cpu_capacity", key: "cpu_capacity", width: 100, align: "right" },
    {
      title: "Memory",
      dataIndex: "memory_capacity",
      key: "memory_capacity",
      width: 140,
      align: "right",
    },
    {
      title: "Age",
      dataIndex: "age_ms",
      key: "age_ms",
      width: 110,
      align: "right",
      sorter: (a, b) => a.age_ms - b.age_ms,
      render: (ms: number) => formatAge(ms),
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
      title="Nodes"
      style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
      styles={{ body: { flex: 1, minHeight: 0, overflow: "hidden", padding: 0 } }}
      extra={
        <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
          Refresh
        </Button>
      }
    >
      <Table<NodeInfo>
        size="small"
        rowKey="name"
        dataSource={nodes}
        columns={columns}
        loading={loading}
        pagination={{ defaultPageSize: 20, showSizeChanger: true, showTotal: (t) => `Total ${t}` }}
        locale={{ emptyText: <Empty description="No nodes" /> }}
        scroll={{ y: "max(200px, calc(100vh - 240px))" }}
      />
    </Card>
  );
}
