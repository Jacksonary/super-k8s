import { useCallback, useEffect, useState } from "react";
import { Button, Card, Col, Empty, Row, Spin, Statistic, App as AntdApp } from "antd";
import {
  ApartmentOutlined,
  AppstoreOutlined,
  CloudServerOutlined,
  ClusterOutlined,
  DeploymentUnitOutlined,
  FileTextOutlined,
  ReloadOutlined,
  TagsOutlined,
} from "@ant-design/icons";
import { api } from "../api";
import { useClusterStore } from "../store/clusterStore";
import type { ClusterOverview } from "../types";

export default function Overview() {
  const { currentClusterId } = useClusterStore();
  const { message } = AntdApp.useApp();

  const [overview, setOverview] = useState<ClusterOverview | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!currentClusterId) return;
    setLoading(true);
    try {
      const data = await api.getOverview(currentClusterId);
      setOverview(data);
    } catch (err) {
      message.error(String(err));
      setOverview(null);
    } finally {
      setLoading(false);
    }
  }, [currentClusterId, message]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!currentClusterId) {
    return (
      <Card style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <Empty description="No cluster selected. Choose one from the sidebar." />
      </Card>
    );
  }

  return (
    <Card
      title="Overview"
      style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
      styles={{ body: { flex: 1, minHeight: 0, overflow: "auto" } }}
      extra={
        <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
          Refresh
        </Button>
      }
    >
      <Spin spinning={loading}>
        {!overview ? (
          <Empty description="No data" />
        ) : (
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12} md={8} lg={6}>
              <Card size="small">
                <Statistic
                  title="Server Version"
                  value={overview.server_version ?? "-"}
                  prefix={<CloudServerOutlined />}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} md={8} lg={6}>
              <Card size="small">
                <Statistic
                  title="Nodes (Ready / Total)"
                  value={`${overview.ready_nodes} / ${overview.node_count}`}
                  prefix={<ClusterOutlined />}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} md={8} lg={6}>
              <Card size="small">
                <Statistic
                  title="Namespaces"
                  value={overview.namespace_count}
                  prefix={<AppstoreOutlined />}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} md={8} lg={6}>
              <Card size="small">
                <Statistic title="Pods" value={overview.pod_count} prefix={<ApartmentOutlined />} />
              </Card>
            </Col>
            <Col xs={24} sm={12} md={8} lg={6}>
              <Card size="small">
                <Statistic
                  title="Deployments"
                  value={overview.deployment_count}
                  prefix={<DeploymentUnitOutlined />}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} md={8} lg={6}>
              <Card size="small">
                <Statistic
                  title="Services"
                  value={overview.service_count}
                  prefix={<TagsOutlined />}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} md={8} lg={6}>
              <Card size="small">
                <Statistic
                  title="ConfigMaps"
                  value={overview.configmap_count}
                  prefix={<FileTextOutlined />}
                />
              </Card>
            </Col>
          </Row>
        )}
      </Spin>
    </Card>
  );
}
