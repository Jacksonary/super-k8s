use crate::config;
use crate::types::{ClusterConfig, ClusterSummary, TestConnectionResult};
use crate::AppState;
use k8s_openapi::api::core::v1::{Namespace, Node};
use kube::{api::ListParams, Api};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::time::Instant;
use tauri::State;

#[tauri::command]
pub async fn list_clusters(state: State<'_, AppState>) -> Result<Vec<ClusterConfig>, String> {
    let mut clusters = state.pool.list_clusters()?;
    let order = config::load_sort_order().unwrap_or_default();
    clusters.sort_by(|a, b| {
        let oa = order.get(&a.id).copied().unwrap_or(0);
        let ob = order.get(&b.id).copied().unwrap_or(0);
        if oa != 0 && ob != 0 { return oa.cmp(&ob); }
        if oa != 0 { return std::cmp::Ordering::Less; }
        if ob != 0 { return std::cmp::Ordering::Greater; }
        a.name.cmp(&b.name)
    });
    Ok(clusters)
}

#[tauri::command]
pub async fn import_kubeconfig(state: State<'_, AppState>, yaml: String) -> Result<Value, String> {
    let added = state.pool.import_kubeconfig(&yaml)?;
    Ok(json!({ "ok": true, "added": added }))
}

#[tauri::command]
pub async fn delete_cluster(
    state: State<'_, AppState>,
    cluster_id: String,
) -> Result<Value, String> {
    state.pool.delete_cluster(&cluster_id)?;
    state.pool.invalidate(&cluster_id);
    let _ = crate::config::remove_namespace_override(&cluster_id);
    let mut order = config::load_sort_order().unwrap_or_default();
    order.remove(&cluster_id);
    let _ = config::save_sort_order(&order);
    Ok(json!({ "ok": true }))
}

#[tauri::command]
pub async fn reorder_clusters(ids: Vec<String>) -> Result<Value, String> {
    let mut order = BTreeMap::new();
    for (i, id) in ids.iter().enumerate() {
        order.insert(id.clone(), (i + 1) as u64);
    }
    config::save_sort_order(&order)?;
    Ok(json!({ "ok": true }))
}

#[tauri::command]
pub async fn reload_default_kubeconfig(state: State<'_, AppState>) -> Result<Value, String> {
    let added = state.pool.reload_default()?;
    Ok(json!({ "ok": true, "added": added }))
}

#[tauri::command]
pub async fn test_connection(
    state: State<'_, AppState>,
    cluster_id: String,
) -> Result<TestConnectionResult, String> {
    let started = Instant::now();
    let client = match state.pool.get_or_create(&cluster_id).await {
        Ok(c) => c,
        Err(e) => {
            return Ok(TestConnectionResult {
                success: false,
                server_version: None,
                node_count: None,
                error_message: Some(e),
                latency_ms: None,
            });
        }
    };

    match client.apiserver_version().await {
        Ok(info) => {
            let nodes: Api<Node> = Api::all(client.clone());
            let node_count = nodes
                .list(&ListParams::default())
                .await
                .map(|l| l.items.len() as i32)
                .ok();
            Ok(TestConnectionResult {
                success: true,
                server_version: Some(info.git_version),
                node_count,
                error_message: None,
                latency_ms: Some(started.elapsed().as_millis() as u64),
            })
        }
        Err(e) => Ok(TestConnectionResult {
            success: false,
            server_version: None,
            node_count: None,
            error_message: Some(crate::errors::kube_error("connect cluster", e)),
            latency_ms: Some(started.elapsed().as_millis() as u64),
        }),
    }
}

#[tauri::command]
pub async fn get_cluster_summary(
    state: State<'_, AppState>,
    cluster_id: String,
) -> Result<ClusterSummary, String> {
    summarize(&state, &cluster_id).await
}

#[tauri::command]
pub async fn ping_cluster(
    state: State<'_, AppState>,
    cluster_id: String,
) -> Result<ClusterSummary, String> {
    summarize(&state, &cluster_id).await
}

async fn summarize(
    state: &State<'_, AppState>,
    cluster_id: &str,
) -> Result<ClusterSummary, String> {
    let configs = state.pool.list_clusters()?;
    let cfg = configs.into_iter().find(|c| c.id == cluster_id);
    let (name, server) = match cfg {
        Some(c) => (c.name, c.server),
        None => (cluster_id.to_string(), String::new()),
    };

    let client = match state.pool.get_or_create(cluster_id).await {
        Ok(c) => c,
        Err(e) => {
            return Ok(ClusterSummary {
                id: cluster_id.to_string(),
                name,
                server,
                status: "error".to_string(),
                server_version: None,
                node_count: None,
                namespace_count: None,
                error_message: Some(e),
            });
        }
    };

    match client.apiserver_version().await {
        Ok(info) => {
            let nodes: Api<Node> = Api::all(client.clone());
            let lp = ListParams::default();
            let node_res = nodes.list(&lp).await;
            let namespace_override = config::get_namespace_override(cluster_id);
            let namespace_count = if namespace_override.is_empty() {
                let namespaces: Api<Namespace> = Api::all(client.clone());
                namespaces
                    .list(&lp)
                    .await
                    .map(|l| l.items.len() as i32)
                    .ok()
            } else {
                Some(namespace_override.len() as i32)
            };
            Ok(ClusterSummary {
                id: cluster_id.to_string(),
                name,
                server,
                status: "connected".to_string(),
                server_version: Some(info.git_version),
                node_count: node_res.map(|l| l.items.len() as i32).ok(),
                namespace_count,
                error_message: None,
            })
        }
        Err(e) => Ok(ClusterSummary {
            id: cluster_id.to_string(),
            name,
            server,
            status: "error".to_string(),
            server_version: None,
            node_count: None,
            namespace_count: None,
            error_message: Some(crate::errors::kube_error("connect cluster", e)),
        }),
    }
}
