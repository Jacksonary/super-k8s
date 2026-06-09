import { useCallback, useEffect, useState } from "react";
import { Button, Card, Empty, Table, Tag, Tooltip, Typography, App as AntdApp } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { api } from "../api";
import { useClusterStore } from "../store/clusterStore";
import type { EventInfo } from "../types";
import { formatAge } from "../utils/format";

const { Text } = Typography;

export default function Events() {
  const { currentClusterId, currentNamespace } = useClusterStore();
  const { message } = AntdApp.useApp();

  const [events, setEvents] = useState<EventInfo[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!currentClusterId) return;
    setLoading(true);
    try {
      const data = await api.listEvents(currentClusterId, currentNamespace || null);
      data.sort((a, b) => b.last_seen_ms - a.last_seen_ms);
      setEvents(data);
    } catch (err) {
      message.error(String(err));
    } finally {
      setLoading(false);
    }
  }, [currentClusterId, currentNamespace, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: ColumnsType<EventInfo> = [
    {
      title: "Last Seen",
      dataIndex: "last_seen_ms",
      key: "last_seen_ms",
      width: 120,
      defaultSortOrder: "descend",
      sorter: (a, b) => a.last_seen_ms - b.last_seen_ms,
      render: (ms: number) => formatAge(ms),
    },
    {
      title: "Type",
      dataIndex: "event_type",
      key: "event_type",
      width: 110,
      render: (t: string) => <Tag color={t === "Warning" ? "red" : "blue"}>{t}</Tag>,
    },
    { title: "Reason", dataIndex: "reason", key: "reason", width: 180, ellipsis: true },
    {
      title: "Object",
      dataIndex: "object",
      key: "object",
      width: 240,
      ellipsis: true,
      render: (o: string) => <Text>{o}</Text>,
    },
    {
      title: "Message",
      dataIndex: "message",
      key: "message",
      ellipsis: true,
      render: (msg: string) => (
        <Tooltip title={msg} placement="topLeft">
          <Text style={{ maxWidth: "100%" }} ellipsis>
            {msg}
          </Text>
        </Tooltip>
      ),
    },
    {
      title: "Count",
      dataIndex: "count",
      key: "count",
      width: 90,
      align: "right",
      sorter: (a, b) => a.count - b.count,
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
      title="Events"
      style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
      styles={{ body: { flex: 1, minHeight: 0, overflow: "hidden", padding: 0 } }}
      extra={
        <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
          Refresh
        </Button>
      }
    >
      <Table<EventInfo>
        size="small"
        rowKey={(r, i) => `${r.object}-${r.reason}-${r.last_seen_ms}-${i}`}
        dataSource={events}
        columns={columns}
        loading={loading}
        pagination={{ defaultPageSize: 20, showSizeChanger: true, showTotal: (t) => `Total ${t}` }}
        locale={{ emptyText: <Empty description="No events" /> }}
        scroll={{ y: "max(200px, calc(100vh - 240px))" }}
      />
    </Card>
  );
}
