// ── 集群（== kubeconfig context）────────────────────────────

/** 存在受管 kubeconfig 中的集群（context）配置 */
export interface ClusterConfig {
  id: string; // context name
  name: string;
  server: string;
  namespace: string | null;
  user: string;
  source: string; // "default" | "imported"
}

/** 前端展示用（含连接状态） */
export interface ClusterSummary {
  id: string;
  name: string;
  server: string;
  status: "connected" | "error" | "connecting";
  server_version: string | null;
  node_count: number | null;
  namespace_count: number | null;
  error_message: string | null;
}

export interface TestConnectionResult {
  success: boolean;
  server_version: string | null;
  node_count: number | null;
  error_message: string | null;
  latency_ms: number | null;
}

// ── 概览 ────────────────────────────────────────────────────

export interface ClusterOverview {
  server_version: string | null;
  node_count: number;
  ready_nodes: number;
  namespace_count: number;
  pod_count: number;
  deployment_count: number;
  service_count: number;
  configmap_count: number;
}

// ── Node ────────────────────────────────────────────────────

export interface NodeInfo {
  name: string;
  status: string;
  roles: string[];
  version: string;
  os_image: string;
  internal_ip: string;
  cpu_capacity: string;
  memory_capacity: string;
  ready: boolean;
  age_ms: number;
}

// ── Namespace ───────────────────────────────────────────────

export interface NamespaceInfo {
  name: string;
  status: string;
  age_ms: number;
}

// ── Pod ─────────────────────────────────────────────────────

export interface PodInfo {
  name: string;
  namespace: string;
  status: string;
  ready: string; // "1/1"
  restarts: number;
  node: string;
  pod_ip: string;
  containers: string[];
  age_ms: number;
}

// ── Deployment ──────────────────────────────────────────────

export interface DeploymentInfo {
  name: string;
  namespace: string;
  ready: string; // "2/3"
  replicas: number;
  available: number;
  updated: number;
  age_ms: number;
}

// ── Service ─────────────────────────────────────────────────

export interface ServiceInfo {
  name: string;
  namespace: string;
  svc_type: string;
  cluster_ip: string;
  external_ip: string | null;
  ports: string[];
  age_ms: number;
}

// ── ConfigMap ───────────────────────────────────────────────

export interface ConfigMapInfo {
  name: string;
  namespace: string;
  data_keys: string[];
  age_ms: number;
}

// ── Event ───────────────────────────────────────────────────

export interface EventInfo {
  namespace: string;
  event_type: string;
  reason: string;
  object: string;
  message: string;
  count: number;
  last_seen_ms: number;
}

// ── 应用设置 ────────────────────────────────────────────────

export interface AppConfig {
  theme: "dark" | "light";
  language: "zh" | "en";
  log_tail_lines_default: number;
  check_updates_on_startup: boolean;
  allow_multiple_instances: boolean;
}
