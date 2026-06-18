import { useMemo, useState } from "react";
import type { ServiceInfo } from "../../types";
import {
  App, Button, Card, Descriptions, Input, Popconfirm, Select, Space, Table, Tag, Tooltip, Typography,
} from "antd";
import { CloseOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
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

/* ── Types ─────────────────────────────────────────────────────── */

interface DraftPath {
  id: string;
  pathType: string;
  path: string;
  serviceName: string;
  servicePort: string;
}

interface DraftRule {
  id: string;
  host: string;
  paths: DraftPath[];
}

/* ── Helpers ────────────────────────────────────────────────────── */

function toMs(ts: unknown): number | null {
  if (!ts || typeof ts !== "string") return null;
  const ms = Date.parse(ts);
  return Number.isNaN(ms) ? null : ms;
}

function specToRules(specRules: KubeObject[]): DraftRule[] {
  return (specRules ?? []).map((rule, i) => ({
    id: `rule-${i}`,
    host: rule?.host ?? "",
    paths: (rule?.http?.paths ?? []).map((p: KubeObject, j: number) => ({
      id: `path-${i}-${j}`,
      pathType: p?.pathType ?? "Prefix",
      path: p?.path ?? "/",
      serviceName: p?.backend?.service?.name ?? "",
      servicePort: String(p?.backend?.service?.port?.number ?? p?.backend?.service?.port?.name ?? ""),
    })),
  }));
}

function rulesToSpec(rules: DraftRule[]): KubeObject[] {
  return rules.map((rule) => ({
    ...(rule.host ? { host: rule.host } : {}),
    http: {
      paths: rule.paths.map((p) => {
        const portNum = parseInt(p.servicePort, 10);
        return {
          path: p.path,
          pathType: p.pathType,
          backend: {
            service: {
              name: p.serviceName,
              port: isNaN(portNum)
                ? { name: p.servicePort }
                : { number: portNum },
            },
          },
        };
      }),
    },
  }));
}

const PATH_TYPE_OPTIONS = [
  { value: "Prefix", label: "Prefix" },
  { value: "Exact", label: "Exact" },
  { value: "ImplementationSpecific", label: "ImplementationSpecific" },
];

interface PathRow { key: string; pathType: string; path: string; service: string; port: string; }
const PATH_COLS: ColumnsType<PathRow> = [
  { title: "Path Type", dataIndex: "pathType", key: "pathType", width: 200, render: (v) => <Tag>{v}</Tag> },
  { title: "Path", dataIndex: "path", key: "path", ellipsis: true, render: (v) => <Text code>{v}</Text> },
  { title: "Service", dataIndex: "service", key: "service", ellipsis: true },
  { title: "Port", dataIndex: "port", key: "port", width: 80 },
];

/* ── Component ─────────────────────────────────────────────────── */

export default function IngressOverview({ obj, clusterId, target, reload, onChanged }: Props) {
  const { message } = App.useApp();

  const metadata = obj?.metadata ?? {};
  const spec = obj?.spec ?? {};
  const createdMs = toMs(metadata.creationTimestamp);

  const ingressClass: string =
    spec.ingressClassName ??
    (metadata.annotations as Record<string, string>)?.["kubernetes.io/ingress.class"] ??
    "-";

  const labels: Record<string, string> = metadata.labels ?? {};
  const annotations: Record<string, string> = metadata.annotations ?? {};

  // Read-only rules grouped by host
  const rulesByHost = useMemo((): Map<string, PathRow[]> => {
    const map = new Map<string, PathRow[]>();
    for (const rule of (spec.rules ?? [])) {
      const host: string = rule?.host ?? "*";
      if (!map.has(host)) map.set(host, []);
      const paths: KubeObject[] = rule?.http?.paths ?? [];
      if (paths.length === 0) {
        map.get(host)!.push({ key: `${host}-`, pathType: "-", path: "-", service: "-", port: "-" });
      } else {
        for (const p of paths) {
          const svc = p?.backend?.service;
          map.get(host)!.push({
            key: `${host}-${p?.path ?? ""}`,
            pathType: p?.pathType ?? "-",
            path: p?.path ?? "/",
            service: svc?.name ?? "-",
            port: svc ? String(svc.port?.number ?? svc.port?.name ?? "-") : "-",
          });
        }
      }
    }
    return map;
  }, [spec.rules]);

  const tlsRows: Array<{ key: string; hosts: string; secret: string }> = (spec.tls ?? []).map((t: KubeObject, i: number) => ({
    key: String(i),
    hosts: Array.isArray(t?.hosts) ? t.hosts.join(", ") : "*",
    secret: t?.secretName ?? "-",
  }));

  /* ── Rules edit state ─────────────────────────────────────────── */
  const [rulesEditing, setRulesEditing] = useState(false);
  const [draftRules, setDraftRules] = useState<DraftRule[]>([]);
  const [savingRules, setSavingRules] = useState(false);
  const [services, setServices] = useState<ServiceInfo[]>([]);

  const startEditRules = async () => {
    setDraftRules(specToRules(spec.rules ?? []));
    setRulesEditing(true);
    if (target.namespace) {
      try {
        const svcs = await api.listServices(clusterId, target.namespace);
        setServices(svcs);
      } catch { /* ignore */ }
    }
  };
  const cancelEditRules = () => setRulesEditing(false);

  const saveRules = async () => {
    if (!target.namespace) return;
    for (const rule of draftRules) {
      for (const p of rule.paths) {
        if (!p.serviceName.trim()) { message.error("Service name cannot be empty"); return; }
      }
    }
    setSavingRules(true);
    try {
      await api.updateIngressRules(clusterId, target.namespace, target.name, rulesToSpec(draftRules));
      message.success("Rules updated");
      setRulesEditing(false);
      reload();
    } catch (e) {
      message.error(`Update failed: ${(e as Error).message}`);
    } finally {
      setSavingRules(false);
    }
  };

  const updateRule = (ruleId: string, field: keyof DraftRule, value: string) =>
    setDraftRules((rules) => rules.map((r) => r.id === ruleId ? { ...r, [field]: value } : r));

  const updatePath = (ruleId: string, pathId: string, field: keyof DraftPath, value: string) =>
    setDraftRules((rules) => rules.map((r) =>
      r.id === ruleId
        ? { ...r, paths: r.paths.map((p) => p.id === pathId ? { ...p, [field]: value } : p) }
        : r,
    ));

  const addPath = (ruleId: string) =>
    setDraftRules((rules) => rules.map((r) =>
      r.id === ruleId
        ? { ...r, paths: [...r.paths, { id: `path-${Date.now()}`, pathType: "Prefix", path: "/", serviceName: "", servicePort: "80" }] }
        : r,
    ));

  const removePath = (ruleId: string, pathId: string) =>
    setDraftRules((rules) => rules.map((r) =>
      r.id === ruleId ? { ...r, paths: r.paths.filter((p) => p.id !== pathId) } : r,
    ));

  const removeRule = (ruleId: string) =>
    setDraftRules((rules) => rules.filter((r) => r.id !== ruleId));

  const addRule = () =>
    setDraftRules((rules) => [...rules, {
      id: `rule-${Date.now()}`,
      host: "",
      paths: [{ id: `path-${Date.now()}`, pathType: "Prefix", path: "/", serviceName: "", servicePort: "80" }],
    }]);

  const handleDelete = async () => {
    try {
      await api.deleteResource(clusterId, target.apiVersion, target.kind, target.namespace, target.name);
      message.success(`Deleted Ingress ${target.name}`);
      await onChanged?.();
    } catch (e) {
      message.error(`Delete failed: ${(e as Error).message}`);
    }
  };

  /* ── Render ─────────────────────────────────────────────────── */

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>

      {/* Basic Info */}
      <Card size="small" title="Basic Info"
        extra={
          <Popconfirm title="Delete this Ingress?" okText="Delete" okButtonProps={{ danger: true }}
            cancelText="Cancel" onConfirm={handleDelete}>
            <Button size="small" danger>Delete</Button>
          </Popconfirm>
        }
      >
        <Descriptions size="small" column={2} bordered>
          <Descriptions.Item label="Name">{metadata.name ?? target.name}</Descriptions.Item>
          <Descriptions.Item label="Namespace">{metadata.namespace ?? target.namespace ?? "-"}</Descriptions.Item>
          <Descriptions.Item label="Ingress Class">{ingressClass}</Descriptions.Item>
          <Descriptions.Item label="Age">
            <Tooltip title={formatTimestamp(createdMs)}>{formatAge(createdMs)}</Tooltip>
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {/* Rules */}
      <Card
        size="small"
        title="Rules"
        extra={
          rulesEditing ? (
            <Space size={4}>
              <Button size="small" onClick={cancelEditRules} disabled={savingRules}>Cancel</Button>
              <Button size="small" type="primary" onClick={saveRules} loading={savingRules}>Save</Button>
            </Space>
          ) : (
            <Button size="small" icon={<EditOutlined />} onClick={() => void startEditRules()}>Edit</Button>
          )
        }
      >
        {rulesEditing ? (
          /* ── Edit mode ───────────────────────────────────────── */
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            {draftRules.map((rule) => (
              <div key={rule.id} style={{ border: `1px solid var(--ant-color-border)`, borderRadius: 6, padding: 12 }}>
                {/* Host row */}
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
                  <Text type="secondary" style={{ whiteSpace: "nowrap", minWidth: 90 }}>Request Host</Text>
                  <Input
                    size="small"
                    value={rule.host}
                    placeholder="e.g. example.com (empty = any)"
                    style={{ flex: 1 }}
                    onChange={(e) => updateRule(rule.id, "host", e.target.value)}
                  />
                  <Button
                    type="text" size="small" danger icon={<CloseOutlined />}
                    onClick={() => removeRule(rule.id)}
                  />
                </div>

                {/* Path header */}
                <div style={{ display: "grid", gridTemplateColumns: "140px 1fr 180px 90px 32px", gap: 6, marginBottom: 4, padding: "0 2px" }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>Path Type</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>Path</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>Target Service</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>Port</Text>
                  <span />
                </div>

                {/* Path rows */}
                <Space direction="vertical" size={6} style={{ width: "100%" }}>
                  {rule.paths.map((p) => {
                    const selectedSvc = services.find((s) => s.name === p.serviceName);
                    const portOptions = selectedSvc
                      ? selectedSvc.ports.map((portStr) => {
                          const port = portStr.split(":")[0];
                          return { value: port, label: port };
                        })
                      : p.servicePort ? [{ value: p.servicePort, label: p.servicePort }] : [];

                    return (
                      <div key={p.id} style={{ display: "grid", gridTemplateColumns: "160px 1fr 200px 100px 32px", gap: 6, alignItems: "center" }}>
                        <Select
                          size="small"
                          value={p.pathType}
                          options={PATH_TYPE_OPTIONS}
                          onChange={(v) => updatePath(rule.id, p.id, "pathType", v)}
                        />
                        <Input
                          size="small"
                          value={p.path}
                          onChange={(e) => updatePath(rule.id, p.id, "path", e.target.value)}
                        />
                        <Select
                          size="small"
                          showSearch
                          value={p.serviceName || undefined}
                          placeholder="service"
                          options={services.map((s) => ({ value: s.name, label: s.name }))}
                          onChange={(v) => {
                            updatePath(rule.id, p.id, "serviceName", v);
                            // auto-fill first port
                            const svc = services.find((s) => s.name === v);
                            if (svc?.ports.length) {
                              updatePath(rule.id, p.id, "servicePort", svc.ports[0].split(":")[0]);
                            }
                          }}
                          filterOption={(input, opt) =>
                            (opt?.label as string ?? "").toLowerCase().includes(input.toLowerCase())
                          }
                        />
                        <Select
                          size="small"
                          showSearch
                          value={p.servicePort || undefined}
                          placeholder="port"
                          options={portOptions}
                          onChange={(v) => updatePath(rule.id, p.id, "servicePort", v)}
                          filterOption={(input, opt) =>
                            (opt?.label as string ?? "").toLowerCase().includes(input.toLowerCase())
                          }
                        />
                        <Button
                          type="text" size="small" danger icon={<CloseOutlined />}
                          onClick={() => removePath(rule.id, p.id)}
                        />
                      </div>
                    );
                  })}
                </Space>

                {/* Add path */}
                <Button
                  size="small"
                  icon={<PlusOutlined />}
                  style={{ marginTop: 8 }}
                  onClick={() => addPath(rule.id)}
                >
                  Add Path
                </Button>
              </div>
            ))}

            {/* Add rule */}
            <Button icon={<PlusOutlined />} onClick={addRule}>Add Rule</Button>
          </Space>
        ) : (
          /* ── Read-only mode ──────────────────────────────────── */
          rulesByHost.size === 0 ? (
            <Text type="secondary">No rules defined</Text>
          ) : (
            <Space direction="vertical" size={8} style={{ width: "100%" }}>
              {Array.from(rulesByHost.entries()).map(([host, paths]) => (
                <div key={host}>
                  <div style={{ marginBottom: 4 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>Host: </Text>
                    <Text strong code>{host === "*" ? "* (any)" : host}</Text>
                  </div>
                  <Table<PathRow>
                    rowKey="key"
                    size="small"
                    columns={PATH_COLS}
                    dataSource={paths}
                    pagination={false}
                    scroll={{ x: "max-content" }}
                    locale={{ emptyText: "No paths" }}
                  />
                </div>
              ))}
            </Space>
          )
        )}
      </Card>

      {/* TLS */}
      {tlsRows.length > 0 && (
        <Card size="small" title={`TLS (${tlsRows.length})`}>
          <Descriptions size="small" column={1} bordered>
            {tlsRows.map((row) => (
              <Descriptions.Item key={row.key} label={row.hosts}>
                <Text code>{row.secret}</Text>
              </Descriptions.Item>
            ))}
          </Descriptions>
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
