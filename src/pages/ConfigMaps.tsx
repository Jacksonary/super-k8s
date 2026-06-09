import { useCallback, useEffect, useState } from "react";
import { Button, Card, Empty, Space, Table, Tag, Tooltip, Typography, App as AntdApp } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { api } from "../api";
import { useClusterStore } from "../store/clusterStore";
import type { ConfigMapInfo } from "../types";
import { formatAge } from "../utils/format";

const { Text } = Typography;

export default function ConfigMaps() {
  const { currentClusterId, currentNamespace } = useClusterStore();
  const { message } = AntdApp.useApp();

  const [configmaps, setConfigmaps] = useState<ConfigMapInfo[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!currentClusterId) return;
    setLoading(true);
    try {
      const data = await api.listConfigmaps(currentClusterId, currentNamespace || null);
      setConfigmaps(data);
    } catch (err) {
      message.error(String(err));
    } finally {
      setLoading(false);
    }
  }, [currentClusterId, currentNamespace, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: ColumnsType<ConfigMapInfo> = [
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
      title: "Data",
      dataIndex: "data_keys",
      key: "data_keys",
      render: (keys: string[]) =>
        keys.length === 0 ? (
          <Text type="secondary">0 keys</Text>
        ) : (
          <Tooltip
            title={
              <Space direction="vertical" size={2}>
                {keys.map((k) => (
                  <span key={k}>{k}</span>
                ))}
              </Space>
            }
          >
            <Tag bordered={false} style={{ cursor: "default" }}>
              {keys.length} {keys.length === 1 ? "key" : "keys"}
            </Tag>
          </Tooltip>
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
      title="ConfigMaps"
      style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
      styles={{ body: { flex: 1, minHeight: 0, overflow: "hidden", padding: 0 } }}
      extra={
        <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
          Refresh
        </Button>
      }
    >
      <Table<ConfigMapInfo>
        size="small"
        rowKey={(r) => `${r.namespace}/${r.name}`}
        dataSource={configmaps}
        columns={columns}
        loading={loading}
        pagination={{ defaultPageSize: 20, showSizeChanger: true, showTotal: (t) => `Total ${t}` }}
        locale={{ emptyText: <Empty description="No configmaps" /> }}
        scroll={{ y: "max(200px, calc(100vh - 240px))" }}
      />
    </Card>
  );
}
