use std::collections::HashMap;

use kube::api::{Patch, PatchParams};
use kube::core::{ApiResource, DynamicObject, GroupVersionKind};
use kube::Api;
use tauri::State;

use crate::AppState;

/// Split an apiVersion ("apps/v1" or "v1") into (group, version).
fn split_api_version(api_version: &str) -> (String, String) {
    match api_version.split_once('/') {
        Some((g, v)) => (g.to_string(), v.to_string()),
        None => (String::new(), api_version.to_string()),
    }
}

/// Build an ApiResource from apiVersion + kind without hitting cluster discovery.
fn api_resource(api_version: &str, kind: &str) -> ApiResource {
    let (group, version) = split_api_version(api_version);
    let gvk = GroupVersionKind::gvk(&group, &version, kind);
    ApiResource::from_gvk(&gvk)
}

fn dynamic_api(
    client: &kube::Client,
    ar: &ApiResource,
    namespace: Option<&str>,
) -> Api<DynamicObject> {
    match namespace {
        Some(ns) if !ns.is_empty() => Api::namespaced_with(client.clone(), ns, ar),
        _ => Api::all_with(client.clone(), ar),
    }
}

/// Update labels and annotations for any Kubernetes resource.
#[tauri::command]
pub async fn update_resource_metadata(
    state: State<'_, AppState>,
    cluster_id: String,
    api_version: String,
    kind: String,
    namespace: Option<String>,
    name: String,
    labels: HashMap<String, String>,
    annotations: HashMap<String, String>,
) -> Result<(), String> {
    let client = state.pool.get_or_create(&cluster_id).await?;
    let ar = api_resource(&api_version, &kind);
    let api = dynamic_api(&client, &ar, namespace.as_deref());

    let patch = serde_json::json!({
        "metadata": {
            "labels": labels,
            "annotations": annotations,
        }
    });

    api.patch(&name, &PatchParams::default(), &Patch::Merge(patch))
        .await
        .map_err(|e| crate::errors::kube_error("update resource metadata", e))?;

    Ok(())
}
