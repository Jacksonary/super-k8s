import { useCallback, useEffect, useState } from "react";
import { Button, Drawer, Empty, InputNumber, Select, Space, Typography, theme, App as AntdApp } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { api } from "../../api";
import type { PodInfo } from "../../types";

const { Text } = Typography;

interface Props {
  open: boolean;
  clusterId: string;
  pod: PodInfo | null;
  defaultTailLines: number;
  onClose: () => void;
}

export default function PodLogsDrawer({ open, clusterId, pod, defaultTailLines, onClose }: Props) {
  const { message } = AntdApp.useApp();
  const { token } = theme.useToken();

  const [container, setContainer] = useState<string | null>(null);
  const [tailLines, setTailLines] = useState<number>(defaultTailLines);
  const [logs, setLogs] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!pod) return;
    setLoading(true);
    try {
      const text = await api.getPodLogs(clusterId, pod.namespace, pod.name, container, tailLines);
      setLogs(text);
    } catch (err) {
      message.error(String(err));
      setLogs("");
    } finally {
      setLoading(false);
    }
  }, [clusterId, pod, container, tailLines, message]);

  // When the drawer opens for a (new) pod, reset controls and fetch logs.
  useEffect(() => {
    if (!open || !pod) return;
    const initial = pod.containers.length > 0 ? pod.containers[0] : null;
    setContainer(initial);
    setTailLines(defaultTailLines);
  }, [open, pod, defaultTailLines]);

  useEffect(() => {
    if (open && pod) void load();
  }, [open, pod, container, load]);

  return (
    <Drawer
      title={pod ? `Logs: ${pod.name}` : "Logs"}
      placement="right"
      width={840}
      open={open}
      onClose={onClose}
      destroyOnClose
      extra={
        <Space>
          {pod && pod.containers.length > 1 && (
            <Select
              size="small"
              value={container ?? undefined}
              style={{ width: 200 }}
              onChange={(v) => setContainer(v)}
              options={pod.containers.map((c) => ({ value: c, label: c }))}
            />
          )}
          <InputNumber
            size="small"
            min={1}
            max={100000}
            step={100}
            value={tailLines}
            onChange={(v) => {
              if (typeof v === "number" && Number.isFinite(v) && v > 0) setTailLines(Math.floor(v));
            }}
            addonBefore="Tail"
            style={{ width: 160 }}
          />
          <Button size="small" icon={<ReloadOutlined />} onClick={load} loading={loading}>
            Refresh
          </Button>
        </Space>
      }
    >
      {!pod ? (
        <Empty description="No pod selected" />
      ) : (
        <pre
          style={{
            background: token.colorFillQuaternary,
            border: `1px solid ${token.colorBorderSecondary}`,
            borderRadius: 4,
            padding: 12,
            margin: 0,
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
            fontFamily: "ui-monospace, 'JetBrains Mono', Menlo, monospace",
            fontSize: 12,
            height: "calc(100vh - 140px)",
            overflow: "auto",
            color: token.colorText,
          }}
        >
          {logs || (loading ? "" : <Text type="secondary">(no logs)</Text>)}
        </pre>
      )}
    </Drawer>
  );
}
