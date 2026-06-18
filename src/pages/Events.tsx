import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Card, Empty, Input, Space, Pagination, Table, Tag, Tooltip, Typography, App as AntdApp } from "antd";
import { ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { api } from "../api";
import { useClusterStore } from "../store/clusterStore";
import type { EventInfo } from "../types";
import { formatAge } from "../utils/format";
import { useResizableColumns } from "../components/Common/ResizableColumns";

const { Text } = Typography;

export default function Events() {
  const { currentClusterId, currentNamespace } = useClusterStore();
  const { message } = AntdApp.useApp();

  const [events, setEvents] = useState<EventInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const tableRef = useRef<HTMLDivElement>(null);
  const [scrollY, setScrollY] = useState(400);

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
      width: 96,
      defaultSortOrder: "descend",
      sorter: (a, b) => a.last_seen_ms - b.last_seen_ms,
      render: (ms: number) => formatAge(ms),
    },
    {
      title: "Type",
      dataIndex: "event_type",
      key: "event_type",
      width: 90,
      render: (t: string) => <Tag color={t === "Warning" ? "red" : "blue"}>{t}</Tag>,
    },
    { title: "Reason", dataIndex: "reason", key: "reason", width: 160, ellipsis: true },
    {
      title: "Object",
      dataIndex: "object",
      key: "object",
      width: 260,
      ellipsis: true,
      render: (o: string) => <Text>{o}</Text>,
    },
    {
      title: "Message",
      dataIndex: "message",
      key: "message",
      width: 520,
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
      width: 72,
      align: "right",
      sorter: (a, b) => a.count - b.count,
    },
  ];

  const { columns: rcols, components } = useResizableColumns("events", columns);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter(
      (r) =>
        (r.object ?? "").toLowerCase().includes(q) || (r.reason ?? "").toLowerCase().includes(q),
    );
  }, [events, query]);

  const pagedData = useMemo(
    () => shown.slice((page - 1) * pageSize, page * pageSize),
    [shown, page, pageSize],
  );

  // Reset page when filter changes
  useEffect(() => { setPage(1); }, [shown.length]);

  // Measure table container for y scroll
  useEffect(() => {
    const el = tableRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setScrollY(Math.max(150, el.clientHeight - 38));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
      styles={{ body: { flex: 1, minHeight: 0, overflow: "hidden", padding: 0, display: "flex", flexDirection: "column" } }}
      extra={
        <Space>
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="Search events"
            size="small"
            style={{ width: 220 }}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
            Refresh
          </Button>
        </Space>
      }
    >
      <div ref={tableRef} style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        <Table<EventInfo>
          size="small"
          rowKey={(r, i) => `${r.object}-${r.reason}-${r.last_seen_ms}-${i}`}
          dataSource={pagedData}
          columns={rcols}
          components={components}
          loading={loading}
          pagination={false}
          locale={{ emptyText: <Empty description="No events" /> }}
          scroll={{ x: 1198, y: scrollY }}
        />
      </div>
      {shown.length > 0 && (
        <div style={{ flexShrink: 0, padding: "8px 0", display: "flex", justifyContent: "center", borderTop: "1px solid var(--ant-color-border-secondary)" }}>
          <Pagination
            current={page}
            pageSize={pageSize}
            total={shown.length}
            simple
            showSizeChanger
            pageSizeOptions={[20, 50, 100]}
            onChange={(p, ps) => { setPage(ps !== pageSize ? 1 : p); setPageSize(ps); }}
          />
        </div>
      )}
    </Card>
  );
}
