import { useEffect, useState } from "react";
import { Button, Modal, Select, Space, Typography, App as AntdApp } from "antd";
import { api } from "../../api";
import type { ClusterConfig } from "../../types";

const { Text } = Typography;

interface Props {
  open: boolean;
  cluster: ClusterConfig | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}

export default function NamespaceConfigModal({ open, cluster, onClose, onSaved }: Props) {
  const { message } = AntdApp.useApp();
  const [values, setValues] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setValues(cluster?.custom_namespaces ?? []);
  }, [open, cluster]);

  async function handleSave() {
    if (!cluster) return;
    setSaving(true);
    try {
      const cleaned = Array.from(
        new Set(values.map((v) => v.trim()).filter((v) => v.length > 0)),
      );
      await api.setNamespaceOverride(cluster.id, cleaned);
      message.success(
        cleaned.length > 0
          ? `Saved ${cleaned.length} namespace${cleaned.length === 1 ? "" : "s"}`
          : "Cleared — will auto-list all namespaces",
      );
      await onSaved();
      onClose();
    } catch (err) {
      message.error(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={cluster ? `Namespaces: ${cluster.name}` : "Namespaces"}
      open={open}
      onCancel={onClose}
      width={560}
      destroyOnClose
      footer={
        <Space>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="primary" loading={saving} onClick={handleSave}>
            Save
          </Button>
        </Space>
      }
    >
      <Space direction="vertical" size={12} style={{ width: "100%" }}>
        <Text type="secondary">Specify namespaces visible for this cluster. Leave empty to auto-list all namespaces.</Text>
        <Select
          mode="tags"
          value={values}
          onChange={setValues}
          style={{ width: "100%" }}
          placeholder="Type a namespace and press Enter, e.g. default or kube-system"
          tokenSeparators={[",", " ", "\n"]}
          open={false}
          allowClear
        />
      </Space>
    </Modal>
  );
}
