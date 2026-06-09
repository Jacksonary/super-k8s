import { Card, Checkbox, Descriptions, InputNumber, Radio, Space, Typography, App as AntdApp } from "antd";
import { useSettings } from "../store/settingsStore";

const { Text } = Typography;

export default function Settings() {
  const { config, loading, save } = useSettings();
  const { message } = AntdApp.useApp();

  async function handleSave(patch: Parameters<typeof save>[0]) {
    try {
      await save(patch);
      message.success("Settings saved");
    } catch (e) {
      message.error(String(e));
    }
  }

  return (
    <Space
      direction="vertical"
      size={16}
      style={{ width: "100%", maxWidth: 720, flex: 1, minHeight: 0, overflow: "auto" }}
    >
      <Card size="small" title="Preferences">
        <Descriptions column={1} size="small" labelStyle={{ width: 220 }}>
          <Descriptions.Item label="Theme">
            <Radio.Group
              value={config.theme === "light" ? "light" : "dark"}
              disabled={loading}
              onChange={(e) => handleSave({ theme: e.target.value as "light" | "dark" })}
            >
              <Radio.Button value="dark">Dark</Radio.Button>
              <Radio.Button value="light">Light</Radio.Button>
            </Radio.Group>
          </Descriptions.Item>
          <Descriptions.Item label="Language">
            <Radio.Group
              value={config.language === "en" ? "en" : "zh"}
              disabled={loading}
              onChange={(e) => handleSave({ language: e.target.value as "zh" | "en" })}
            >
              <Radio.Button value="zh">中文</Radio.Button>
              <Radio.Button value="en">English</Radio.Button>
            </Radio.Group>
          </Descriptions.Item>
          <Descriptions.Item label="Default log tail lines">
            <Space>
              <InputNumber
                min={1}
                max={100000}
                step={100}
                value={config.log_tail_lines_default}
                disabled={loading}
                onChange={(v) => {
                  if (typeof v === "number" && Number.isFinite(v) && v > 0) {
                    handleSave({ log_tail_lines_default: Math.floor(v) });
                  }
                }}
              />
              <Text type="secondary">lines per pod log fetch</Text>
            </Space>
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card size="small" title="System">
        <Space direction="vertical" size={8} style={{ width: "100%" }}>
          <Checkbox
            checked={config.check_updates_on_startup}
            disabled={loading}
            onChange={(e) => handleSave({ check_updates_on_startup: e.target.checked })}
          >
            Check for updates on startup
          </Checkbox>
          <Checkbox
            checked={config.allow_multiple_instances}
            disabled={loading}
            onChange={(e) => handleSave({ allow_multiple_instances: e.target.checked })}
          >
            Allow multiple windows{" "}
            <Text type="secondary" style={{ fontSize: 12 }}>
              (takes effect after restart)
            </Text>
          </Checkbox>
        </Space>
      </Card>
    </Space>
  );
}
