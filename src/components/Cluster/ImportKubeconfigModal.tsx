import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Input, Modal, Space, Typography, App as AntdApp } from "antd";
import { FileAddOutlined } from "@ant-design/icons";
import { api } from "../../api";
import { validateYaml } from "../../utils/yamlValidation";

const { Text } = Typography;

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}

export default function ImportKubeconfigModal({ open, onClose, onSaved }: Props) {
  const { message } = AntdApp.useApp();
  const [yaml, setYaml] = useState("");
  const [saving, setSaving] = useState(false);
  const yamlValidation = useMemo(() => validateYaml(yaml), [yaml]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setYaml("");
  }, [open]);

  function handlePickFile() {
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setYaml(String(reader.result ?? ""));
    };
    reader.onerror = () => {
      message.error("Failed to read file");
    };
    reader.readAsText(file);
  }

  async function handleSubmit() {
    const text = yaml.trim();
    if (!text) {
      message.error("Paste a kubeconfig YAML first");
      return;
    }
    if (!yamlValidation.ok) {
      message.error(yamlValidation.message ?? "Invalid YAML");
      return;
    }
    setSaving(true);
    try {
      const res = await api.importKubeconfig(text);
      const added = res.added ?? 0;
      message.success(
        added > 0 ? `Imported ${added} cluster${added === 1 ? "" : "s"}` : "Kubeconfig imported",
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
      title="Import kubeconfig"
      open={open}
      onCancel={onClose}
      width={720}
      destroyOnClose
      footer={
        <Space>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="primary" loading={saving} disabled={!!yaml.trim() && !yamlValidation.ok} onClick={handleSubmit}>
            Import
          </Button>
        </Space>
      }
    >
      <Space direction="vertical" size={12} style={{ width: "100%" }}>
        <Space style={{ width: "100%", justifyContent: "space-between" }}>
          <Text type="secondary">
            Paste a kubeconfig YAML below; its contexts are merged into the managed config.
          </Text>
          <Button icon={<FileAddOutlined />} onClick={handlePickFile}>
            Load from file
          </Button>
        </Space>
        <input
          ref={fileInputRef}
          type="file"
          accept=".yaml,.yml,.conf,.config,text/yaml,text/plain"
          style={{ display: "none" }}
          onChange={handleFileChange}
        />
        {!!yaml.trim() && !yamlValidation.ok && (
          <Alert type="error" showIcon message={yamlValidation.message ?? "Invalid YAML"} />
        )}
        <Input.TextArea
          value={yaml}
          onChange={(e) => setYaml(e.target.value)}
          placeholder={"apiVersion: v1\nkind: Config\nclusters:\n- cluster:\n    server: https://...\n  name: ..."}
          autoSize={{ minRows: 14, maxRows: 24 }}
          spellCheck={false}
          style={{ fontFamily: "ui-monospace, 'JetBrains Mono', Menlo, monospace", fontSize: 12 }}
        />
      </Space>
    </Modal>
  );
}
