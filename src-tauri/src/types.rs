use serde::{Deserialize, Serialize};

/// A cluster == a context in a kubeconfig. `id` == context name.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClusterConfig {
    pub id: String,
    pub name: String,
    pub server: String,
    pub namespace: Option<String>,
    pub user: String,
    /// "default" | "imported"
    pub source: String,
    /// User-defined namespace whitelist for this cluster. Empty = no override
    /// (auto-list all namespaces). Populated from namespace_overrides.yaml.
    #[serde(default)]
    pub custom_namespaces: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClusterSummary {
    pub id: String,
    pub name: String,
    pub server: String,
    /// "connected" | "error" | "connecting"
    pub status: String,
    pub server_version: Option<String>,
    pub node_count: Option<i32>,
    pub namespace_count: Option<i32>,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestConnectionResult {
    pub success: bool,
    pub server_version: Option<String>,
    pub node_count: Option<i32>,
    pub error_message: Option<String>,
    pub latency_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClusterOverview {
    pub server_version: Option<String>,
    pub node_count: i32,
    pub ready_nodes: i32,
    pub namespace_count: i32,
    pub pod_count: i32,
    pub deployment_count: i32,
    pub service_count: i32,
    pub configmap_count: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeInfo {
    pub name: String,
    pub status: String,
    pub roles: Vec<String>,
    pub version: String,
    pub os_image: String,
    pub internal_ip: String,
    pub cpu_capacity: String,
    pub memory_capacity: String,
    pub ready: bool,
    pub age_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NamespaceInfo {
    pub name: String,
    pub status: String,
    pub age_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PodInfo {
    pub name: String,
    pub namespace: String,
    pub status: String,
    /// "1/1"
    pub ready: String,
    pub restarts: i32,
    pub node: String,
    pub pod_ip: String,
    pub containers: Vec<String>,
    pub age_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeploymentInfo {
    pub name: String,
    pub namespace: String,
    /// "2/3"
    pub ready: String,
    pub replicas: i32,
    pub available: i32,
    pub updated: i32,
    pub age_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceInfo {
    pub name: String,
    pub namespace: String,
    pub svc_type: String,
    pub cluster_ip: String,
    pub external_ip: Option<String>,
    pub ports: Vec<String>,
    pub age_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigMapInfo {
    pub name: String,
    pub namespace: String,
    pub data_keys: Vec<String>,
    pub age_ms: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct EndpointInfo {
    pub ip: String,
    pub node_name: Option<String>,
    /// "Kind/name"
    pub target_ref: Option<String>,
    /// "name:port/proto"
    pub ports: Vec<String>,
    pub ready: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventInfo {
    pub namespace: String,
    pub event_type: String,
    pub reason: String,
    pub object: String,
    pub message: String,
    pub count: i32,
    pub last_seen_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(default = "default_language")]
    pub language: String,
    #[serde(default = "default_log_tail_lines")]
    pub log_tail_lines_default: i32,
    #[serde(default = "default_true")]
    pub check_updates_on_startup: bool,
    #[serde(default)]
    pub allow_multiple_instances: bool,
}

fn default_theme() -> String {
    "dark".to_string()
}
fn default_language() -> String {
    "zh".to_string()
}
fn default_log_tail_lines() -> i32 {
    500
}
fn default_true() -> bool {
    true
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            theme: default_theme(),
            language: default_language(),
            log_tail_lines_default: default_log_tail_lines(),
            check_updates_on_startup: true,
            allow_multiple_instances: false,
        }
    }
}
