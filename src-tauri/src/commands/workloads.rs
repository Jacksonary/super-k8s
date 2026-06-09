use crate::types::{ConfigMapInfo, DeploymentInfo, ServiceInfo};
use crate::AppState;
use k8s_openapi::api::apps::v1::Deployment;
use k8s_openapi::api::core::v1::{ConfigMap, Service};
use kube::api::{ListParams, Patch, PatchParams};
use kube::Api;
use serde_json::{json, Value};
use tauri::State;

fn deployments_api(client: kube::Client, namespace: &Option<String>) -> Api<Deployment> {
    match namespace {
        Some(ns) if !ns.is_empty() => Api::namespaced(client, ns),
        _ => Api::all(client),
    }
}

fn services_api(client: kube::Client, namespace: &Option<String>) -> Api<Service> {
    match namespace {
        Some(ns) if !ns.is_empty() => Api::namespaced(client, ns),
        _ => Api::all(client),
    }
}

fn configmaps_api(client: kube::Client, namespace: &Option<String>) -> Api<ConfigMap> {
    match namespace {
        Some(ns) if !ns.is_empty() => Api::namespaced(client, ns),
        _ => Api::all(client),
    }
}

#[tauri::command]
pub async fn list_deployments(
    state: State<'_, AppState>,
    cluster_id: String,
    namespace: Option<String>,
) -> Result<Vec<DeploymentInfo>, String> {
    let client = state.pool.get_or_create(&cluster_id).await?;
    let api = deployments_api(client.clone(), &namespace);
    let list = api
        .list(&ListParams::default())
        .await
        .map_err(|e| format!("[KUBE] {e}"))?;

    let mut out = Vec::with_capacity(list.items.len());
    for dep in list.items {
        let name = dep.metadata.name.clone().unwrap_or_default();
        let ns = dep.metadata.namespace.clone().unwrap_or_default();
        let age_ms = dep
            .metadata
            .creation_timestamp
            .as_ref()
            .map(|t| t.0.as_millisecond())
            .unwrap_or(0);

        let desired = dep
            .spec
            .as_ref()
            .and_then(|s| s.replicas)
            .unwrap_or(0);
        let status = dep.status.as_ref();
        let ready_replicas = status.and_then(|s| s.ready_replicas).unwrap_or(0);
        let available = status.and_then(|s| s.available_replicas).unwrap_or(0);
        let updated = status.and_then(|s| s.updated_replicas).unwrap_or(0);

        out.push(DeploymentInfo {
            name,
            namespace: ns,
            ready: format!("{ready_replicas}/{desired}"),
            replicas: desired,
            available,
            updated,
            age_ms,
        });
    }

    Ok(out)
}

#[tauri::command]
pub async fn scale_deployment(
    state: State<'_, AppState>,
    cluster_id: String,
    namespace: String,
    name: String,
    replicas: i32,
) -> Result<Value, String> {
    let client = state.pool.get_or_create(&cluster_id).await?;
    let api: Api<Deployment> = Api::namespaced(client.clone(), &namespace);
    let patch = json!({ "spec": { "replicas": replicas } });
    api.patch(&name, &PatchParams::default(), &Patch::Merge(&patch))
        .await
        .map_err(|e| format!("[KUBE] {e}"))?;
    Ok(json!({ "ok": true }))
}

#[tauri::command]
pub async fn restart_deployment(
    state: State<'_, AppState>,
    cluster_id: String,
    namespace: String,
    name: String,
) -> Result<Value, String> {
    let client = state.pool.get_or_create(&cluster_id).await?;
    let api: Api<Deployment> = Api::namespaced(client.clone(), &namespace);
    let now = chrono::Utc::now().to_rfc3339();
    let patch = json!({
        "spec": {
            "template": {
                "metadata": {
                    "annotations": {
                        "kubectl.kubernetes.io/restartedAt": now
                    }
                }
            }
        }
    });
    api.patch(&name, &PatchParams::default(), &Patch::Merge(&patch))
        .await
        .map_err(|e| format!("[KUBE] {e}"))?;
    Ok(json!({ "ok": true }))
}

