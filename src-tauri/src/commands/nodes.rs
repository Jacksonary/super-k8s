use crate::types::NodeInfo;
use crate::AppState;
use k8s_openapi::api::core::v1::Node;
use kube::{api::ListParams, Api};
use tauri::State;

#[tauri::command]
pub async fn list_nodes(
    state: State<'_, AppState>,
    cluster_id: String,
) -> Result<Vec<NodeInfo>, String> {
    let client = state.pool.get_or_create(&cluster_id).await?;
    let api: Api<Node> = Api::all(client.clone());
    let list = api
        .list(&ListParams::default())
        .await
        .map_err(|e| format!("[KUBE] {e}"))?;

    let mut out = Vec::with_capacity(list.items.len());
    for node in list.items {
        let name = node.metadata.name.clone().unwrap_or_default();
        let age_ms = node
            .metadata
            .creation_timestamp
            .as_ref()
            .map(|t| t.0.as_millisecond())
            .unwrap_or(0);

        let roles: Vec<String> = node
            .metadata
            .labels
            .as_ref()
            .map(|labels| {
                labels
                    .keys()
                    .filter_map(|k| k.strip_prefix("node-role.kubernetes.io/"))
                    .filter(|r| !r.is_empty())
                    .map(|r| r.to_string())
                    .collect()
            })
            .unwrap_or_default();

        let ready = node
            .status
            .as_ref()
            .and_then(|s| s.conditions.as_ref())
            .map(|conds| {
                conds
                    .iter()
                    .any(|c| c.type_ == "Ready" && c.status == "True")
            })
            .unwrap_or(false);

        let node_info = node.status.as_ref().and_then(|s| s.node_info.as_ref());
        let version = node_info
            .map(|i| i.kubelet_version.clone())
            .unwrap_or_default();
        let os_image = node_info.map(|i| i.os_image.clone()).unwrap_or_default();

        let internal_ip = node
            .status
            .as_ref()
            .and_then(|s| s.addresses.as_ref())
            .and_then(|addrs| {
                addrs
                    .iter()
                    .find(|a| a.type_ == "InternalIP")
                    .map(|a| a.address.clone())
            })
            .unwrap_or_default();

        let capacity = node.status.as_ref().and_then(|s| s.capacity.as_ref());
        let cpu_capacity = capacity
            .and_then(|c| c.get("cpu"))
            .map(|q| q.0.clone())
            .unwrap_or_default();
        let memory_capacity = capacity
            .and_then(|c| c.get("memory"))
            .map(|q| q.0.clone())
            .unwrap_or_default();

        out.push(NodeInfo {
            name,
            status: if ready { "Ready".to_string() } else { "NotReady".to_string() },
            roles,
            version,
            os_image,
            internal_ip,
            cpu_capacity,
            memory_capacity,
            ready,
            age_ms,
        });
    }

    Ok(out)
}
