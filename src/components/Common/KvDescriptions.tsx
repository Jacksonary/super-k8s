import { Descriptions, Typography } from "antd";

const { Text } = Typography;

interface Props {
  data?: Record<string, string | undefined | null>;
  emptyText?: string;
}

/**
 * Unified key-value display: one Descriptions row per entry, value with wordBreak.
 * Used consistently for Labels and Annotations across all resource overviews.
 */
export default function KvDescriptions({ data, emptyText = "-" }: Props) {
  const entries = Object.entries(data ?? {}).filter(([k]) => k);
  if (entries.length === 0) return <Text type="secondary">{emptyText}</Text>;
  return (
    <Descriptions size="small" column={1} bordered>
      {entries.map(([k, v]) => (
        <Descriptions.Item key={k} label={k}>
          <Text style={{ wordBreak: "break-all" }}>{v || "-"}</Text>
        </Descriptions.Item>
      ))}
    </Descriptions>
  );
}
