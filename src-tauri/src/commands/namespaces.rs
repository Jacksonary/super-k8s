use crate::types::NamespaceInfo;
use crate::AppState;
use k8s_openapi::api::core::v1::Namespace;
use kube::{api::ListParams, Api};
use tauri::State;

#[tauri::command]
pub async fn list_namespaces(
    state: State<'_, AppState>,
    cluster_id: String,
) -> Result<Vec<NamespaceInfo>, String> {
    let client = state.pool.get_or_create(&cluster_id).await?;
    let api: Api<Namespace> = Api::all(client.clone());
    let list = api
        .list(&ListParams::default())
        .await
        .map_err(|e| format!("[KUBE] {e}"))?;

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
