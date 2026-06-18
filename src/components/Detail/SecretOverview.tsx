import { useState } from "react";
import {
  App, Button, Card, Descriptions, Input, Popconfirm, Space, Tag, Typography,
} from "antd";
import { DeleteOutlined, EditOutlined, EyeInvisibleOutlined, EyeOutlined, PlusOutlined } from "@ant-design/icons";
import type { ResourceTarget, KubeObject } from "./ResourceDetailDrawer";
import { api } from "../../api";
import { formatAge, formatTimestamp } from "../../utils/format";
import MetadataEditor from "../Common/MetadataEditor";

const { Text } = Typography;

interface Props {
  obj: KubeObject;
  clusterId: string;
  target: ResourceTarget;
  reload: () => void;
  onChanged?: () => void | Promise<void>;
}

interface DataRow { id: string; key: string; value: string; }

function toMs(ts: unknown): number | null {
  if (typeof ts !== "string" || !ts) return null;
  const ms = Date.parse(ts);
  return Number.isNaN(ms) ? null : ms;
}

const preStyle: React.CSSProperties = {
  margin: 0,
  padding: "8px 12px",
  fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
  fontSize: 12,
  whiteSpace: "pre-wrap",
  wordBreak: "break-all",
  maxHeight: 320,
  overflow: "auto",
  background: "rgba(0,0,0,0.02)",
  borderRadius: 4,
};

