use crate::config;
use crate::types::NamespaceInfo;
use crate::AppState;
use k8s_openapi::api::core::v1::Namespace;
use kube::{
    api::{ListParams, PostParams},
    Api,
};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use tauri::State;

#[tauri::command]
pub async fn list_namespaces(
    state: State<'_, AppState>,
    cluster_id: String,
) -> Result<Vec<NamespaceInfo>, String> {
    // If the cluster has a user-defined whitelist, return it directly without
    // calling the cluster-scoped list API (which 403s for restricted credentials).
    // status/age are placeholders since we deliberately don't fetch metadata.
    let whitelist = config::get_namespace_override(&cluster_id);
    if !whitelist.is_empty() {
        return Ok(whitelist
            .into_iter()
            .map(|name| NamespaceInfo {
                name,
                status: "Active".to_string(),
                age_ms: 0,
            })
            .collect());
    }

    let client = state.pool.get_or_create(&cluster_id).await?;
    let api: Api<Namespace> = Api::all(client.clone());
    let list = api
        .list(&ListParams::default())
        .await
        .map_err(|e| crate::errors::kube_error("list namespaces", e))?;

    let mut out = Vec::with_capacity(list.items.len());
    for ns in list.items {
        let name = ns.metadata.name.clone().unwrap_or_default();
        let age_ms = ns
            .metadata
            .creation_timestamp
            .as_ref()
            .map(|t| t.0.as_millisecond())
            .unwrap_or(0);
        let status = ns
            .status
            .as_ref()
            .and_then(|s| s.phase.clone())
            .unwrap_or_else(|| "Active".to_string());

        out.push(NamespaceInfo {
            name,
            status,
            age_ms,
        });
    }

    Ok(out)
}

/// Set (or clear) a cluster's namespace whitelist. An empty list clears the
/// override and restores auto-listing of all namespaces.
#[tauri::command]
pub async fn set_namespace_override(
    _state: State<'_, AppState>,
    cluster_id: String,
    namespaces: Vec<String>,
) -> Result<Value, String> {
    config::set_namespace_override(&cluster_id, namespaces)?;
    let count = config::get_namespace_override(&cluster_id).len();
    Ok(json!({ "ok": true, "count": count }))
}

#[tauri::command]
pub async fn update_namespace_metadata(
    state: State<'_, AppState>,
    cluster_id: String,
    name: String,
    labels: BTreeMap<String, String>,
    annotations: BTreeMap<String, String>,
) -> Result<Value, String> {
    let client = state.pool.get_or_create(&cluster_id).await?;
    let api: Api<Namespace> = Api::all(client.clone());
    let mut namespace = api
        .get(&name)
        .await
        .map_err(|e| crate::errors::kube_error("load namespace", e))?;

    namespace.metadata.labels = if labels.is_empty() {
        None
    } else {
        Some(labels)
    };
    namespace.metadata.annotations = if annotations.is_empty() {
        None
    } else {
        Some(annotations)
    };

    api.replace(&name, &PostParams::default(), &namespace)
        .await
        .map_err(|e| crate::errors::kube_error("update namespace metadata", e))?;
    Ok(json!({ "ok": true }))
}
