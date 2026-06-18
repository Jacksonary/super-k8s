import { useState } from "react";
import {
  App, Button, Card, Descriptions, Input, InputNumber, Popconfirm,
  Select, Space, Switch, Tag, Tooltip, Typography,
} from "antd";
import { EditOutlined } from "@ant-design/icons";
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

function toMs(ts: unknown): number | null {
  if (typeof ts !== "string" || !ts) return null;
  const ms = Date.parse(ts);
  return Number.isNaN(ms) ? null : ms;
}

const CONCURRENCY_OPTIONS = [
  { value: "Allow", label: "Allow" },
  { value: "Forbid", label: "Forbid" },
  { value: "Replace", label: "Replace" },
];

export default function CronJobOverview({ obj, clusterId, target, reload, onChanged }: Props) {
  const { message } = App.useApp();

  const meta = obj?.metadata ?? {};
  const spec = obj?.spec ?? {};
  const status = obj?.status ?? {};

  const createdMs = toMs(meta.creationTimestamp);
  const lastScheduleMs = toMs(status.lastScheduleTime);

  const activeJobs: Array<{ name: string }> = (status.active ?? []).map(
    (ref: Record<string, unknown>) => ({ name: String(ref.name ?? "") }),
  );

  const labels: Record<string, string> = meta.labels ?? {};
  const annotations: Record<string, string> = meta.annotations ?? {};

  // Spec edit state
  const [specEditing, setSpecEditing] = useState(false);
  const [draftSchedule, setDraftSchedule] = useState("");
  const [draftSuspend, setDraftSuspend] = useState(false);
  const [draftConcurrency, setDraftConcurrency] = useState("Allow");
  const [draftSuccessLimit, setDraftSuccessLimit] = useState(3);
  const [draftFailLimit, setDraftFailLimit] = useState(1);
  const [savingSpec, setSavingSpec] = useState(false);

  const startEditSpec = () => {
    setDraftSchedule(spec.schedule ?? "");
    setDraftSuspend(spec.suspend ?? false);
    setDraftConcurrency(spec.concurrencyPolicy ?? "Allow");
    setDraftSuccessLimit(spec.successfulJobsHistoryLimit ?? 3);
    setDraftFailLimit(spec.failedJobsHistoryLimit ?? 1);
    setSpecEditing(true);
  };

  const saveSpec = async () => {
    if (!target.namespace) return;
    if (!draftSchedule.trim()) { message.error("Schedule cannot be empty"); return; }
    setSavingSpec(true);
    try {
      await api.updateCronJobSpec(
        clusterId, target.namespace, target.name,
        draftSchedule.trim(), draftSuspend, draftConcurrency,
        draftSuccessLimit, draftFailLimit,
      );
      message.success("CronJob updated");
      setSpecEditing(false);
      reload();
    } catch (e) {
      message.error(`Update failed: ${(e as Error).message}`);
    } finally {
      setSavingSpec(false);
    }
  };

  const handleDelete = async () => {
    try {
      await api.deleteResource(clusterId, target.apiVersion, target.kind, target.namespace, target.name);
      message.success(`Deleted CronJob ${target.name}`);
      await onChanged?.();
    } catch (e) {
      message.error(`Delete failed: ${(e as Error).message}`);
    }
  };

  return (
    <Space direction="vertical" size="middle" style={{ display: "flex" }}>

      <Card
        size="small"
        title="Overview"
        extra={
          specEditing ? (
            <Space size={4}>
              <Button size="small" onClick={() => setSpecEditing(false)} disabled={savingSpec}>Cancel</Button>
              <Button size="small" type="primary" onClick={saveSpec} loading={savingSpec}>Save</Button>
            </Space>
          ) : (
            <Space size={4}>
              <Button size="small" icon={<EditOutlined />} onClick={startEditSpec}>Edit</Button>
              <Popconfirm title="Delete this CronJob?" okText="Delete" okButtonProps={{ danger: true }}
                cancelText="Cancel" onConfirm={handleDelete}>
                <Button size="small" danger>Delete</Button>
              </Popconfirm>
            </Space>
          )
        }
      >
        {specEditing ? (
          <Descriptions size="small" column={1} bordered>
            <Descriptions.Item label="Name">{meta.name ?? "-"}</Descriptions.Item>
            <Descriptions.Item label="Namespace">{meta.namespace ?? "-"}</Descriptions.Item>
            <Descriptions.Item label="Schedule">
              <Input size="small" value={draftSchedule} placeholder="e.g. 0 * * * *"
                onChange={(e) => setDraftSchedule(e.target.value)}
                style={{ fontFamily: "monospace", width: 200 }} />
            </Descriptions.Item>
            <Descriptions.Item label="Suspend">
              <Switch size="small" checked={draftSuspend} onChange={setDraftSuspend}
                checkedChildren="Suspended" unCheckedChildren="Active" />
            </Descriptions.Item>
            <Descriptions.Item label="Concurrency Policy">
              <Select size="small" value={draftConcurrency} options={CONCURRENCY_OPTIONS}
                onChange={setDraftConcurrency} style={{ width: 140 }} />
            </Descriptions.Item>
            <Descriptions.Item label="Success History Limit">
              <InputNumber size="small" min={0} value={draftSuccessLimit}
                onChange={(v) => setDraftSuccessLimit(typeof v === "number" ? v : 3)} />
            </Descriptions.Item>
            <Descriptions.Item label="Failed History Limit">
              <InputNumber size="small" min={0} value={draftFailLimit}
                onChange={(v) => setDraftFailLimit(typeof v === "number" ? v : 1)} />
            </Descriptions.Item>
          </Descriptions>
        ) : (
          <Descriptions size="small" column={1} bordered>
            <Descriptions.Item label="Name">{meta.name ?? "-"}</Descriptions.Item>
            <Descriptions.Item label="Namespace">{meta.namespace ?? "-"}</Descriptions.Item>
            <Descriptions.Item label="Schedule"><Text code>{spec.schedule ?? "-"}</Text></Descriptions.Item>
            <Descriptions.Item label="Suspend">
              <Tag color={(spec.suspend ?? false) ? "orange" : "green"}>
                {(spec.suspend ?? false) ? "Suspended" : "Active"}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Concurrency Policy">{spec.concurrencyPolicy ?? "-"}</Descriptions.Item>
            <Descriptions.Item label="Success History Limit">{spec.successfulJobsHistoryLimit ?? 3}</Descriptions.Item>
            <Descriptions.Item label="Failed History Limit">{spec.failedJobsHistoryLimit ?? 1}</Descriptions.Item>
            <Descriptions.Item label="Last Schedule">
              {lastScheduleMs != null
                ? <Tooltip title={formatTimestamp(lastScheduleMs)}>{formatAge(lastScheduleMs)}</Tooltip>
                : <Text type="secondary">Never</Text>}
            </Descriptions.Item>
            <Descriptions.Item label="Age">
              <Tooltip title={formatTimestamp(createdMs)}>{formatAge(createdMs)}</Tooltip>
            </Descriptions.Item>
          </Descriptions>
        )}
      </Card>

      {activeJobs.length > 0 && (
        <Card size="small" title={`Active Jobs (${activeJobs.length})`}>
          <Space size={[4, 4]} wrap>
            {activeJobs.map((job) => (
              <Tag key={job.name} color="blue" style={{ margin: 0 }}>{job.name}</Tag>
            ))}
          </Space>
        </Card>
      )}

      <MetadataEditor
        clusterId={clusterId}
        target={target}
        labels={labels}
        annotations={annotations}
        reload={reload}
        onChanged={onChanged}
      />

    </Space>
  );
}
