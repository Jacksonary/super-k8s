import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Card, Empty, Input, Space, Pagination, Table, Tag, Typography, App as AntdApp } from "antd";
import { ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { api } from "../api";
import { useClusterStore } from "../store/clusterStore";
import type { NodeInfo } from "../types";
import { formatAge } from "../utils/format";
import ResourceDetailDrawer, { type ResourceTarget } from "../components/Detail/ResourceDetailDrawer";
import { useResizableColumns } from "../components/Common/ResizableColumns";

const { Text } = Typography;

export default function Nodes() {
  const { currentClusterId } = useClusterStore();
  const { message } = AntdApp.useApp();

  const [nodes, setNodes] = useState<NodeInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [detailTarget, setDetailTarget] = useState<ResourceTarget | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const tableRef = useRef<HTMLDivElement>(null);
  const [scrollY, setScrollY] = useState(400);

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
      width: 300,
      ellipsis: true,
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (name: string) => <Text strong ellipsis>{name}</Text>,
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      width: 104,
      render: (status: string, record) => (
        <Tag color={record.ready ? "green" : "red"}>{status}</Tag>
      ),
    },
    {
      title: "Roles",
      dataIndex: "roles",
      key: "roles",
      width: 180,
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
    { title: "Version", dataIndex: "version", key: "version", width: 116, ellipsis: true },
    {
      title: "Internal IP",
      dataIndex: "internal_ip",
      key: "internal_ip",
      width: 126,
      render: (ip: string) => <Text code>{ip || "-"}</Text>,
    },
    { title: "CPU", dataIndex: "cpu_capacity", key: "cpu_capacity", width: 72, align: "right" },
    {
      title: "Memory",
      dataIndex: "memory_capacity",
      key: "memory_capacity",
      width: 112,
      align: "right",
    },
    {
      title: "Age",
      dataIndex: "age_ms",
      key: "age_ms",
      width: 78,
      align: "right",
      sorter: (a, b) => a.age_ms - b.age_ms,
      render: (ms: number) => formatAge(ms),
    },
  ];

  const { columns: rcols, components } = useResizableColumns("nodes", columns);

  const shown = useMemo(
    () => nodes.filter((r) => (r.name ?? "").toLowerCase().includes(query.trim().toLowerCase())),
    [nodes, query],
  );
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
      title="Nodes"
      style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
      styles={{ body: { flex: 1, minHeight: 0, overflow: "hidden", padding: 0, display: "flex", flexDirection: "column" } }}
      extra={
        <Space>
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="Search by name"
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
        <Table<NodeInfo>
          size="small"
          rowKey="name"
          dataSource={pagedData}
          columns={rcols}
          components={components}
          loading={loading}
          onRow={(record) => ({
            onClick: () =>
              setDetailTarget({
                apiVersion: "v1",
                kind: "Node",
                namespace: null,
                name: record.name,
              }),
            style: { cursor: "pointer" },
          })}
          pagination={false}
          locale={{ emptyText: <Empty description="No nodes" /> }}
          scroll={{ x: 1088, y: scrollY }}
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

      <ResourceDetailDrawer
        open={detailTarget !== null}
        clusterId={currentClusterId}
        target={detailTarget}
        onClose={() => setDetailTarget(null)}
        onChanged={load}
      />
    </Card>
  );
}
