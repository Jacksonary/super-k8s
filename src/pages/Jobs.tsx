import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Card, Empty, Input, Space, Pagination, Table, Tag, Tooltip, Typography, App as AntdApp } from "antd";
import { ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { api } from "../api";
import { useClusterStore } from "../store/clusterStore";
import type { JobInfo } from "../types";
import { formatAge } from "../utils/format";
import ResourceDetailDrawer, { type ResourceTarget } from "../components/Detail/ResourceDetailDrawer";
import { useResizableColumns } from "../components/Common/ResizableColumns";

const { Text } = Typography;

function statusTag(job: JobInfo) {
  if (job.active > 0) return <Tag color="blue">Running</Tag>;
  if (job.complete) return <Tag color="green">Complete</Tag>;
  if (job.failed > 0) return <Tag color="red">Failed</Tag>;
  return <Tag color="default">Pending</Tag>;
}

export default function Jobs() {
  const { currentClusterId, currentNamespace } = useClusterStore();
  const { message } = AntdApp.useApp();

  const [jobs, setJobs] = useState<JobInfo[]>([]);
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
      const data = await api.listJobs(currentClusterId, currentNamespace || null);
      setJobs(data);
    } catch (err) {
      message.error(String(err));
    } finally {
      setLoading(false);
    }
  }, [currentClusterId, currentNamespace, message]);

  useEffect(() => { void load(); }, [load]);

  const columns: ColumnsType<JobInfo> = [
    {
      title: "Namespace", dataIndex: "namespace", key: "namespace", width: 160,
      sorter: (a, b) => a.namespace.localeCompare(b.namespace),
      render: (ns: string) => <Text type="secondary">{ns}</Text>,
    },
    {
      title: "Name", dataIndex: "name", key: "name", width: 280, ellipsis: true,
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (name: string) => <Tooltip title={name}><Text strong ellipsis>{name}</Text></Tooltip>,
    },
    {
      title: "Status", key: "status", width: 100,
      render: (_, r) => statusTag(r),
    },
    {
      title: "Completions", key: "completions", width: 120, align: "center" as const,
      render: (_, r) => (
        <Text>{r.succeeded} / {r.completions ?? "∞"}</Text>
      ),
    },
    {
      title: "Active", dataIndex: "active", key: "active", width: 80, align: "right" as const,
    },
    {
      title: "Failed", dataIndex: "failed", key: "failed", width: 80, align: "right" as const,
      render: (v: number) => v > 0 ? <Text type="danger">{v}</Text> : <Text>{v}</Text>,
    },
    {
      title: "Age", dataIndex: "age_ms", key: "age_ms", width: 80, align: "right" as const,
      sorter: (a, b) => a.age_ms - b.age_ms,
      render: (ms: number) => formatAge(ms),
    },
  ];

  const { columns: rcols, components } = useResizableColumns("jobs", columns);

  const shown = useMemo(
    () => jobs.filter((r) => r.name.toLowerCase().includes(query.trim().toLowerCase())),
    [jobs, query],
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
      <Card style={{ flex: 1, minHeight: 0 }}>
        <Empty description="No cluster selected. Choose one from the sidebar." />
      </Card>
    );
  }

  return (
    <Card
      title="Jobs"
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
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Refresh</Button>
        </Space>
      }
    >
      <div ref={tableRef} style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        <Table<JobInfo>
          size="small"
          rowKey={(r) => `${r.namespace}/${r.name}`}
          dataSource={pagedData}
          columns={rcols}
          components={components}
          loading={loading}
          onRow={(record) => ({
            onClick: () =>
              setDetailTarget({
                apiVersion: "batch/v1",
                kind: "Job",
                namespace: record.namespace,
                name: record.name,
              }),
            style: { cursor: "pointer" },
          })}
          pagination={false}
          locale={{ emptyText: <Empty description="No jobs" /> }}
          scroll={{ x: 1000, y: scrollY }}
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
