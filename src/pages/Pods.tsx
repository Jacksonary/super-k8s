import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Button, Card, Empty, Input, Pagination, Popconfirm, Space, Table, Tag, Tooltip, Typography, App as AntdApp, theme, Tabs as AntdTabs,
} from "antd";
import {
  CodeOutlined, DeleteOutlined, FileTextOutlined, ReloadOutlined, SearchOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { api } from "../api";
import { useClusterStore } from "../store/clusterStore";
import type { PodInfo } from "../types";
import { formatAge } from "../utils/format";
import PodLogsPanel from "../components/Pod/PodLogsPanel";
import PodExecPanel from "../components/Pod/PodExecPanel";
import ResourceDetailDrawer, { type ResourceTarget } from "../components/Detail/ResourceDetailDrawer";
import { useResizableColumns } from "../components/Common/ResizableColumns";

const { Text } = Typography;

interface BottomPanelTab {
  id: string;
  type: "logs" | "terminal";
  pod: PodInfo;
}

function phaseColor(status: string): string {
  switch (status) {
    case "Running":
    case "Succeeded":
      return "green";
    case "Pending":
    case "ContainerCreating":
      return "orange";
    case "Failed":
    case "CrashLoopBackOff":
    case "Error":
      return "red";
    default:
      return "default";
  }
}

export default function Pods() {
  const { currentClusterId, currentNamespace } = useClusterStore();
  const { message } = AntdApp.useApp();
  const { token } = theme.useToken();

  const [pods, setPods] = useState<PodInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [detailTarget, setDetailTarget] = useState<ResourceTarget | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Bottom panel state
  const [bottomPanels, setBottomPanels] = useState<BottomPanelTab[]>([]);
  const [activePanelId, setActivePanelId] = useState<string | null>(null);
  const [panelHeight, setPanelHeight] = useState(300);

  // Table scroll height (measured from top section)
  const topRef = useRef<HTMLDivElement>(null);
  const [tableScrollY, setTableScrollY] = useState(400);

  useEffect(() => {
    const el = topRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      // 38px for antd small table header; pagination is now outside this div
      setTableScrollY(Math.max(150, el.clientHeight - 38));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const load = useCallback(async () => {
    if (!currentClusterId) return;
    setLoading(true);
    try {
      const data = await api.listPods(currentClusterId, currentNamespace || null);
      setPods(data);
    } catch (err) {
      message.error(String(err));
    } finally {
      setLoading(false);
    }
  }, [currentClusterId, currentNamespace, message]);

  useEffect(() => { void load(); }, [load]);

  const handleDelete = useCallback(async (pod: PodInfo) => {
    if (!currentClusterId) return;
    try {
      await api.deletePod(currentClusterId, pod.namespace, pod.name);
      message.success(`Pod "${pod.name}" deleted`);
      void load();
    } catch (err) {
      message.error(String(err));
    }
  }, [currentClusterId, load, message]);

  const openPanel = useCallback((type: "logs" | "terminal", pod: PodInfo) => {
    const existing = bottomPanels.find(
      (t) => t.pod.namespace === pod.namespace && t.pod.name === pod.name && t.type === type,
    );
    if (existing) {
      setActivePanelId(existing.id);
      return;
    }
    setPanelHeight(Math.max(200, Math.floor(window.innerHeight * 0.45)));
    const id = crypto.randomUUID();
    setBottomPanels((prev) => [...prev, { id, type, pod }]);
    setActivePanelId(id);
  }, [bottomPanels]);

  const closePanel = useCallback((id: string) => {
    setBottomPanels((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (activePanelId === id) {
        setActivePanelId(next.length > 0 ? next[next.length - 1].id : null);
      }
      return next;
    });
  }, [activePanelId]);

  // Drag-to-resize divider
  const handleDividerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = panelHeight;

    const onMove = (ev: MouseEvent) => {
      const delta = startY - ev.clientY;
      const max = window.innerHeight - 250;
      const min = 120;
      setPanelHeight(Math.max(min, Math.min(max, startH + delta)));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
  };

  const columns: ColumnsType<PodInfo> = [
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
      width: 420,
      ellipsis: true,
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (name: string) => (
        <Tooltip title={name}>
          <Text strong ellipsis>{name}</Text>
        </Tooltip>
      ),
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      width: 130,
      render: (status: string) => <Tag color={phaseColor(status)}>{status}</Tag>,
    },
    { title: "Ready", dataIndex: "ready", key: "ready", width: 72, align: "center" },
    {
      title: "Restarts",
      dataIndex: "restarts",
      key: "restarts",
      width: 82,
      align: "right",
      sorter: (a, b) => a.restarts - b.restarts,
    },
    { title: "Node", dataIndex: "node", key: "node", width: 240, ellipsis: true },
    {
      title: "Pod IP",
      dataIndex: "pod_ip",
      key: "pod_ip",
      width: 126,
      render: (ip: string) => <Text code>{ip || "-"}</Text>,
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
    {
      title: "",
      key: "actions",
      width: 106,
      align: "right",
      render: (_, record) => (
        <Space size={2} onClick={(e) => e.stopPropagation()}>
          <Tooltip title="Logs">
            <Button
              type="text"
              size="small"
              icon={<FileTextOutlined />}
              onClick={() => openPanel("logs", record)}
            />
          </Tooltip>
          <Tooltip title="Terminal">
            <Button
              type="text"
              size="small"
              icon={<CodeOutlined />}
              disabled={record.containers.length === 0}
              onClick={() => openPanel("terminal", record)}
            />
          </Tooltip>
          <Popconfirm
            title={`Delete pod "${record.name}"?`}
            description="This action cannot be undone."
            okText="Delete"
            okButtonProps={{ danger: true }}
            onConfirm={() => handleDelete(record)}
          >
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const { columns: rcols, components } = useResizableColumns("pods", columns);

  const shown = useMemo(
    () => pods.filter((r) => (r.name ?? "").toLowerCase().includes(query.trim().toLowerCase())),
    [pods, query],
  );

  // Reset to first page when filter changes
  useEffect(() => { setPage(1); }, [shown.length]);

  const pagedPods = useMemo(
    () => shown.slice((page - 1) * pageSize, page * pageSize),
    [shown, page, pageSize],
  );

  if (!currentClusterId) {
    return (
      <Card style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <Empty description="No cluster selected. Choose one from the sidebar." />
      </Card>
    );
  }

  return (
    <Card
      title="Pods"
      style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
      styles={{
        body: { flex: 1, minHeight: 0, overflow: "hidden", padding: 0, display: "flex", flexDirection: "column" },
      }}
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
      {/* Top: pod table */}
      <div ref={topRef} style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        <Table<PodInfo>
          size="small"
          rowKey={(r) => `${r.namespace}/${r.name}`}
          dataSource={pagedPods}
          columns={rcols}
          components={components}
          loading={loading}
          onRow={(record) => ({
            onClick: () =>
              setDetailTarget({
                apiVersion: "v1",
                kind: "Pod",
                namespace: record.namespace,
                name: record.name,
              }),
            style: { cursor: "pointer" },
          })}
          pagination={false}
          locale={{ emptyText: <Empty description="No pods" /> }}
          scroll={{ x: 1314, y: tableScrollY }}
        />
      </div>

      {/* Fixed pagination */}
      {shown.length > 0 && (
        <div style={{ flexShrink: 0, padding: "8px 0", display: "flex", justifyContent: "center", borderTop: `1px solid ${token.colorBorderSecondary}` }}>
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

      {/* Drag-to-resize divider */}
      {bottomPanels.length > 0 && (
        <div
          onMouseDown={handleDividerMouseDown}
          style={{
            height: 5,
            flexShrink: 0,
            cursor: "row-resize",
            background: token.colorBorderSecondary,
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = token.colorPrimary; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = token.colorBorderSecondary; }}
        />
      )}

      {/* Bottom panel with tabs */}
      {bottomPanels.length > 0 && (
        <div style={{
          height: panelHeight,
          flexShrink: 0,
          overflow: "hidden",
          borderTop: `1px solid ${token.colorBorderSecondary}`,
          display: "flex",
          flexDirection: "column",
        }}>
          {/* Tab bar */}
          <AntdTabs
            size="small"
            activeKey={activePanelId ?? undefined}
            onChange={(key) => setActivePanelId(key)}
            type="editable-card"
            hideAdd
            onEdit={(targetKey, action) => {
              if (action === "remove" && typeof targetKey === "string") {
                closePanel(targetKey);
              }
            }}
            items={bottomPanels.map((tab) => ({
              key: tab.id,
              label: (
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  {tab.type === "logs" ? <FileTextOutlined /> : <CodeOutlined />}
                  <span style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {tab.pod.name}
                  </span>
                </span>
              ),
              closable: true,
            }))}
            style={{ margin: 0, padding: "0 8px", flexShrink: 0, borderBottom: `1px solid ${token.colorBorderSecondary}` }}
          />

          {/* Panel contents (all mounted, hidden via display:none) */}
          <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
            {bottomPanels.map((tab) => (
              <div
                key={tab.id}
                style={{ display: tab.id === activePanelId ? "flex" : "none", height: "100%", flexDirection: "column" }}
              >
                {tab.type === "logs" ? (
                  <PodLogsPanel
                    clusterId={currentClusterId}
                    pod={tab.pod}
                    onClose={() => closePanel(tab.id)}
                  />
                ) : (
                  <PodExecPanel
                    clusterId={currentClusterId}
                    namespace={tab.pod.namespace}
                    pod={tab.pod.name}
                    containers={tab.pod.containers}
                    onClose={() => closePanel(tab.id)}
                    isVisible={tab.id === activePanelId}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <ResourceDetailDrawer
        open={detailTarget !== null}
        clusterId={currentClusterId}
        target={detailTarget}
        onClose={() => setDetailTarget(null)}
        onChanged={load}
        onOpenBottomPanel={(type) => {
          if (!detailTarget) return;
          const pod = shown.find(
            (p) => p.name === detailTarget.name && p.namespace === detailTarget.namespace,
          );
          if (!pod) return;
          setDetailTarget(null);
          openPanel(type, pod);
        }}
      />
    </Card>
  );
}
