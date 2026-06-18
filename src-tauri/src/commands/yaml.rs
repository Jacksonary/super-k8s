use crate::AppState;
use kube::api::{DeleteParams, Patch, PatchParams};
use kube::core::{ApiResource, DynamicObject, GroupVersionKind};
use kube::Api;
use serde_json::{json, Value};
use tauri::State;

/// Split an apiVersion ("apps/v1" or "v1") into (group, version).
fn split_api_version(api_version: &str) -> (String, String) {
    match api_version.split_once('/') {
        Some((g, v)) => (g.to_string(), v.to_string()),
        None => (String::new(), api_version.to_string()),
    }
}

/// Build an ApiResource from apiVersion + kind without hitting cluster discovery.
///
/// We deliberately avoid `kube::discovery::Discovery`: it eagerly lists every API
/// group, and on aggregated/proxied clusters (e.g. Rancher) an unavailable
/// aggregated API server makes the whole discovery call fail with 503. The
/// frontend already knows the apiVersion+kind for each resource page, and the
/// built-in pluralizer in `ApiResource::from_gvk` is correct for all the core
/// kinds we expose (Pod, Service, ConfigMap, Deployment, Node, Namespace).
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

#[tauri::command]
pub async fn get_resource_yaml(
    state: State<'_, AppState>,
    cluster_id: String,
    api_version: String,
    kind: String,
    namespace: Option<String>,
    name: String,
) -> Result<String, String> {
    let client = state.pool.get_or_create(&cluster_id).await?;
    let ar = api_resource(&api_version, &kind);
    let api = dynamic_api(&client, &ar, namespace.as_deref());

    let mut obj = api
        .get(&name)
        .await
        .map_err(|e| crate::errors::kube_error("resource operation", e))?;

    // Drop noisy server-managed fields so the editor shows a clean document.
    obj.metadata.managed_fields = None;

    serde_yaml::to_string(&obj).map_err(|e| format!("[YAML] serialize: {e}"))
}

#[tauri::command]
pub async fn get_resource_json(
    state: State<'_, AppState>,
    cluster_id: String,
    api_version: String,
    kind: String,
    namespace: Option<String>,
    name: String,
) -> Result<Value, String> {
    let client = state.pool.get_or_create(&cluster_id).await?;
    let ar = api_resource(&api_version, &kind);
    let api = dynamic_api(&client, &ar, namespace.as_deref());

    let mut obj = api
        .get(&name)
        .await
        .map_err(|e| crate::errors::kube_error("resource operation", e))?;

    // Drop noisy server-managed fields, matching get_resource_yaml.
    obj.metadata.managed_fields = None;

    serde_json::to_value(&obj).map_err(|e| format!("[JSON] {e}"))
}

#[tauri::command]
pub async fn apply_resource_yaml(
    state: State<'_, AppState>,
    cluster_id: String,
    yaml: String,
) -> Result<Value, String> {
    let client = state.pool.get_or_create(&cluster_id).await?;

    let obj: DynamicObject =
        serde_yaml::from_str(&yaml).map_err(|e| format!("[YAML] parse: {e}"))?;

    let types = obj
        .types
        .as_ref()
        .ok_or_else(|| "[YAML] missing apiVersion/kind".to_string())?;
    let ar = api_resource(&types.api_version, &types.kind);

    let name = obj
        .metadata
        .name
        .clone()
        .ok_or_else(|| "[YAML] missing metadata.name".to_string())?;
    let namespace = obj.metadata.namespace.clone();

    let api = dynamic_api(&client, &ar, namespace.as_deref());
    let params = PatchParams::apply("super-k8s");
    api.patch(&name, &params, &Patch::Apply(&obj))
        .await
        .map_err(|e| crate::errors::kube_error("resource operation", e))?;

    Ok(json!({ "ok": true, "name": name }))
}

/// Generic delete for any kind via DynamicObject (no discovery).
#[tauri::command]
pub async fn delete_resource(
    state: State<'_, AppState>,
    cluster_id: String,
    api_version: String,
    kind: String,
    namespace: Option<String>,
    name: String,
) -> Result<Value, String> {
    let client = state.pool.get_or_create(&cluster_id).await?;
    let ar = api_resource(&api_version, &kind);
    let api = dynamic_api(&client, &ar, namespace.as_deref());
    api.delete(&name, &DeleteParams::default())
        .await
        .map_err(|e| crate::errors::kube_error("resource operation", e))?;
    Ok(json!({ "ok": true }))
}
