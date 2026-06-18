import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Button, Input, InputNumber, Select, Space, Tag, Tooltip, Typography, theme, App as AntdApp,
} from "antd";
import { ClearOutlined, LoadingOutlined, SearchOutlined, VerticalAlignBottomOutlined } from "@ant-design/icons";
import { Channel } from "@tauri-apps/api/core";
import { api } from "../../api";
import type { LogEvent, PodInfo } from "../../types";
import { useSettings } from "../../store/settingsStore";

const { Text } = Typography;

interface Props {
  clusterId: string;
  pod: PodInfo;
  onClose: () => void;
}

function logMatches(logs: string, query: string): Array<{ start: number; end: number }> {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const haystack = logs.toLowerCase();
  const out: Array<{ start: number; end: number }> = [];
  let cursor = 0;
  while (cursor <= haystack.length) {
    const idx = haystack.indexOf(needle, cursor);
    if (idx === -1) break;
    out.push({ start: idx, end: idx + needle.length });
    cursor = idx + Math.max(needle.length, 1);
  }
  return out;
}

const SCROLL_THRESHOLD = 40;

export default function PodLogsPanel({ clusterId, pod, onClose }: Props) {
  const { message } = AntdApp.useApp();
  const { token } = theme.useToken();
  const { config } = useSettings();
  const defaultTail = config.log_tail_lines_default;

  const [container, setContainer] = useState<string | null>(
    pod.containers.length > 0 ? pod.containers[0] : null,
  );
  // draftTailLines drives the input; tailLines (debounced) triggers stream restart
  const [draftTailLines, setDraftTailLines] = useState(defaultTail);
  const [tailLines, setTailLines] = useState(defaultTail);

  const [logs, setLogs] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [wordWrap, setWordWrap] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [query, setQuery] = useState("");
  const [matchIndex, setMatchIndex] = useState(0);

  const sessionIdRef = useRef<string | null>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const currentMatchRef = useRef<HTMLElement | null>(null);

  // Debounce tail lines change → stream restart
  useEffect(() => {
    const t = setTimeout(() => setTailLines(draftTailLines), 600);
    return () => clearTimeout(t);
  }, [draftTailLines]);

  const matches = useMemo(() => logMatches(logs, query), [logs, query]);
  const matchLabel = query.trim()
    ? matches.length > 0 ? `${matchIndex + 1}/${matches.length}` : "0/0"
    : "";

  const renderedLogs = useMemo(() => {
    if (!logs) return null;
    if (matches.length === 0) return logs;
    const nodes: React.ReactNode[] = [];
    let cursor = 0;
    matches.forEach((m, i) => {
      if (m.start > cursor) nodes.push(logs.slice(cursor, m.start));
      nodes.push(
        <mark
          key={`${m.start}-${m.end}-${i}`}
          ref={i === matchIndex ? currentMatchRef : undefined}
          className={i === matchIndex ? "current" : undefined}
        >
          {logs.slice(m.start, m.end)}
        </mark>,
      );
      cursor = m.end;
    });
    if (cursor < logs.length) nodes.push(logs.slice(cursor));
    return nodes;
  }, [logs, matches, matchIndex]);

  const stopStream = useCallback(() => {
    const sid = sessionIdRef.current;
    sessionIdRef.current = null;
    if (sid) void api.logStreamStop(sid).catch(() => undefined);
  }, []);

  const startStream = useCallback(async () => {
    stopStream();
    setLogs("");
    setAutoScroll(true);
    setConnecting(true);

    const sessionId = crypto.randomUUID();
    sessionIdRef.current = sessionId;

    const ch = new Channel<LogEvent>();
    ch.onmessage = (ev) => {
      if (sessionIdRef.current !== sessionId) return;
      if (ev.kind === "line") {
        setLogs((prev) => prev + ev.data + "\n");
      } else if (ev.kind === "done") {
        if (sessionIdRef.current === sessionId) sessionIdRef.current = null;
        setConnecting(false);
      } else {
        message.error(`Log error: ${ev.message}`);
        if (sessionIdRef.current === sessionId) sessionIdRef.current = null;
        setConnecting(false);
      }
    };

    try {
      await api.logStreamStart({
        clusterId,
        namespace: pod.namespace,
        pod: pod.name,
        container,
        tailLines,
        follow: true,
        sessionId,
        channel: ch,
      });
      setConnecting(false);
    } catch (e) {
      message.error(`Failed to start log stream: ${(e as Error).message}`);
      if (sessionIdRef.current === sessionId) sessionIdRef.current = null;
      setConnecting(false);
    }
  }, [clusterId, pod.namespace, pod.name, container, tailLines, stopStream, message]);

  useEffect(() => {
    void startStream();
    return stopStream;
  }, [pod.namespace, pod.name, container, tailLines]);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (!autoScroll || !logContainerRef.current) return;
    const el = logContainerRef.current;
    requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
  }, [logs, autoScroll]);

  // Scroll event → detect if user left the bottom
  const handleScroll = useCallback(() => {
    const el = logContainerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_THRESHOLD;
    setAutoScroll(atBottom);
  }, []);

  const scrollToBottom = useCallback(() => {
    setAutoScroll(true);
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    if (matchIndex >= matches.length) setMatchIndex(0);
  }, [matchIndex, matches.length]);

  useEffect(() => {
    currentMatchRef.current?.scrollIntoView({ block: "center" });
  }, [matchIndex, matches.length]);

  const moveMatch = useCallback((dir: 1 | -1) => {
    if (matches.length === 0) return;
    setMatchIndex((c) => (c + dir + matches.length) % matches.length);
  }, [matches.length]);

  const isLive = sessionIdRef.current !== null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Toolbar */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "5px 12px",
        borderBottom: `1px solid ${token.colorBorderSecondary}`,
        background: token.colorBgContainer,
        flexShrink: 0,
        flexWrap: "wrap",
      }}>
        <Space size={4}>
          {connecting
            ? <LoadingOutlined style={{ fontSize: 12, color: token.colorPrimary }} />
            : <span style={{
                width: 8, height: 8, borderRadius: "50%", display: "inline-block",
                background: isLive ? "#52c41a" : token.colorTextQuaternary,
              }} />
          }
          <Text strong style={{ whiteSpace: "nowrap" }}>Logs: {pod.name}</Text>
        </Space>

        <Space size={4}>
          <Input
            allowClear
            size="small"
            prefix={<SearchOutlined />}
            placeholder="Search"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setMatchIndex(0); }}
            onPressEnter={(e) => { e.preventDefault(); moveMatch(1); }}
            style={{ width: 200 }}
          />
          {matchLabel && <Tag>{matchLabel}</Tag>}
          <Button size="small" disabled={matches.length === 0} onClick={() => moveMatch(-1)}>Prev</Button>
          <Button size="small" disabled={matches.length === 0} onClick={() => moveMatch(1)}>Next</Button>
        </Space>

        <div style={{ flex: 1 }} />

        <Space size={4} wrap>
          <Button size="small" onClick={() => setWordWrap((w) => !w)}>
            {wordWrap ? "No Wrap" : "Wrap"}
          </Button>
          {pod.containers.length > 1 && (
            <Select
              size="small"
              value={container ?? undefined}
              style={{ width: 160 }}
              onChange={setContainer}
              options={pod.containers.map((n) => ({ value: n, label: n }))}
            />
          )}
          <InputNumber
            size="small"
            min={1}
            max={100000}
            step={100}
            value={draftTailLines}
            onChange={(v) => { if (typeof v === "number" && v > 0) setDraftTailLines(Math.floor(v)); }}
            addonBefore="Tail"
            style={{ width: 140 }}
          />
          <Tooltip title={autoScroll ? "Already at bottom" : "Scroll to bottom and follow"}>
            <Button
              size="small"
              icon={<VerticalAlignBottomOutlined />}
              disabled={autoScroll}
              onClick={scrollToBottom}
            >
              Follow
            </Button>
          </Tooltip>
          <Tooltip title="Clear">
            <Button size="small" icon={<ClearOutlined />} onClick={() => { stopStream(); setLogs(""); }} disabled={!logs} />
          </Tooltip>
        </Space>
      </div>

      {/* Log content */}
      <div
        ref={logContainerRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "auto",
          padding: "8px 12px",
          background: token.colorFillQuaternary,
        }}
      >
        <pre
          className="pod-log-output"
          style={{
            margin: 0,
            padding: 0,
            height: "auto",
            background: "transparent",
            border: "none",
            overflow: "visible",
            color: token.colorText,
            fontFamily: "ui-monospace, 'JetBrains Mono', Menlo, monospace",
            fontSize: 12,
            ...(wordWrap
              ? { whiteSpace: "pre-wrap", wordBreak: "break-all" }
              : { whiteSpace: "pre" }),
          }}
        >
          {renderedLogs || (connecting ? "" : <Text type="secondary">(no logs)</Text>)}
        </pre>
      </div>
    </div>
  );
}
