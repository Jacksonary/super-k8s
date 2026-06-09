import { useCallback, useEffect, useState } from "react";
import {
  Button,
  Card,
  Empty,
  InputNumber,
  Modal,
  Popconfirm,
  Space,
  Table,
  Typography,
  App as AntdApp,
} from "antd";
import { ColumnHeightOutlined, ReloadOutlined, RedoOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { api } from "../api";
import { useClusterStore } from "../store/clusterStore";
import type { DeploymentInfo } from "../types";
import { formatAge } from "../utils/format";

const { Text } = Typography;

export default function Deployments() {
  const { currentClusterId, currentNamespace } = useClusterStore();
  const { message } = AntdApp.useApp();

  const [deployments, setDeployments] = useState<DeploymentInfo[]>([]);
  const [loading, setLoading] = useState(false);

  const [scaleTarget, setScaleTarget] = useState<DeploymentInfo | null>(null);
  const [scaleValue, setScaleValue] = useState<number>(1);
  const [scaling, setScaling] = useState(false);

  const load = useCallback(async () => {
    if (!currentClusterId) return;
    setLoading(true);
    try {
      const data = await api.listDeployments(currentClusterId, currentNamespace || null);
      setDeployments(data);
    } catch (err) {
      message.error(String(err));
    } finally {
      setLoading(false);
    }
  }, [currentClusterId, currentNamespace, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const openScale = useCallback((d: DeploymentInfo) => {
    setScaleTarget(d);
    setScaleValue(d.replicas);
  }, []);

  const handleScale = useCallback(async () => {
    if (!currentClusterId || !scaleTarget) return;
    setScaling(true);
    try {
      await api.scaleDeployment(currentClusterId, scaleTarget.namespace, scaleTarget.name, scaleValue);
      message.success(`Scaled "${scaleTarget.name}" to ${scaleValue}`);
      setScaleTarget(null);
      void load();
    } catch (err) {
      message.error(String(err));
    } finally {
      setScaling(false);
    }
  }, [currentClusterId, scaleTarget, scaleValue, load, message]);

  const handleRestart = useCallback(
    async (d: DeploymentInfo) => {
      if (!currentClusterId) return;
      try {
        await api.restartDeployment(currentClusterId, d.namespace, d.name);
        message.success(`Restarted "${d.name}"`);
        void load();
      } catch (err) {
        message.error(String(err));
      }
    },
    [currentClusterId, load, message],
  );

  const columns: ColumnsType<DeploymentInfo> = [
    {
      title: "Namespace",
      dataIndex: "namespace",
      key: "namespace",
      width: 160,
      sorter: (a, b) => a.namespace.localeCompare(b.namespace),
      render: (ns: string) => <Text type="secondary">{ns}</Text>,
    },
    {
      title: "Name",
      dataIndex: "name",
      key: "name",
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (name: string) => <Text strong>{name}</Text>,
    },
    { title: "Ready", dataIndex: "ready", key: "ready", width: 100, align: "center" },
    {
      title: "Replicas",
      dataIndex: "replicas",
      key: "replicas",
      width: 100,
      align: "right",
      sorter: (a, b) => a.replicas - b.replicas,
    },
    { title: "Available", dataIndex: "available", key: "available", width: 100, align: "right" },
    { title: "Updated", dataIndex: "updated", key: "updated", width: 100, align: "right" },
    {
      title: "Age",
      dataIndex: "age_ms",
      key: "age_ms",
      width: 100,
      align: "right",
      sorter: (a, b) => a.age_ms - b.age_ms,
      render: (ms: number) => formatAge(ms),
    },
    {
      title: "",
      key: "actions",
      width: 150,
      align: "right",
      render: (_, record) => (
        <Space size={2} onClick={(e) => e.stopPropagation()}>
          <Button
            type="text"
            size="small"
            icon={<ColumnHeightOutlined />}
            onClick={() => openScale(record)}
          >
            Scale
          </Button>
          <Popconfirm
            title={`Restart "${record.name}"?`}
            description="Triggers a rolling restart of all pods."
            onConfirm={() => handleRestart(record)}
          >
            <Button type="text" size="small" icon={<RedoOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  if (!currentClusterId) {
    return (
      <Card style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <Empty description="No cluster selected. Choose one from the sidebar." />
      </Card>
    );
  }

  return (
    <Card
      title="Deployments"
      style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
      styles={{ body: { flex: 1, minHeight: 0, overflow: "hidden", padding: 0 } }}
      extra={
        <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
          Refresh
        </Button>
      }
    >
      <Table<DeploymentInfo>
        size="small"
        rowKey={(r) => `${r.namespace}/${r.name}`}
        dataSource={deployments}
        columns={columns}
        loading={loading}
        pagination={{ defaultPageSize: 20, showSizeChanger: true, showTotal: (t) => `Total ${t}` }}
        locale={{ emptyText: <Empty description="No deployments" /> }}
        scroll={{ y: "max(200px, calc(100vh - 240px))" }}
      />

      <Modal
        title={scaleTarget ? `Scale: ${scaleTarget.name}` : "Scale"}
        open={!!scaleTarget}
        onOk={handleScale}
        onCancel={() => setScaleTarget(null)}
        okText="Scale"
        confirmLoading={scaling}
        destroyOnClose
      >
        <Space direction="vertical" style={{ width: "100%" }}>
          <Text type="secondary">Set the desired number of replicas.</Text>
          <InputNumber
            min={0}
            max={1000}
            value={scaleValue}
            onChange={(v) => {
              if (typeof v === "number" && Number.isFinite(v) && v >= 0) setScaleValue(Math.floor(v));
            }}
            style={{ width: "100%" }}
            autoFocus
          />
        </Space>
      </Modal>
    </Card>
  );
}