export default function SecretOverview({ obj, clusterId, target, reload, onChanged }: Props) {
  const { message } = App.useApp();

  // Reveal state
  const [revealedValues, setRevealedValues] = useState<Record<string, string> | null>(null);
  const [revealing, setRevealing] = useState(false);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [draftRows, setDraftRows] = useState<DataRow[]>([]);
  const [saving, setSaving] = useState(false);

  const handleDelete = async () => {
    try {
      await api.deleteResource(clusterId, target.apiVersion, target.kind, target.namespace, target.name);
      message.success(`Deleted Secret ${target.name}`);
      await onChanged?.();
    } catch (e) {
      message.error(`Delete failed: ${(e as Error).message}`);
    }
  };

  const handleRevealAll = async () => {
    if (!target.namespace) return;
    setRevealing(true);
    try {
      const values = await api.getSecretValues(clusterId, target.namespace, target.name);
      setRevealedValues(values);
    } catch (e) {
      message.error(`Failed to reveal values: ${(e as Error).message}`);
    } finally {
      setRevealing(false);
    }
  };

  const meta = obj?.metadata ?? {};
  const dataKeys: string[] = obj?.data ? Object.keys(obj.data) : [];
  const createdMs = toMs(meta.creationTimestamp);

  const startEdit = async () => {
    // Reveal values first so we can edit them
    let values = revealedValues;
    if (!values && target.namespace) {
      setRevealing(true);
      try {
        values = await api.getSecretValues(clusterId, target.namespace, target.name);
        setRevealedValues(values);
      } catch (e) {
        message.error(`Failed to load values: ${(e as Error).message}`);
        setRevealing(false);
        return;
      } finally {
        setRevealing(false);
      }
    }
    const rows: DataRow[] = Object.entries(values ?? {}).map(([key, value]) => ({
      id: key, key, value,
    }));
    setDraftRows(rows);
    setEditing(true);
  };

  const cancelEdit = () => { setEditing(false); setDraftRows([]); };

  const updateRow = (id: string, field: "key" | "value", val: string) =>
    setDraftRows((rows) => rows.map((r) => r.id === id ? { ...r, [field]: val } : r));

  const hasDup = () => {
    const keys = draftRows.map((r) => r.key.trim()).filter(Boolean);
    return keys.length !== new Set(keys).size;
  };

  const saveData = async () => {
    if (!target.namespace) return;
    if (draftRows.some((r) => !r.key.trim())) { message.error("Key cannot be empty"); return; }
    if (hasDup()) { message.error("Duplicate keys"); return; }
    const newData: Record<string, string> = {};
    for (const r of draftRows) { const k = r.key.trim(); if (k) newData[k] = r.value; }
    setSaving(true);
    try {
      await api.updateSecretData(clusterId, target.namespace, target.name, newData);
      message.success("Secret updated");
      setEditing(false);
      setRevealedValues(null); // will reload from server
      reload();
      await onChanged?.();
    } catch (e) {
      message.error(`Update failed: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Space direction="vertical" size="middle" style={{ display: "flex" }}>

      {/* Overview */}
      <Card
        size="small"
        title="Overview"
        extra={
          <Popconfirm title="Delete this Secret?" okText="Delete" okButtonProps={{ danger: true }}
            cancelText="Cancel" onConfirm={handleDelete}>
            <Button size="small" danger>Delete</Button>
          </Popconfirm>
        }
      >
        <Descriptions size="small" column={1} bordered>
          <Descriptions.Item label="Name">{meta.name ?? "-"}</Descriptions.Item>
          <Descriptions.Item label="Namespace">{meta.namespace ?? "-"}</Descriptions.Item>
          <Descriptions.Item label="Type">{obj?.type ?? "-"}</Descriptions.Item>
          <Descriptions.Item label="Age">
            <span title={formatTimestamp(createdMs) ?? undefined}>{formatAge(createdMs)}</span>
          </Descriptions.Item>

        </Descriptions>
      </Card>

      {/* Data */}
      <Card
        size="small"
        title={`Data (${dataKeys.length})`}
        extra={
          editing ? (
            <Space size={4}>
              <Button size="small" icon={<PlusOutlined />}
                onClick={() => setDraftRows((r) => [...r, { id: `new-${Date.now()}`, key: "", value: "" }])}>
                Add
              </Button>
              <Button size="small" onClick={cancelEdit} disabled={saving}>Cancel</Button>
              <Button size="small" type="primary" onClick={saveData} loading={saving}>Save</Button>
            </Space>
          ) : (
            <Space size={4}>
              <Button
                size="small"
                icon={revealedValues ? <EyeInvisibleOutlined /> : <EyeOutlined />}
                loading={revealing && !editing}
                onClick={revealedValues ? () => setRevealedValues(null) : handleRevealAll}
              >
                {revealedValues ? "Hide" : "Reveal"}
              </Button>
              <Button size="small" icon={<EditOutlined />} loading={revealing} onClick={() => void startEdit()}>
                Edit
              </Button>
            </Space>
          )
        }
      >
        {dataKeys.length === 0 && !editing ? (
          <Text type="secondary">No data</Text>
        ) : editing ? (
          /* Edit mode */
          <Space direction="vertical" size={8} style={{ width: "100%" }}>
            {draftRows.map((row) => (
              <div key={row.id}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                  <Input
                    size="small"
                    value={row.key}
                    placeholder="key"
                    style={{ width: 220, fontFamily: "monospace" }}
                    onChange={(e) => updateRow(row.id, "key", e.target.value)}
                  />
                  <Button type="text" size="small" danger icon={<DeleteOutlined />}
                    onClick={() => setDraftRows((r) => r.filter((x) => x.id !== row.id))} />
                </div>
                <Input.TextArea
                  value={row.value}
                  placeholder="value"
                  autoSize={{ minRows: 2, maxRows: 16 }}
                  style={{ fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace", fontSize: 12 }}
                  onChange={(e) => updateRow(row.id, "value", e.target.value)}
                />
              </div>
            ))}
            {draftRows.length === 0 && (
              <Text type="secondary">No data. Click Add to create a key.</Text>
            )}
          </Space>
        ) : (
          /* Read-only mode */
          <Space direction="vertical" size="middle" style={{ display: "flex" }}>
            {dataKeys.map((key) => (
              <div key={key}>
                <Text strong code style={{ wordBreak: "break-all" }}>{key}</Text>
                <pre style={preStyle}>
                  {revealedValues ? (revealedValues[key] ?? "-") : "***"}
                </pre>
              </div>
            ))}
          </Space>
        )}
      </Card>

      {/* Labels + Annotations */}
      <MetadataEditor
        clusterId={clusterId}
        target={target}
        labels={meta.labels ?? {}}
        annotations={meta.annotations ?? {}}
        reload={reload}
        onChanged={onChanged}
      />

    </Space>
  );
}