#[tauri::command]
pub async fn list_services(
    state: State<'_, AppState>,
    cluster_id: String,
    namespace: Option<String>,
) -> Result<Vec<ServiceInfo>, String> {
    let client = state.pool.get_or_create(&cluster_id).await?;
    let api = services_api(client.clone(), &namespace);
    let list = api
        .list(&ListParams::default())
        .await
        .map_err(|e| format!("[KUBE] {e}"))?;

    let mut out = Vec::with_capacity(list.items.len());
    for svc in list.items {
        let name = svc.metadata.name.clone().unwrap_or_default();
        let ns = svc.metadata.namespace.clone().unwrap_or_default();
        let age_ms = svc
            .metadata
            .creation_timestamp
            .as_ref()
            .map(|t| t.0.as_millisecond())
            .unwrap_or(0);

        let spec = svc.spec.as_ref();
        let svc_type = spec
            .and_then(|s| s.type_.clone())
            .unwrap_or_else(|| "ClusterIP".to_string());
        let cluster_ip = spec
            .and_then(|s| s.cluster_ip.clone())
            .unwrap_or_default();

        let ports: Vec<String> = spec
            .and_then(|s| s.ports.as_ref())
            .map(|ports| {
                ports
                    .iter()
                    .map(|p| {
                        let proto = p.protocol.clone().unwrap_or_else(|| "TCP".to_string());
                        match &p.target_port {
                            Some(tp) => {
                                let tp_str = match tp {
                                    k8s_openapi::apimachinery::pkg::util::intstr::IntOrString::Int(i) => i.to_string(),
                                    k8s_openapi::apimachinery::pkg::util::intstr::IntOrString::String(s) => s.clone(),
                                };
                                format!("{}:{}/{}", p.port, tp_str, proto)
                            }
                            None => format!("{}/{}", p.port, proto),
                        }
                    })
                    .collect()
            })
            .unwrap_or_default();

        let external_ip = svc
            .status
            .as_ref()
            .and_then(|s| s.load_balancer.as_ref())
            .and_then(|lb| lb.ingress.as_ref())
            .map(|ingress| {
                ingress
                    .iter()
                    .filter_map(|i| i.ip.clone().or_else(|| i.hostname.clone()))
                    .collect::<Vec<_>>()
                    .join(", ")
            })
            .filter(|s| !s.is_empty());

        out.push(ServiceInfo {
            name,
            namespace: ns,
            svc_type,
            cluster_ip,
            external_ip,
            ports,
            age_ms,
        });
    }

    Ok(out)
}

#[tauri::command]
pub async fn list_configmaps(
    state: State<'_, AppState>,
    cluster_id: String,
    namespace: Option<String>,
) -> Result<Vec<ConfigMapInfo>, String> {
    let client = state.pool.get_or_create(&cluster_id).await?;
    let api = configmaps_api(client.clone(), &namespace);
    let list = api
        .list(&ListParams::default())
        .await
        .map_err(|e| format!("[KUBE] {e}"))?;

    let mut out = Vec::with_capacity(list.items.len());
    for cm in list.items {
        let name = cm.metadata.name.clone().unwrap_or_default();
        let ns = cm.metadata.namespace.clone().unwrap_or_default();
        let age_ms = cm
            .metadata
            .creation_timestamp
            .as_ref()
            .map(|t| t.0.as_millisecond())
            .unwrap_or(0);
        let data_keys: Vec<String> = cm
            .data
            .as_ref()
            .map(|d| d.keys().cloned().collect())
            .unwrap_or_default();

        out.push(ConfigMapInfo {
            name,
            namespace: ns,
            data_keys,
            age_ms,
        });
    }

    Ok(out)
}
