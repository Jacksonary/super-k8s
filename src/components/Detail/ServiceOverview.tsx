import { useEffect, useState } from "react";
import { App, Button, Card, Descriptions, Popconfirm, Space, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { ResourceTarget, KubeObject } from "./ResourceDetailDrawer";
import { api } from "../../api";
import type { EndpointInfo } from "../../types";
import { formatAge, formatTimestamp } from "../../utils/format";
import { useResizableColumns, ResizableHeaderCell } from "../Common/ResizableColumns";
import MetadataEditor from "../Common/MetadataEditor";

const { Text } = Typography;

interface Props {
  obj: KubeObject;
  clusterId: string;
  target: ResourceTarget;
  reload: () => void;
  onChanged?: () => void | Promise<void>;
}

interface PortRow {
  key: string;
  name?: string;
  port?: number;
  targetPort?: number | string;
  protocol?: string;
  nodePort?: number;
}

function toMs(ts: unknown): number | null {
  if (!ts || typeof ts !== "string") return null;
  const ms = Date.parse(ts);
  return Number.isNaN(ms) ? null : ms;
}

function typeColor(type?: string): string {
  switch (type) {
    case "LoadBalancer":
      return "purple";
    case "NodePort":
      return "geekblue";
    case "ExternalName":
      return "orange";
    case "ClusterIP":
    default:
      return "blue";
  }
}

function renderKv(record: Record<string, unknown> | undefined, color: string) {
  const entries = record ? Object.entries(record) : [];
  if (entries.length === 0) return <Text type="secondary">-</Text>;
  return (
    <Space size={[4, 4]} wrap>
      {entries.map(([k, v]) => (
        <Tag key={k} color={color} style={{ marginInlineEnd: 0 }}>
          {v === "" || v == null ? k : `${k}=${String(v)}`}
        </Tag>
      ))}
    </Space>
  );
}

interface EndpointRow extends EndpointInfo {
  key: string;
}

export default function ServiceOverview({ obj, clusterId, target, reload, onChanged }: Props) {
  const { message } = App.useApp();
  const [endpoints, setEndpoints] = useState<EndpointInfo[]>([]);
  const [endpointsLoading, setEndpointsLoading] = useState(false);

  const metadata = obj?.metadata ?? {};
  const spec = obj?.spec ?? {};
  const status = obj?.status ?? {};

  useEffect(() => {
    if (!target.namespace) {
      setEndpoints([]);
      return;
    }
    let alive = true;
    setEndpointsLoading(true);
    api
      .listServiceEndpoints(clusterId, target.namespace, target.name)
      .then((rows) => {
        if (alive) setEndpoints(rows);
      })
      .catch(() => {
        if (alive) setEndpoints([]);
      })
      .finally(() => {
        if (alive) setEndpointsLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [clusterId, target.namespace, target.name]);

  const handleDelete = async () => {
    try {
      await api.deleteResource(
        clusterId,
        target.apiVersion,
        target.kind,
        target.namespace,
        target.name,
      );
      message.success(`Deleted Service ${target.name}`);
      await onChanged?.();
    } catch (e) {
      message.error(`Delete failed: ${(e as Error).message}`);
    }
  };

  const endpointRows: EndpointRow[] = endpoints.map((ep, idx) => ({
    ...ep,
    key: `${ep.ip}-${idx}`,
  }));

  const endpointBaseColumns: ColumnsType<EndpointRow> = [
    { title: "IP", dataIndex: "ip", key: "ip", width: 130 },
    {
      title: "Target",
      dataIndex: "target_ref",
      key: "target_ref",
      width: 160,
      render: (v?: string | null) => v || <Text type="secondary">-</Text>,
    },
    {
      title: "Node",
      dataIndex: "node_name",
      key: "node_name",
      width: 160,
      render: (v?: string | null) => v || <Text type="secondary">-</Text>,
    },
    {
      title: "Ports",
      dataIndex: "ports",
      key: "ports",
      width: 140,
      render: (v?: string[]) =>
        v && v.length > 0 ? v.join(", ") : <Text type="secondary">-</Text>,
    },
    {
      title: "Ready",
      dataIndex: "ready",
      key: "ready",
      width: 80,
      render: (ready: boolean) => (
        <Tag color={ready ? "green" : "red"}>{ready ? "True" : "False"}</Tag>
      ),
    },
  ];

  const createdMs = toMs(metadata.creationTimestamp);

  const clusterIPs: string[] = Array.isArray(spec.clusterIPs) ? spec.clusterIPs : [];
  const externalIPs: string[] = Array.isArray(spec.externalIPs) ? spec.externalIPs : [];

  const ingress: Array<Record<string, unknown>> = Array.isArray(status?.loadBalancer?.ingress)
    ? status.loadBalancer.ingress
    : [];
  const ingressEntries = ingress
    .map((i) => (i?.ip as string) || (i?.hostname as string))
    .filter((v): v is string => !!v);

  const ports: Array<Record<string, unknown>> = Array.isArray(spec.ports) ? spec.ports : [];
  const portRows: PortRow[] = ports.map((p, idx) => ({
    key: `${(p?.name as string) ?? "port"}-${idx}`,
    name: p?.name as string | undefined,
    port: p?.port as number | undefined,
    targetPort: p?.targetPort as number | string | undefined,
    protocol: p?.protocol as string | undefined,
    nodePort: p?.nodePort as number | undefined,
  }));
  const hasNodePort = portRows.some((r) => r.nodePort != null);

  const portBaseColumns: ColumnsType<PortRow> = [
    {
      title: "Name",
      dataIndex: "name",
      key: "name",
      width: 120,
      render: (v?: string) => v || <Text type="secondary">-</Text>,
    },
    {
      title: "Port",
      dataIndex: "port",
      key: "port",
      width: 80,
      render: (v?: number) => (v != null ? v : "-"),
    },
    {
      title: "Target Port",
      dataIndex: "targetPort",
      key: "targetPort",
      width: 110,
      render: (v?: number | string) => (v != null ? String(v) : "-"),
    },
    {
      title: "Protocol",
      dataIndex: "protocol",
      key: "protocol",
      width: 90,
      render: (v?: string) => v || "TCP",
    },
    ...(hasNodePort
      ? ([
          {
            title: "NodePort",
            dataIndex: "nodePort",
            key: "nodePort",
            width: 100,
            render: (v?: number) => (v != null ? v : "-"),
          },
        ] as ColumnsType<PortRow>)
      : []),
  ];

  const selector = (spec.selector as Record<string, unknown>) ?? {};
  const hasSelector = Object.keys(selector).length > 0;

  const { columns: portColumns } = useResizableColumns("detail-svc-ports", portBaseColumns);
  const { columns: endpointColumns } = useResizableColumns("detail-svc-endpoints", endpointBaseColumns);

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Card
        size="small"
        title="Basic Info"
        extra={
          <Popconfirm
            title="Delete this Service?"
            okText="Delete"
            okButtonProps={{ danger: true }}
            cancelText="Cancel"
            onConfirm={handleDelete}
          >
            <Button size="small" danger>
              Delete
            </Button>
          </Popconfirm>
        }
      >
        <Descriptions column={2} size="small" bordered>
          <Descriptions.Item label="Name">
            {metadata.name || <Text type="secondary">-</Text>}
          </Descriptions.Item>
          <Descriptions.Item label="Namespace">
            {metadata.namespace || <Text type="secondary">-</Text>}
          </Descriptions.Item>
          <Descriptions.Item label="Type">
            {spec.type ? (
              <Tag color={typeColor(spec.type)}>{spec.type}</Tag>
            ) : (
              <Text type="secondary">-</Text>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="Session Affinity">
            {spec.sessionAffinity || "None"}
          </Descriptions.Item>
          <Descriptions.Item label="Cluster IP">
            {spec.clusterIP || <Text type="secondary">-</Text>}
          </Descriptions.Item>
          <Descriptions.Item label="Cluster IPs">
            {clusterIPs.length > 0 ? clusterIPs.join(", ") : <Text type="secondary">-</Text>}
          </Descriptions.Item>
          {spec.externalName ? (
            <Descriptions.Item label="External Name" span={2}>
              {spec.externalName}
            </Descriptions.Item>
          ) : null}
          <Descriptions.Item label="External IPs">
            {externalIPs.length > 0 ? externalIPs.join(", ") : <Text type="secondary">-</Text>}
          </Descriptions.Item>
          <Descriptions.Item label="LoadBalancer Ingress">
            {ingressEntries.length > 0 ? (
              <Space size={[4, 4]} wrap>
                {ingressEntries.map((v) => (
                  <Tag key={v} color="green" style={{ marginInlineEnd: 0 }}>
                    {v}
                  </Tag>
                ))}
              </Space>
            ) : (
              <Text type="secondary">-</Text>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="Created">
            {formatTimestamp(createdMs)}
          </Descriptions.Item>
          <Descriptions.Item label="Age">{formatAge(createdMs)}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card size="small" title="Ports">
        {portRows.length > 0 ? (
          <Table<PortRow>
            columns={portColumns}
            dataSource={portRows}
            size="small"
            pagination={false}
            components={{ header: { cell: ResizableHeaderCell } }}
            scroll={{ x: "max-content" }}
          />
        ) : (
          <Text type="secondary">-</Text>
        )}
      </Card>

      <Card size="small" title={`Endpoints (${endpointRows.length})`}>
        <Table<EndpointRow>
          columns={endpointColumns}
          dataSource={endpointRows}
          size="small"
          loading={endpointsLoading}
          pagination={false}
          components={{ header: { cell: ResizableHeaderCell } }}
          scroll={{ x: "max-content" }}
        />
      </Card>

      <Card size="small" title="Selector">
        {hasSelector ? (
          renderKv(selector, "cyan")
        ) : (
          <Text type="secondary">
            -{spec.type === "ExternalName" ? "(ExternalName service has no selector)" : "(headless / no selector)"}
          </Text>
        )}
      </Card>

      <MetadataEditor
        clusterId={clusterId}
        target={target}
        labels={(metadata.labels ?? {}) as Record<string, string>}
        annotations={(metadata.annotations ?? {}) as Record<string, string>}
        reload={reload}
        onChanged={onChanged}
      />
    </Space>
  );
}
