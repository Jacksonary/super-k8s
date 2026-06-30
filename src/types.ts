

export interface ClusterConfig {
  id: string; // context name
  name: string;
  server: string;
  namespace: string | null;
  user: string;
  source: string; // "default" | "imported"
  custom_namespaces: string[];
}


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

// ── Overview ────────────────────────────────────────────────────

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


export interface EndpointInfo {
  ip: string;
  node_name: string | null;
  target_ref: string | null;
  ports: string[];
  ready: boolean;
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

export type ExecEvent =
  | { kind: "data"; data: string }
  | { kind: "exit"; message?: string | null };

export type LogEvent =
  | { kind: "line"; data: string }
  | { kind: "done" }
  | { kind: "error"; message: string };

export type FileDownloadEvent =
  | { kind: "fileSize"; total: number }
  | { kind: "progress"; totalBytes: number }
  | { kind: "complete"; totalBytes: number }
  | { kind: "error"; message: string };

export interface FileEntry {
  name: string;
  isDir: boolean;
}

export interface SecretInfo {
  name: string;
  namespace: string;
  secret_type: string;
  data_keys: string[];
  age_ms: number;
}

export interface CronJobInfo {
  name: string;
  namespace: string;
  schedule: string;
  active: number;
  last_schedule_ms: number | null;
  age_ms: number;
}

export interface JobInfo {
  name: string;
  namespace: string;
  completions: number | null;
  succeeded: number;
  failed: number;
  active: number;
  complete: boolean;
  age_ms: number;
}

export interface IngressInfo {
  name: string;
  namespace: string;
  ingress_class: string | null;
  hosts: string[];
  rules_count: number;
  age_ms: number;
}

export interface AppConfig {
  theme: "dark" | "light";
  language: "zh" | "en";
  log_tail_lines_default: number;
  check_updates_on_startup: boolean;
  allow_multiple_instances: boolean;
}
