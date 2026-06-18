import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import {
  Alert,
  Button,
  Drawer,
  Empty,
  Input,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  theme,
  App as AntdApp,
} from "antd";
import { ArrowDownOutlined, ArrowUpOutlined, CopyOutlined, ReloadOutlined, SaveOutlined, SearchOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { api } from "../../api";
import type { EventInfo } from "../../types";
import { formatAge } from "../../utils/format";
import { validateYaml } from "../../utils/yamlValidation";
import PodOverview from "./PodOverview";
import DeploymentOverview from "./DeploymentOverview";
import ServiceOverview from "./ServiceOverview";
import ConfigMapOverview from "./ConfigMapOverview";
import SecretOverview from "./SecretOverview";
import CronJobOverview from "./CronJobOverview";
import IngressOverview from "./IngressOverview";
import JobOverview from "./JobOverview";
import NodeOverview from "./NodeOverview";
import NamespaceOverview from "./NamespaceOverview";

const { Text } = Typography;

export interface ResourceTarget {
  apiVersion: string;
  kind: string;
  namespace: string | null;
  name: string;
}

export type KubeObject = Record<string, any>;

export interface OverviewPanelProps {
  obj: KubeObject;
  clusterId: string;
  target: ResourceTarget;
  reload: () => void;
  onChanged?: () => void | Promise<void>;
  onEditYaml?: () => void;
  onOpenBottomPanel?: (type: "logs" | "terminal") => void;
}

const PANEL_REGISTRY: Record<string, ComponentType<OverviewPanelProps>> = {
  Pod: PodOverview,
  Deployment: DeploymentOverview,
  Service: ServiceOverview,
  ConfigMap: ConfigMapOverview,
  Secret: SecretOverview,
  CronJob: CronJobOverview,
  Ingress: IngressOverview,
  Job: JobOverview,
  Node: NodeOverview,
  Namespace: NamespaceOverview,
};

interface Props {
  open: boolean;
  clusterId: string;
  target: ResourceTarget | null;
  onClose: () => void;
  onChanged?: () => void | Promise<void>;
  onOpenBottomPanel?: (type: "logs" | "terminal") => void;
}

export default function ResourceDetailDrawer({ open, clusterId, target, onClose, onChanged, onOpenBottomPanel }: Props) {
  const { message } = AntdApp.useApp();
  const { token } = theme.useToken();

  const [activeTab, setActiveTab] = useState("overview");

  // ── Overview state ──────────────────────────────────────────
  const [obj, setObj] = useState<KubeObject | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    if (!target) return;
    setOverviewLoading(true);
    setOverviewError(null);
    try {
      const data = await api.getResourceJson(
        clusterId,
        target.apiVersion,
        target.kind,
        target.namespace,
        target.name,
      );
      setObj(data as KubeObject);
    } catch (err) {
      setOverviewError(String(err));
      setObj(null);
    } finally {
      setOverviewLoading(false);
    }
  }, [clusterId, target]);

  // ── YAML state ──────────────────────────────────────────────
  const [yaml, setYaml] = useState("");
  const yamlTextAreaRef = useRef<any>(null);
  const yamlSearchInputRef = useRef<any>(null);
  const [yamlSearch, setYamlSearch] = useState("");
  const [yamlMatchIndex, setYamlMatchIndex] = useState(0);
  const [yamlScrollTop, setYamlScrollTop] = useState(0);
  const [yamlLoading, setYamlLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const yamlValidation = useMemo(() => validateYaml(yaml), [yaml]);
  const yamlMatches = useMemo(() => {
    const query = yamlSearch.trim();
    if (!query) return [];
    const matches: Array<{ start: number; end: number }> = [];
    const haystack = yaml.toLowerCase();
    const needle = query.toLowerCase();
    let start = 0;
    while (start <= haystack.length) {
      const index = haystack.indexOf(needle, start);
      if (index === -1) break;
      matches.push({ start: index, end: index + needle.length });
      start = index + Math.max(needle.length, 1);
    }
    return matches;
  }, [yaml, yamlSearch]);

  const yamlMatchLabel = yamlSearch.trim()
    ? yamlMatches.length > 0
      ? `${yamlMatchIndex + 1}/${yamlMatches.length}`
      : "0/0"
    : "";

  const yamlHighlightNodes = useMemo(() => {
    if (yamlMatches.length === 0) return yaml;
    const nodes = [];
    let cursor = 0;
    yamlMatches.forEach((match, index) => {
      if (match.start > cursor) {
        nodes.push(yaml.slice(cursor, match.start));
      }
      nodes.push(
        <mark key={`${match.start}-${match.end}-${index}`} className={index === yamlMatchIndex ? "current" : undefined}>
          {yaml.slice(match.start, match.end)}
        </mark>,
      );
      cursor = match.end;
    });
    if (cursor < yaml.length) {
      nodes.push(yaml.slice(cursor));
    }
    return nodes;
  }, [yaml, yamlMatches, yamlMatchIndex]);

  useEffect(() => {
    if (yamlMatchIndex >= yamlMatches.length) {
      setYamlMatchIndex(0);
    }
  }, [yamlMatchIndex, yamlMatches.length]);

  const scrollToYamlMatch = useCallback(
    (index: number) => {
      const match = yamlMatches[index];
      const textArea = yamlTextAreaRef.current?.resizableTextArea?.textArea;
      if (!textArea || !match) return;

      const beforeMatch = yaml.slice(0, match.start);
      const line = beforeMatch.split("\n").length - 1;
      const lineHeight = Number.parseFloat(window.getComputedStyle(textArea).lineHeight || "18") || 18;
      textArea.scrollTop = Math.max(0, line * lineHeight - textArea.clientHeight / 3);
      setYamlScrollTop(textArea.scrollTop);
    },
    [yaml, yamlMatches],
  );

  const moveYamlMatch = useCallback(
    (direction: 1 | -1) => {
      if (yamlMatches.length === 0) return;
      const next = (yamlMatchIndex + direction + yamlMatches.length) % yamlMatches.length;
      setYamlMatchIndex(next);
      scrollToYamlMatch(next);
    },
    [scrollToYamlMatch, yamlMatchIndex, yamlMatches.length],
  );

  const loadYaml = useCallback(async () => {
    if (!target) return;
    setYamlLoading(true);
    try {
      const text = await api.getResourceYaml(
        clusterId,
        target.apiVersion,
        target.kind,
        target.namespace,
        target.name,
      );
      setYaml(text);
    } catch (err) {
      message.error(String(err));
      setYaml("");
    } finally {
      setYamlLoading(false);
    }
  }, [clusterId, target, message]);

  const handleApply = useCallback(async () => {
    if (!target) return;
    if (!yamlValidation.ok) {
      message.error(yamlValidation.message ?? "Invalid YAML");
      return;
    }
    setApplying(true);
    try {
      const res = await api.applyResourceYaml(clusterId, yaml);
      message.success(`Applied ${res.name ?? target.name}`);
      await onChanged?.();
      void loadYaml();
      void loadOverview();
    } catch (err) {
      message.error(String(err));
    } finally {
      setApplying(false);
    }
  }, [clusterId, yaml, yamlValidation, target, onChanged, loadYaml, loadOverview, message]);

  const handleCopyYaml = useCallback(async () => {
    if (!yaml) return;
    try {
      await navigator.clipboard.writeText(yaml);
      message.success("YAML copied");
    } catch (error) {
      message.error(`Copy failed: ${(error as Error).message}`);
    }
  }, [yaml, message]);

  // ── Events state ────────────────────────────────────────────
  const [events, setEvents] = useState<EventInfo[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);

  const loadEvents = useCallback(async () => {
    if (!target) return;
    setEventsLoading(true);
    try {
      const data = await api.listEvents(clusterId, target.namespace);
      const wanted = `${target.kind}/${target.name}`;
      const filtered = data
        .filter((e) => e.object === wanted)
        .sort((a, b) => b.last_seen_ms - a.last_seen_ms);
      setEvents(filtered);
    } catch (err) {
      message.error(String(err));
      setEvents([]);
    } finally {
      setEventsLoading(false);
    }
  }, [clusterId, target, message]);

  // Reset + (re)fetch whenever the drawer opens for a target.
  useEffect(() => {
    if (!open || !target) return;
    setActiveTab("overview");
    void loadOverview();
    void loadYaml();
    void loadEvents();
  }, [open, target, loadOverview, loadYaml, loadEvents]);

  const title = target
    ? `${target.kind}: ${target.namespace ? `${target.namespace}/` : ""}${target.name}`
    : "Detail";

  const eventColumns: ColumnsType<EventInfo> = useMemo(
    () => [
      {
        title: "Last Seen",
        dataIndex: "last_seen_ms",
        key: "last_seen_ms",
        width: 110,
        render: (ms: number) => formatAge(ms),
      },
      {
        title: "Type",
        dataIndex: "event_type",
        key: "event_type",
        width: 100,
        render: (t: string) => <Tag color={t === "Warning" ? "red" : "blue"}>{t}</Tag>,
      },
      { title: "Reason", dataIndex: "reason", key: "reason", width: 160, ellipsis: true },
      {
        title: "Message",
        dataIndex: "message",
        key: "message",
        ellipsis: true,
      },
      { title: "Count", dataIndex: "count", key: "count", width: 80, align: "right" },
    ],
    [],
  );

  const openYamlEditor = useCallback(() => {
    setActiveTab("yaml");
  }, []);

  const renderOverview = () => {
    if (overviewLoading) {
      return (
        <div style={{ textAlign: "center", padding: "40px 0" }}>
          <Spin />
        </div>
      );
    }
    if (overviewError) {
      return <Alert type="error" showIcon message="Load failed" description={overviewError} />;
    }
    if (!obj || !target) {
      return <Empty description="No data" />;
    }
    const Panel = PANEL_REGISTRY[target.kind];
    if (!Panel) {
      return (
        <Empty
          description={
            <Text type="secondary">No visual details are available for this resource. Use the YAML tab instead.</Text>
          }
        />
      );
    }
    return (
      <div className="resource-overview-panel">
        <Panel
          obj={obj}
          clusterId={clusterId}
          target={target}
          reload={loadOverview}
          onChanged={onChanged}
          onEditYaml={openYamlEditor}
          onOpenBottomPanel={onOpenBottomPanel}
        />
      </div>
    );
  };

  const renderYaml = () => (
    <div className="resource-yaml-panel">
      <div className="resource-yaml-toolbar">
        <Space size={8} className="resource-yaml-status">
          <Tag color={yamlValidation.ok ? "green" : "red"}>{yamlValidation.ok ? "Valid YAML" : "Invalid YAML"}</Tag>
        </Space>
        <Space size={4}>
          <Tooltip title="Reload YAML">
            <Button size="small" aria-label="Reload YAML" icon={<ReloadOutlined />} onClick={loadYaml} loading={yamlLoading} />
          </Tooltip>
          <Tooltip title="Copy YAML">
            <Button size="small" aria-label="Copy YAML" icon={<CopyOutlined />} onClick={handleCopyYaml} disabled={!yaml} />
          </Tooltip>
          <Tooltip title="Apply YAML">
            <Button
              size="small"
              aria-label="Apply YAML"
              icon={<SaveOutlined />}
              disabled={!yamlValidation.ok}
              loading={applying}
              onClick={handleApply}
            />
          </Tooltip>
        </Space>
      </div>
      {!yamlValidation.ok && (
        <Alert
          type="error"
          showIcon
          message={yamlValidation.message ?? "Invalid YAML"}
          style={{ marginBottom: 8 }}
        />
      )}
      <div className="resource-yaml-editor-wrap">
        <Space size={4} className="resource-yaml-search">
          <Input
            ref={yamlSearchInputRef}
            allowClear
            size="small"
            prefix={<SearchOutlined />}
            placeholder="Find"
            value={yamlSearch}
            onChange={(event) => {
              setYamlSearch(event.target.value);
              setYamlMatchIndex(0);
            }}
            onPressEnter={(event) => {
              event.preventDefault();
              moveYamlMatch(1);
            }}
          />
          {yamlMatchLabel && (
            <Text type="secondary" style={{ fontSize: 12, minWidth: 34, textAlign: "right" }}>
              {yamlMatchLabel}
            </Text>
          )}
          <Tooltip title="Previous match">
            <Button
              size="small"
              aria-label="Previous YAML match"
              icon={<ArrowUpOutlined />}
              disabled={yamlMatches.length === 0}
              onClick={() => moveYamlMatch(-1)}
            />
          </Tooltip>
          <Tooltip title="Next match">
            <Button
              size="small"
              aria-label="Next YAML match"
              icon={<ArrowDownOutlined />}
              disabled={yamlMatches.length === 0}
              onClick={() => moveYamlMatch(1)}
            />
          </Tooltip>
        </Space>
        <pre
          aria-hidden="true"
          className="resource-yaml-highlight"
          style={{ transform: `translateY(-${yamlScrollTop}px)` }}
        >
          {yamlHighlightNodes}
        </pre>
        <Input.TextArea
          ref={yamlTextAreaRef}
          value={yaml}
          onChange={(e) => setYaml(e.target.value)}
          onScroll={(event) => setYamlScrollTop(event.currentTarget.scrollTop)}
          spellCheck={false}
          style={{
            flex: 1,
            minHeight: 0,
            resize: "none",
            fontFamily: "ui-monospace, 'JetBrains Mono', Menlo, monospace",
            fontSize: 13,
            background: token.colorBgContainer,
            color: token.colorText,
          }}
        />
      </div>
    </div>
  );

  const renderEvents = () => (
    <div className="resource-events-panel">
      <Table<EventInfo>
        size="small"
        rowKey={(r, i) => `${r.object}-${r.reason}-${r.last_seen_ms}-${i}`}
        dataSource={events}
        columns={eventColumns}
        loading={eventsLoading}
        pagination={false}
        locale={{ emptyText: <Empty description="No events" /> }}
      />
    </div>
  );

  return (
    <Drawer
      title={title}
      placement="right"
      width="min(800px, calc(100vw - 48px))"
      open={open}
      onClose={onClose}
      destroyOnClose
      extra={<Tag bordered={false}>{target?.apiVersion}</Tag>}
      className="resource-detail-drawer"
      styles={{ body: { display: "flex", flexDirection: "column", minHeight: 0, padding: 16 } }}
    >
      <Tabs
        className="resource-detail-tabs"
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          { key: "overview", label: "Overview", children: renderOverview() },
          { key: "yaml", label: "YAML", children: renderYaml() },
          { key: "events", label: "Events", children: renderEvents() },
        ]}
      />
    </Drawer>
  );
}
