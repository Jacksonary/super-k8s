import { useCallback, useEffect, useState } from "react";
import { Button, Card, Empty, Table, Tag, Typography, App as AntdApp } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { api } from "../api";
import { useClusterStore } from "../store/clusterStore";
import type { NamespaceInfo } from "../types";
import { formatAge } from "../utils/format";

const { Text } = Typography;

export default function Namespaces() {
  const { currentClusterId } = useClusterStore();
  const { message } = AntdApp.useApp();

  const [namespaces, setNamespaces] = useState<NamespaceInfo[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!currentClusterId) return;
    setLoading(true);
    try {
      const data = await api.listNamespaces(currentClusterId);
      setNamespaces(data);
    } catch (err) {
      message.error(String(err));
    } finally {
      setLoading(false);
    }
  }, [currentClusterId, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: ColumnsType<NamespaceInfo> = [
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
      width: 160,
      render: (status: string) => (
        <Tag color={status === "Active" ? "green" : "orange"}>{status}</Tag>
      ),
    },
    {
      title: "Age",
      dataIndex: "age_ms",
      key: "age_ms",
      width: 120,
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
      title="Namespaces"
      style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
      styles={{ body: { flex: 1, minHeight: 0, overflow: "hidden", padding: 0 } }}
      extra={
        <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
          Refresh
        </Button>
      }
    >
      <Table<NamespaceInfo>
        size="small"
        rowKey="name"
        dataSource={namespaces}
        columns={columns}
        loading={loading}
        pagination={{ defaultPageSize: 20, showSizeChanger: true, showTotal: (t) => `Total ${t}` }}
        locale={{ emptyText: <Empty description="No namespaces" /> }}
        scroll={{ y: "max(200px, calc(100vh - 240px))" }}
      />
    </Card>
  );
}
