use crate::commands::scope;
use crate::types::PodInfo;
use crate::AppState;
use k8s_openapi::api::core::v1::Pod;
use kube::api::{DeleteParams, LogParams};
use kube::Api;
use serde_json::{json, Value};
use tauri::State;

/// Map a k8s Pod into our PodInfo. Shared by list_pods and the drilldown
/// commands (list_node_pods / list_deployment_pods).
pub fn map_pod(pod: &Pod) -> PodInfo {
    let name = pod.metadata.name.clone().unwrap_or_default();
    let ns = pod.metadata.namespace.clone().unwrap_or_default();
    let age_ms = pod
        .metadata
        .creation_timestamp
        .as_ref()
        .map(|t| t.0.as_millisecond())
        .unwrap_or(0);

    let containers: Vec<String> = pod
        .spec
        .as_ref()
        .map(|s| s.containers.iter().map(|c| c.name.clone()).collect())
        .unwrap_or_default();
    let total = containers.len();

    let node = pod
        .spec
        .as_ref()
        .and_then(|s| s.node_name.clone())
        .unwrap_or_default();

    let status_block = pod.status.as_ref();
    let phase = status_block
        .and_then(|s| s.phase.clone())
        .unwrap_or_default();
    let container_statuses = status_block.and_then(|s| s.container_statuses.as_ref());
    let ready_count = container_statuses
        .map(|cs| cs.iter().filter(|c| c.ready).count())
        .unwrap_or(0);
    let restarts: i32 = container_statuses
        .map(|cs| cs.iter().map(|c| c.restart_count).sum())
        .unwrap_or(0);
    let pod_ip = status_block
        .and_then(|s| s.pod_ip.clone())
        .unwrap_or_default();

    PodInfo {
        name,
        namespace: ns,
        status: phase,
        ready: format!("{ready_count}/{total}"),
        restarts,
        node,
        pod_ip,
        containers,
        age_ms,
    }
}

#[tauri::command]
pub async fn list_pods(
    state: State<'_, AppState>,
    cluster_id: String,
    namespace: Option<String>,
) -> Result<Vec<PodInfo>, String> {
    let client = state.pool.get_or_create(&cluster_id).await?;
    let items = scope::list_scoped::<Pod>(&client, &cluster_id, &namespace).await?;

    Ok(items.iter().map(map_pod).collect())
}

#[tauri::command]
pub async fn get_pod_logs(
    state: State<'_, AppState>,
    cluster_id: String,
    namespace: String,
    pod: String,
    container: Option<String>,
    tail_lines: i64,
) -> Result<String, String> {
    let client = state.pool.get_or_create(&cluster_id).await?;
    let api: Api<Pod> = Api::namespaced(client.clone(), &namespace);
    let lp = LogParams {
        container,
        tail_lines: Some(tail_lines),
        timestamps: false,
        ..Default::default()
    };
    let logs = api
        .logs(&pod, &lp)
        .await
        .map_err(|e| crate::errors::kube_error("pod operation", e))?;
    Ok(logs)
}

#[tauri::command]
pub async fn delete_pod(
    state: State<'_, AppState>,
    cluster_id: String,
    namespace: String,
    pod: String,
) -> Result<Value, String> {
    let client = state.pool.get_or_create(&cluster_id).await?;
    let api: Api<Pod> = Api::namespaced(client.clone(), &namespace);
    api.delete(&pod, &DeleteParams::default())
        .await
        .map_err(|e| crate::errors::kube_error("pod operation", e))?;
    Ok(json!({ "ok": true }))
}
