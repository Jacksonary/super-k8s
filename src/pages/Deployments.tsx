import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Card,
  Empty,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Space,
  Pagination, Table,
  Typography,
  App as AntdApp,
} from "antd";
import { ColumnHeightOutlined, ReloadOutlined, RedoOutlined, SearchOutlined } from "@ant-design/icons";
import { Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";
import { api } from "../api";
import { useClusterStore } from "../store/clusterStore";
import type { DeploymentInfo } from "../types";
import { formatAge } from "../utils/format";
import ResourceDetailDrawer, { type ResourceTarget } from "../components/Detail/ResourceDetailDrawer";
import { useResizableColumns } from "../components/Common/ResizableColumns";

const { Text } = Typography;

export default function Deployments() {
  const { currentClusterId, currentNamespace } = useClusterStore();
  const { message } = AntdApp.useApp();

  const [deployments, setDeployments] = useState<DeploymentInfo[]>([]);
  const [loading, setLoading] = useState(false);

  const [scaleTarget, setScaleTarget] = useState<DeploymentInfo | null>(null);
  const [scaleValue, setScaleValue] = useState<number>(1);
  const [scaling, setScaling] = useState(false);
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
      const data = await api.listDeployments(currentClusterId, currentNamespace || null);
      setDeployments(data);
    } catch (err) {
      message.error(String(err));
    } finally {
      setLoading(false);
    }
  }, [currentClusterId, currentNamespace, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const openScale = useCallback((d: DeploymentInfo) => {
    setScaleTarget(d);
    setScaleValue(d.replicas);
  }, []);

  const handleScale = useCallback(async () => {
    if (!currentClusterId || !scaleTarget) return;
    setScaling(true);
    try {
      await api.scaleDeployment(currentClusterId, scaleTarget.namespace, scaleTarget.name, scaleValue);
      message.success(`Scaled "${scaleTarget.name}" to ${scaleValue}`);
      setScaleTarget(null);
      void load();
    } catch (err) {
      message.error(String(err));
    } finally {
      setScaling(false);
    }
  }, [currentClusterId, scaleTarget, scaleValue, load, message]);

  const handleRestart = useCallback(
    async (d: DeploymentInfo) => {
      if (!currentClusterId) return;
      try {
        await api.restartDeployment(currentClusterId, d.namespace, d.name);
        message.success(`Restarted "${d.name}"`);
        void load();
      } catch (err) {
        message.error(String(err));
      }
    },
    [currentClusterId, load, message],
  );

  const columns: ColumnsType<DeploymentInfo> = [
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
      width: 360,
      ellipsis: true,
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (name: string) => <Text strong ellipsis>{name}</Text>,
    },
    { title: "Ready", dataIndex: "ready", key: "ready", width: 76, align: "center" },
    {
      title: "Replicas",
      dataIndex: "replicas",
      key: "replicas",
      width: 82,
      align: "right",
      sorter: (a, b) => a.replicas - b.replicas,
    },
    { title: "Available", dataIndex: "available", key: "available", width: 82, align: "right" },
    { title: "Updated", dataIndex: "updated", key: "updated", width: 82, align: "right" },
    {
      title: "Age",
      dataIndex: "age_ms",
      key: "age_ms",
      width: 78,
      align: "right",
      sorter: (a, b) => a.age_ms - b.age_ms,
      render: (ms: number) => formatAge(ms),
    },
    {
      title: "",
      key: "actions",
      width: 180,
      align: "right",
      render: (_, record) => (
        <Space size={2} onClick={(e) => e.stopPropagation()}>
          <Button
            type="text"
            size="small"
            icon={<ColumnHeightOutlined />}
            onClick={() => openScale(record)}
          >
            Scale
          </Button>
          <Tooltip title="Restart">
            <Popconfirm
              title={`Restart "${record.name}"?`}
              description="Triggers a rolling restart of all pods."
              onConfirm={() => handleRestart(record)}
            >
              <Button type="text" size="small" icon={<RedoOutlined />} />
            </Popconfirm>
          </Tooltip>
        </Space>
      ),
    },
  ];

  const { columns: rcols, components } = useResizableColumns("deployments", columns);

  const shown = useMemo(
    () => deployments.filter((r) => (r.name ?? "").toLowerCase().includes(query.trim().toLowerCase())),
    [deployments, query],
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
      title="Deployments"
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
        <Table<DeploymentInfo>
          size="small"
          rowKey={(r) => `${r.namespace}/${r.name}`}
          dataSource={pagedData}
          columns={rcols}
          components={components}
          loading={loading}
          onRow={(record) => ({
            onClick: () =>
              setDetailTarget({
                apiVersion: "apps/v1",
                kind: "Deployment",
                namespace: record.namespace,
                name: record.name,
              }),
            style: { cursor: "pointer" },
          })}
          pagination={false}
          locale={{ emptyText: <Empty description="No deployments" /> }}
          scroll={{ x: 1100, y: scrollY }}
        />
      </div>

      <Modal
        title={scaleTarget ? `Scale: ${scaleTarget.name}` : "Scale"}
        open={!!scaleTarget}
        onOk={handleScale}
        onCancel={() => setScaleTarget(null)}
        okText="Scale"
        confirmLoading={scaling}
        destroyOnClose
      >
        <Space direction="vertical" style={{ width: "100%" }}>
          <Text type="secondary">Set the desired number of replicas.</Text>
          <InputNumber
            min={0}
            max={1000}
            value={scaleValue}
            onChange={(v) => {
              if (typeof v === "number" && Number.isFinite(v) && v >= 0) setScaleValue(Math.floor(v));
            }}
            style={{ width: "100%" }}
            autoFocus
          />
        </Space>
      </Modal>

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
