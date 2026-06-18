import { useMemo, useState } from "react";
import { App, Button, Card, Descriptions, Input, Popconfirm, Space, Tag, Tooltip, Typography } from "antd";
import { DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
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

export default function ConfigMapOverview({ obj, clusterId, target, reload, onChanged }: Props) {
  const { message } = App.useApp();

  const meta = obj?.metadata ?? {};
  const data: Record<string, string> = obj?.data ?? {};
  const binaryData: Record<string, string> = obj?.binaryData ?? {};
  const dataEntries = Object.entries(data);
  const binaryKeys = Object.keys(binaryData);
  const createdMs = toMs(meta.creationTimestamp);

  // Data edit state
  const [editing, setEditing] = useState(false);
  const [draftRows, setDraftRows] = useState<DataRow[]>([]);
  const [saving, setSaving] = useState(false);

  const dataRows = useMemo(
    () => Object.entries(data).map(([key, value]) => ({ id: key, key, value })),
    [data],
  );

  const startEdit = () => {
    setDraftRows(dataRows);
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
      await api.updateConfigMapData(clusterId, target.namespace, target.name, newData);
      message.success("ConfigMap data updated");
      setEditing(false);
      reload();
      await onChanged?.();
    } catch (e) {
      message.error(`Update failed: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await api.deleteResource(clusterId, target.apiVersion, target.kind, target.namespace, target.name);
      message.success(`Deleted ConfigMap ${target.name}`);
      await onChanged?.();
    } catch (e) {
      message.error(`Delete failed: ${(e as Error).message}`);
    }
  };

  return (
    <Space direction="vertical" size="middle" style={{ display: "flex" }}>

      {/* Overview */}
      <Card
        size="small"
        title="Overview"
        extra={
          <Popconfirm title="Delete this ConfigMap?" okText="Delete" okButtonProps={{ danger: true }}
            cancelText="Cancel" onConfirm={handleDelete}>
            <Button size="small" danger>Delete</Button>
          </Popconfirm>
        }
      >
        <Descriptions size="small" column={1} bordered>
          <Descriptions.Item label="Name">{meta.name ?? "-"}</Descriptions.Item>
          <Descriptions.Item label="Namespace">{meta.namespace ?? "-"}</Descriptions.Item>
          <Descriptions.Item label="Data Items">
            {dataEntries.length}{binaryKeys.length > 0 ? ` (+${binaryKeys.length} binary)` : ""}
          </Descriptions.Item>
          <Descriptions.Item label="Age">
            <Tooltip title={formatTimestamp(createdMs)}>{formatAge(createdMs)}</Tooltip>
          </Descriptions.Item>
        </Descriptions>
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

      {/* Data */}
      <Card
        size="small"
        title={`Data (${dataEntries.length})`}
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
            <Button size="small" icon={<EditOutlined />} onClick={startEdit}>Edit</Button>
          )
        }
      >
        {editing ? (
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
              <Text type="secondary">No data items. Click Add to create one.</Text>
            )}
          </Space>
        ) : (
          /* Read-only mode */
          dataEntries.length === 0 ? (
            <Text type="secondary">No data items</Text>
          ) : (
            <Space direction="vertical" size="middle" style={{ display: "flex" }}>
              {dataEntries.map(([key, value]) => (
                <div key={key}>
                  <Text strong style={{ wordBreak: "break-all" }}>{key}</Text>
                  <pre style={preStyle}>{value ?? ""}</pre>
                </div>
              ))}
            </Space>
          )
        )}
      </Card>

      {/* Binary Data */}
      {binaryKeys.length > 0 && (
        <Card size="small" title={`Binary Data (${binaryKeys.length})`}>
          <Space size={[4, 4]} wrap>
            {binaryKeys.map((key) => (
              <Tag key={key} style={{ margin: 0 }}>{key} (binary)</Tag>
            ))}
          </Space>
        </Card>
      )}

    </Space>
  );
}
