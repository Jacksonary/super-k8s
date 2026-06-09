import { useCallback, useEffect, useState } from "react";
import { Button, Card, Empty, Space, Table, Tag, Typography, App as AntdApp } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { api } from "../api";
import { useClusterStore } from "../store/clusterStore";
import type { ServiceInfo } from "../types";
import { formatAge } from "../utils/format";

const { Text } = Typography;

export default function Services() {
  const { currentClusterId, currentNamespace } = useClusterStore();
  const { message } = AntdApp.useApp();

  const [services, setServices] = useState<ServiceInfo[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!currentClusterId) return;
    setLoading(true);
    try {
      const data = await api.listServices(currentClusterId, currentNamespace || null);
      setServices(data);
    } catch (err) {
      message.error(String(err));
    } finally {
      setLoading(false);
    }
  }, [currentClusterId, currentNamespace, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: ColumnsType<ServiceInfo> = [
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
      title: "Type",
      dataIndex: "svc_type",
      key: "svc_type",
      width: 140,
      render: (t: string) => <Tag>{t}</Tag>,
    },
    {
      title: "Cluster IP",
      dataIndex: "cluster_ip",
      key: "cluster_ip",
      width: 150,
      render: (ip: string) => <Text code>{ip || "-"}</Text>,
    },
    {
      title: "External IP",
      dataIndex: "external_ip",
      key: "external_ip",
      width: 150,
      render: (ip: string | null) => (ip ? <Text code>{ip}</Text> : <Text type="secondary">-</Text>),
    },
    {
      title: "Ports",
      dataIndex: "ports",
      key: "ports",
      render: (ports: string[]) =>
        ports.length === 0 ? (
          <Text type="secondary">-</Text>
        ) : (
          <Space size={4} wrap>
            {ports.map((p, i) => (
              <Tag key={`${p}-${i}`} bordered={false}>
                {p}
              </Tag>
            ))}
          </Space>
        ),
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
      title="Services"
      style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
      styles={{ body: { flex: 1, minHeight: 0, overflow: "hidden", padding: 0 } }}
      extra={
        <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
          Refresh
        </Button>
      }
    >
      <Table<ServiceInfo>
        size="small"
        rowKey={(r) => `${r.namespace}/${r.name}`}
        dataSource={services}
        columns={columns}
        loading={loading}
        pagination={{ defaultPageSize: 20, showSizeChanger: true, showTotal: (t) => `Total ${t}` }}
        locale={{ emptyText: <Empty description="No services" /> }}
        scroll={{ y: "max(200px, calc(100vh - 240px))" }}
      />
    </Card>
  );
}
