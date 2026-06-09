import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Breadcrumb,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Popconfirm,
  Row,
  Space,
  Spin,
  Statistic,
  Tag,
  Typography,
  App as AntdApp,
} from "antd";
import { ArrowLeftOutlined, DeleteOutlined, ReloadOutlined } from "@ant-design/icons";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { useClusterStore } from "../store/clusterStore";
import type { ClusterOverview, ClusterSummary } from "../types";

const { Text } = Typography;

function StatusTag({ status }: { status: ClusterSummary["status"] | undefined }) {
  switch (status) {
    case "connected":
      return <Tag color="green">Connected</Tag>;
    case "connecting":
      return <Tag color="orange">Connecting</Tag>;
    case "error":
      return <Tag color="red">Error</Tag>;
    default:
      return <Tag color="default">Unknown</Tag>;
  }
}

export default function ClusterDetail() {
  const { clusterId: rawId } = useParams<{ clusterId: string }>();
  const clusterId = rawId ? decodeURIComponent(rawId) : "";
  const navigate = useNavigate();
  const { clusters, refreshClusters } = useClusterStore();
  const { message } = AntdApp.useApp();

  const config = clusters.find((c) => c.id === clusterId) ?? null;

  const [summary, setSummary] = useState<ClusterSummary | null>(null);
  const [overview, setOverview] = useState<ClusterOverview | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!clusterId) return;
    setLoading(true);
    setOverviewError(null);
    const [sumRes, ovRes] = await Promise.allSettled([
      api.getClusterSummary(clusterId),
      api.getOverview(clusterId),
    ]);
    if (sumRes.status === "fulfilled") {
      setSummary(sumRes.value);
    } else {
      setSummary(null);
      message.error(String(sumRes.reason));
    }
    if (ovRes.status === "fulfilled") {
      setOverview(ovRes.value);
    } else {
      setOverview(null);
      setOverviewError(String(ovRes.reason));
    }
    setLoading(false);
  }, [clusterId, message]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleDelete() {
    try {
      await api.deleteCluster(clusterId);
      message.success("Cluster removed");
      await refreshClusters();
      navigate("/cluster");
    } catch (e) {
      message.error(String(e));
    }
  }

  if (!config) {
    return (
      <Space direction="vertical" size={12} style={{ width: "100%" }}>
        <Breadcrumb
          items={[{ title: <a onClick={() => navigate("/cluster")}>Cluster</a> }, { title: "Not found" }]}
        />
        <Alert
          type="warning"
          showIcon
          message="Cluster not found"
          description="It may have been removed. Go back to the cluster list."
          action={
            <Button size="small" onClick={() => navigate("/cluster")}>
              Back
            </Button>
          }
        />
      </Space>
    );
  }

  return (
    <Space direction="vertical" size={12} style={{ width: "100%", flex: 1, minHeight: 0, overflow: "auto" }}>
      <Breadcrumb
        items={[{ title: <a onClick={() => navigate("/cluster")}>Cluster</a> }, { title: config.name }]}
      />

      <Space style={{ justifyContent: "space-between", width: "100%" }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/cluster")}>
          Back
        </Button>
        <Space size={8}>
          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void load()}>
            Refresh
          </Button>
          <Popconfirm
            title="Remove this cluster?"
            description="Its context is removed from the managed kubeconfig."
            onConfirm={handleDelete}
            okButtonProps={{ danger: true }}
          >
            <Button danger icon={<DeleteOutlined />}>
              Delete
            </Button>
          </Popconfirm>
        </Space>
      </Space>

      <Spin spinning={loading}>
        <Card size="small" title="Connection" style={{ marginBottom: 12 }}>
          <Descriptions column={2} size="small">
            <Descriptions.Item label="Status">
              <StatusTag status={summary?.status} />
            </Descriptions.Item>
            <Descriptions.Item label="Server Version">
              {summary?.server_version ?? "-"}
            </Descriptions.Item>
            <Descriptions.Item label="Nodes">{summary?.node_count ?? "-"}</Descriptions.Item>
            <Descriptions.Item label="Namespaces">{summary?.namespace_count ?? "-"}</Descriptions.Item>
            {summary?.error_message && (
              <Descriptions.Item label="Error" span={2}>
                <Text type="danger">{summary.error_message}</Text>
              </Descriptions.Item>
            )}
          </Descriptions>
        </Card>

        <Card size="small" title="Overview" style={{ marginBottom: 12 }}>
          {overviewError ? (
            <Alert type="error" showIcon message="Cannot load overview" description={overviewError} />
          ) : !overview ? (
            <Empty description="No data" />
          ) : (
            <Row gutter={[16, 16]}>
              <Col xs={12} sm={8} md={6}>
                <Statistic title="Nodes (Ready/Total)" value={`${overview.ready_nodes} / ${overview.node_count}`} />
              </Col>
              <Col xs={12} sm={8} md={6}>
                <Statistic title="Namespaces" value={overview.namespace_count} />
              </Col>
              <Col xs={12} sm={8} md={6}>
                <Statistic title="Pods" value={overview.pod_count} />
              </Col>
              <Col xs={12} sm={8} md={6}>
                <Statistic title="Deployments" value={overview.deployment_count} />
              </Col>
              <Col xs={12} sm={8} md={6}>
                <Statistic title="Services" value={overview.service_count} />
              </Col>
              <Col xs={12} sm={8} md={6}>
                <Statistic title="ConfigMaps" value={overview.configmap_count} />
              </Col>
            </Row>
          )}
        </Card>

        <Card size="small" title="Config">
          <Descriptions column={2} size="small">
            <Descriptions.Item label="Name">{config.name}</Descriptions.Item>
            <Descriptions.Item label="Source">
              <Tag color={config.source === "imported" ? "blue" : "default"}>{config.source}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Server" span={2}>
              <Text code style={{ fontSize: 12 }}>
                {config.server}
              </Text>
            </Descriptions.Item>
            <Descriptions.Item label="User">{config.user || "-"}</Descriptions.Item>
            <Descriptions.Item label="Default Namespace">{config.namespace ?? "-"}</Descriptions.Item>
            <Descriptions.Item label="Context (ID)" span={2}>
              <Text code style={{ fontSize: 12 }}>
                {config.id}
              </Text>
            </Descriptions.Item>
          </Descriptions>
        </Card>
      </Spin>
    </Space>
  );
}
