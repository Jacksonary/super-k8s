import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Drawer, Select, Space, App as AntdApp } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { Channel } from "@tauri-apps/api/core";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { api } from "../../api";
import type { ExecEvent } from "../../types";

interface Props {
  open: boolean;
  clusterId: string;
  namespace: string;
  pod: string;
  containers: string[];
  onClose: () => void;
}

const TERM_THEME = {
  background: "#1e1e1e",
  foreground: "#d4d4d4",
  cursor: "#d4d4d4",
};

const TERMINAL_FONT_FAMILY = "'Cascadia Mono', 'Cascadia Code', Menlo, Consolas, 'DejaVu Sans Mono', 'Liberation Mono', monospace";

export default function PodExecDrawer({
  open,
  clusterId,
  namespace,
  pod,
  containers,
  onClose,
}: Props) {
  const { message } = AntdApp.useApp();

  const [container, setContainer] = useState<string | null>(
    containers.length > 0 ? containers[0] : null,
  );

  const mountRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const sessionRef = useRef<string | null>(null);
  const resizeObsRef = useRef<ResizeObserver | null>(null);

  useEffect(() => {
    if (open) {
      setContainer(containers.length > 0 ? containers[0] : null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pod, namespace]);

  const stopSession = useCallback(() => {
    const sid = sessionRef.current;
    sessionRef.current = null;
    if (sid) {
      void api.execStop(sid).catch(() => undefined);
    }
  }, []);

  const startSession = useCallback(async () => {
    const term = termRef.current;
    const fit = fitRef.current;
    if (!term) return;

    stopSession();

    term.reset();
    fit?.fit();

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
      await api.execStart({
        clusterId,
        namespace,
        pod,
        container,
        command: null,
        sessionId,
        channel: ch,
      });
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

  useEffect(() => {
    if (!open) return;
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
    fit.fit();

    termRef.current = term;
    fitRef.current = fit;

    const dataDisp = term.onData((d) => {
      const sid = sessionRef.current;
      if (sid) void api.execWrite(sid, d).catch(() => undefined);
    });

    const doFit = () => {
      try {
        fit.fit();
        const sid = sessionRef.current;
        if (sid) void api.execResize(sid, term.cols, term.rows).catch(() => undefined);
      } catch {
      }
    };
    const ro = new ResizeObserver(() => doFit());
    ro.observe(mount);
    resizeObsRef.current = ro;
    window.addEventListener("resize", doFit);

    void startSession();

    return () => {
      window.removeEventListener("resize", doFit);
      ro.disconnect();
      resizeObsRef.current = null;
      dataDisp.dispose();
      stopSession();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (!termRef.current) return;
    void startSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [container]);

  return (
    <Drawer
      title={`Terminal: ${pod}`}
      placement="right"
      width={900}
      open={open}
      onClose={onClose}
      destroyOnClose
      styles={{ body: { padding: 0, background: TERM_THEME.background } }}
      extra={
        <Space>
          {containers.length > 1 && (
            <Select
              size="small"
              value={container ?? undefined}
              style={{ width: 220 }}
              onChange={(v) => setContainer(v)}
              options={containers.map((c) => ({ value: c, label: c }))}
            />
          )}
          <Button size="small" icon={<ReloadOutlined />} onClick={() => void startSession()}>
            Reconnect
          </Button>
        </Space>
      }
    >
      <div
        ref={mountRef}
        style={{
          width: "100%",
          height: "calc(100vh - 56px)",
          padding: 8,
          boxSizing: "border-box",
          background: TERM_THEME.background,
        }}
      />
    </Drawer>
  );
}
