import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Select, Space, Typography, theme, App as AntdApp } from "antd";
import { DownloadOutlined, ReloadOutlined } from "@ant-design/icons";
import { Channel } from "@tauri-apps/api/core";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { api } from "../../api";
import type { ExecEvent } from "../../types";
import PodDownloadModal from "./PodDownloadModal";

const { Text } = Typography;

const TERM_THEME = {
  background: "#1e1e1e",
  foreground: "#d4d4d4",
  cursor: "#d4d4d4",
};

const TERMINAL_FONT_FAMILY =
  "'Cascadia Mono', 'Cascadia Code', Menlo, Consolas, 'DejaVu Sans Mono', 'Liberation Mono', monospace";

interface Props {
  clusterId: string;
  namespace: string;
  pod: string;
  containers: string[];
  onClose: () => void;
  isVisible?: boolean;
}

export default function PodExecPanel({ clusterId, namespace, pod, containers, onClose, isVisible = true }: Props) {
  const { message } = AntdApp.useApp();
  const { token } = theme.useToken();

  const [container, setContainer] = useState<string | null>(
    containers.length > 0 ? containers[0] : null,
  );

  const mountRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const sessionRef = useRef<string | null>(null);

  // Track the working directory inside the terminal
  const cwdRef = useRef<string>("/");

  // Download modal state
  const [downloadModalOpen, setDownloadModalOpen] = useState(false);

  // Callback used to intercept user input for cd tracking
  const sendTerminalData = useCallback((d: string) => {
    const sid = sessionRef.current;
    if (sid) void api.execWrite(sid, d).catch(() => undefined);

    // Track `cd` commands to maintain cwd state
    // Handle patterns: cd /path, cd  /path, cd path, cd -
    const cdMatch = d.match(/cd\s+(.+?)(;|\||\n|&&|\|\||\r|$)/s);
    if (cdMatch) {
      let target = cdMatch[1].trim();
      // Handle quoted paths
      target = target.replace(/^["']|["']$/g, "");
      if (target.startsWith("/")) {
        cwdRef.current = target;
      } else if (target === "~") {
        cwdRef.current = "/root";
      } else if (target.startsWith("~/")) {
        cwdRef.current = "/root/" + target.slice(2);
      } else if (target !== ".." && target !== ".") {
        // Relative path
        const base = cwdRef.current.endsWith("/") ? cwdRef.current : cwdRef.current + "/";
        cwdRef.current = base + target;
      } else if (target === "..") {
        const parts = cwdRef.current.split("/").filter(Boolean);
        parts.pop();
        cwdRef.current = "/" + parts.join("/");
        if (cwdRef.current === "") cwdRef.current = "/";
      }
    }
  }, []);

  // Extract cwd from the terminal prompt (last few lines)
  const extractCwdFromBuffer = useCallback((term: Terminal): string | null => {
    const buffer = term.buffer.active;
    if (!buffer) return null;

    // Scan the last 10 lines for a prompt pattern
    for (let i = Math.max(0, buffer.cursorY - 1); i >= Math.max(0, buffer.cursorY - 10); i--) {
      const line = buffer.getLine(i)?.translateToString(true);
      if (!line) continue;

      // Match common shell prompt patterns:
      // user@host:/path$  user@host:/path#  /path$  /path#
      // Handles paths like: /app, /app/sub, /, /root, etc.
      const match = line.match(/:([/][^\s$#]*?)[\s]*[$#]\s*$/);
      if (match) {
        const extracted = match[1];
        if (extracted && extracted !== cwdRef.current) {
          cwdRef.current = extracted;
        }
        return extracted;
      }
    }
    return null;
  }, []);

  const stopSession = useCallback(() => {
    const sid = sessionRef.current;
    sessionRef.current = null;
    if (sid) void api.execStop(sid).catch(() => undefined);
  }, []);

  const startSession = useCallback(async () => {
    const term = termRef.current;
    const fit = fitRef.current;
    if (!term) return;

    stopSession();
    term.reset();

    // Use proposeDimensions + manual resize.
    // +1 compensates for Math.floor rounding in FitAddon's column calculation.
    requestAnimationFrame(() => {
      if (!fit) return;
      const dims = fit.proposeDimensions();
      if (!dims) return;
      const cols = dims.cols + 1;
      const rows = dims.rows;
      if (term.cols !== cols || term.rows !== rows) {
        term.resize(cols, rows);
      }
    });

    const sessionId = crypto.randomUUID();
    sessionRef.current = sessionId;

    const ch = new Channel<ExecEvent>();
    ch.onmessage = (ev) => {
      if (sessionRef.current !== sessionId) return;
      if (ev.kind === "data") {
        term.write(ev.data);
      } else {
        const msg = ev.message ? ` ${ev.message}` : "";
        term.write(`\r\n\x1b[2m[process exited${msg}]\x1b[0m\r\n`);
        if (sessionRef.current === sessionId) sessionRef.current = null;
      }
    };

    try {
      await api.execStart({ clusterId, namespace, pod, container, command: null, sessionId, channel: ch });
      if (sessionRef.current === sessionId) {
        void api.execResize(sessionId, term.cols, term.rows).catch(() => undefined);
      }
      term.focus();
    } catch (e) {
      if (sessionRef.current === sessionId) sessionRef.current = null;
      term.write(`\r\n\x1b[31mFailed to start terminal session: ${(e as Error).message}\x1b[0m\r\n`);
      message.error(`Terminal connection failed: ${(e as Error).message}`);
    }
  }, [clusterId, namespace, pod, container, stopSession, message]);

  // Mount / unmount terminal
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const term = new Terminal({
      fontFamily: TERMINAL_FONT_FAMILY,
      fontSize: 13,
      letterSpacing: 0,
      lineHeight: 1.2,
      cursorBlink: true,
      convertEol: false,
      theme: TERM_THEME,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(mount);

    termRef.current = term;
    fitRef.current = fit;

    const dataDisp = term.onData((d) => {
      sendTerminalData(d);

      // Periodically extract cwd from terminal buffer
      extractCwdFromBuffer(term);
    });

    const doFit = () => {
      try {
        const dims = fit.proposeDimensions();
        if (!dims) return;
        const cols = dims.cols + 1;
        const rows = dims.rows;
        if (term.cols !== cols || term.rows !== rows) {
          term.resize(cols, rows);
        }
        const sid = sessionRef.current;
        if (sid) void api.execResize(sid, term.cols, term.rows).catch(() => undefined);
      } catch { /* ignore */ }
    };

    const ro = new ResizeObserver(doFit);
    ro.observe(mount);
    window.addEventListener("resize", doFit);

    // Defer initial fit + session start to next frame
    requestAnimationFrame(() => {
      const dims = fit.proposeDimensions();
      if (dims) {
        term.resize(dims.cols + 1, dims.rows);
      }
      void startSession();
    });

    return () => {
      window.removeEventListener("resize", doFit);
      ro.disconnect();
      dataDisp.dispose();
      stopSession();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Container change → reconnect
  useEffect(() => {
    if (!termRef.current) return;
    void startSession();
  }, [container, startSession]);

  // Tab becomes visible → re-fit so xterm fills the container
  useEffect(() => {
    if (!isVisible || !termRef.current || !fitRef.current) return;
    requestAnimationFrame(() => {
      if (!termRef.current || !fitRef.current) return;
      const dims = fitRef.current.proposeDimensions();
      if (!dims) return;
      termRef.current.resize(dims.cols + 1, dims.rows);
      const sid = sessionRef.current;
      if (sid) void api.execResize(sid, termRef.current.cols, termRef.current.rows).catch(() => undefined);
    });
  }, [isVisible]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Toolbar */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "5px 12px",
        borderBottom: `1px solid ${token.colorBorderSecondary}`,
        background: TERM_THEME.background,
        flexShrink: 0,
      }}>
        <Text strong style={{ whiteSpace: "nowrap", marginRight: 4, color: TERM_THEME.foreground }}>
          Terminal: {pod}
        </Text>
        <div style={{ flex: 1 }} />
        <Space size={4}>
          {containers.length > 1 && (
            <Select
              size="small"
              value={container ?? undefined}
              style={{ width: 180 }}
              onChange={setContainer}
              options={containers.map((c) => ({ value: c, label: c }))}
            />
          )}
          <Button
            size="small"
            icon={<DownloadOutlined />}
            onClick={() => setDownloadModalOpen(true)}
          >
            Download
          </Button>
          <Button size="small" icon={<ReloadOutlined />} onClick={() => void startSession()}>
            Reconnect
          </Button>
        </Space>
      </div>

      {/* xterm */}
      <div
        ref={mountRef}
        style={{
          flex: 1,
          minHeight: 0,
          background: TERM_THEME.background,
        }}
      />

      <PodDownloadModal
        clusterId={clusterId}
        namespace={namespace}
        pod={pod}
        container={container}
        cwd={cwdRef.current}
        open={downloadModalOpen}
        onCancel={() => setDownloadModalOpen(false)}
      />
    </div>
  );
}
