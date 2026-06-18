import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Card, Empty, Input, Space, Tag, Typography, App as AntdApp } from "antd";
import { ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { Pagination, Table } from "antd";
import { api } from "../api";
import { useClusterStore } from "../store/clusterStore";
import type { SecretInfo } from "../types";
import { formatAge } from "../utils/format";
import ResourceDetailDrawer, { type ResourceTarget } from "../components/Detail/ResourceDetailDrawer";
import { useResizableColumns } from "../components/Common/ResizableColumns";

const { Text } = Typography;

export default function Secrets() {
  const { currentClusterId, currentNamespace } = useClusterStore();
  const { message } = AntdApp.useApp();

  const [secrets, setSecrets] = useState<SecretInfo[]>([]);
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
      const data = await api.listSecrets(currentClusterId, currentNamespace || null);
      setSecrets(data);
    } catch (err) {
      message.error(String(err));
    } finally {
      setLoading(false);
    }
  }, [currentClusterId, currentNamespace, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: ColumnsType<SecretInfo> = [
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
      ellipsis: true,
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (name: string) => <Text strong ellipsis>{name}</Text>,
    },
    {
      title: "Type",
      dataIndex: "secret_type",
      key: "secret_type",
      width: 150,
      ellipsis: true,
      render: (t: string) => <Tag>{t}</Tag>,
    },
    {
      title: "Keys",
      dataIndex: "data_keys",
      key: "data_keys",
      width: 100,
      align: "right",
      render: (keys: string[]) => keys.length,
    },
    {
      title: "Age",
      dataIndex: "age_ms",
      key: "age_ms",
      width: 80,
      align: "right",
      sorter: (a, b) => a.age_ms - b.age_ms,
      render: (ms: number) => formatAge(ms),
    },
  ];

  const { columns: rcols, components } = useResizableColumns("secrets", columns);

  const shown = useMemo(
    () => secrets.filter((r) => (r.name ?? "").toLowerCase().includes(query.trim().toLowerCase())),
    [secrets, query],
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
      title="Secrets"
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
        <Table<SecretInfo>
          size="small"
          rowKey={(r) => `${r.namespace}/${r.name}`}
          dataSource={pagedData}
          columns={rcols}
          components={components}
          loading={loading}
          onRow={(record) => ({
            onClick: () =>
              setDetailTarget({
                apiVersion: "v1",
                kind: "Secret",
                namespace: record.namespace,
                name: record.name,
              }),
            style: { cursor: "pointer" },
          })}
          pagination={false}
          locale={{ emptyText: <Empty description="No secrets" /> }}
          scroll={{ x: 700, y: scrollY }}
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
