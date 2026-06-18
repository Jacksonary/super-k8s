import { useMemo, useState } from "react";
import { App, Button, Card, Input, Space, Typography } from "antd";
import { DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import type { ResourceTarget } from "../Detail/ResourceDetailDrawer";
import { api } from "../../api";
import KvDescriptions from "./KvDescriptions";

const { Text } = Typography;

interface KvRow { id: string; key: string; value: string; }
type Section = "labels" | "annotations";

function rowsFromRecord(r: Record<string, string>): KvRow[] {
  return Object.entries(r).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => ({ id: key, key, value }));
}
function recordFromRows(rows: KvRow[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of rows) { const k = r.key.trim(); if (k) out[k] = r.value; }
  return out;
}
function hasDup(rows: KvRow[]): boolean {
  const seen = new Set<string>();
  for (const r of rows) { const k = r.key.trim(); if (!k) continue; if (seen.has(k)) return true; seen.add(k); }
  return false;
}

interface Props {
  clusterId: string;
  target: ResourceTarget;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  reload: () => void;
  onChanged?: () => void | Promise<void>;
}

/**
 * Reusable Labels + Annotations editor cards.
 * Renders two Cards (Labels, Annotations) with inline editing.
 * Calls api.updateResourceMetadata on save — works for any K8s resource.
 */
export default function MetadataEditor({ clusterId, target, labels, annotations, reload, onChanged }: Props) {
  const { message } = App.useApp();

  const [editSection, setEditSection] = useState<Section | null>(null);
  const [draftRows, setDraftRows] = useState<KvRow[]>([]);
  const [saving, setSaving] = useState(false);

  const labelRows = useMemo(() => rowsFromRecord(labels), [labels]);
  const annotationRows = useMemo(() => rowsFromRecord(annotations), [annotations]);

  const startEdit = (section: Section) => {
    setEditSection(section);
    setDraftRows(section === "labels" ? labelRows : annotationRows);
  };
  const cancelEdit = () => { setEditSection(null); setDraftRows([]); };

  const updateRow = (id: string, field: "key" | "value", val: string) =>
    setDraftRows((rows) => rows.map((r) => r.id === id ? { ...r, [field]: val } : r));

  const save = async () => {
    if (!editSection) return;
    if (draftRows.some((r) => !r.key.trim())) { message.error("Key cannot be empty"); return; }
    if (hasDup(draftRows)) { message.error("Duplicate keys"); return; }
    const nextLabels = editSection === "labels" ? recordFromRows(draftRows) : labels;
    const nextAnnotations = editSection === "annotations" ? recordFromRows(draftRows) : annotations;
    setSaving(true);
    try {
      await api.updateResourceMetadata(
        clusterId, target.apiVersion, target.kind,
        target.namespace ?? null, target.name,
        nextLabels, nextAnnotations,
      );
      message.success("Updated");
      cancelEdit();
      reload();
      await onChanged?.();
    } catch (e) {
      message.error(`Update failed: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const editExtra = (section: Section) =>
    editSection === section ? (
      <Space size={4}>
        <Button size="small" icon={<PlusOutlined />}
          onClick={() => setDraftRows((r) => [...r, { id: `new-${Date.now()}`, key: "", value: "" }])}>
          Add
        </Button>
        <Button size="small" onClick={cancelEdit} disabled={saving}>Cancel</Button>
        <Button size="small" type="primary" onClick={save} loading={saving}>Save</Button>
      </Space>
    ) : (
      <Button size="small" icon={<EditOutlined />} onClick={() => startEdit(section)}>Edit</Button>
    );

  const editor = () => (
    <Space direction="vertical" size={4} style={{ width: "100%" }}>
      {draftRows.map((row) => (
        <div key={row.id} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <Input size="small" value={row.key} placeholder="key"
            style={{ width: 200, marginTop: 1 }}
            onChange={(e) => updateRow(row.id, "key", e.target.value)} />
          <Input.TextArea size="small" value={row.value} placeholder="value"
            style={{ flex: 1, fontFamily: "ui-monospace, Menlo, monospace", fontSize: 12 }}
            autoSize={{ minRows: 1, maxRows: 8 }}
            onChange={(e) => updateRow(row.id, "value", e.target.value)} />
          <Button type="text" size="small" danger icon={<DeleteOutlined />} style={{ marginTop: 1 }}
            onClick={() => setDraftRows((r) => r.filter((x) => x.id !== row.id))} />
        </div>
      ))}
      {draftRows.length === 0 && <Text type="secondary">No entries. Click Add to create one.</Text>}
    </Space>
  );

  return (
    <>
      <Card size="small" title={`Labels (${labelRows.length})`} extra={editExtra("labels")}>
        {editSection === "labels" ? editor() : <KvDescriptions data={labels} emptyText="No labels" />}
      </Card>

      <Card size="small" title={`Annotations (${annotationRows.length})`} extra={editExtra("annotations")}>
        {editSection === "annotations" ? editor() : <KvDescriptions data={annotations} emptyText="No annotations" />}
      </Card>
    </>
  );
}
