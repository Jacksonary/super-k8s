use crate::commands::scope;
use crate::types::ClusterOverview;
use crate::AppState;
use k8s_openapi::api::apps::v1::Deployment;
use k8s_openapi::api::core::v1::{ConfigMap, Namespace, Node, Pod, Service};
use kube::{api::ListParams, Api};
use tauri::State;

#[tauri::command]
pub async fn get_overview(
    state: State<'_, AppState>,
    cluster_id: String,
    namespace: Option<String>,
) -> Result<ClusterOverview, String> {
    let client = state.pool.get_or_create(&cluster_id).await?;

    let server_version = client
        .apiserver_version()
        .await
        .map(|info| info.git_version)
        .ok();

    let lp = ListParams::default();
    let nodes: Api<Node> = Api::all(client.clone());
    let node_res = nodes.list(&lp).await;

    let namespace_count = if namespace.as_deref().is_some_and(|ns| !ns.is_empty()) {
        1
    } else {
        let namespaces: Api<Namespace> = Api::all(client.clone());
        namespaces
            .list(&lp)
            .await
            .map(|l| l.items.len() as i32)
            .unwrap_or(0)
    };

    let (pod_res, dep_res, svc_res, cm_res) = futures::join!(
        scope::list_scoped::<Pod>(&client, &cluster_id, &namespace),
        scope::list_scoped::<Deployment>(&client, &cluster_id, &namespace),
        scope::list_scoped::<Service>(&client, &cluster_id, &namespace),
        scope::list_scoped::<ConfigMap>(&client, &cluster_id, &namespace),
    );

    let (node_count, ready_nodes) = match node_res {
        Ok(list) => {
            let total = list.items.len() as i32;
            let ready = list.items.iter().filter(|n| node_is_ready(n)).count() as i32;
            (total, ready)
        }
        Err(_) => (0, 0),
    };

    let pod_count = pod_res.map(|l| l.len() as i32).unwrap_or(0);
    let deployment_count = dep_res.map(|l| l.len() as i32).unwrap_or(0);
    let service_count = svc_res.map(|l| l.len() as i32).unwrap_or(0);
    let configmap_count = cm_res.map(|l| l.len() as i32).unwrap_or(0);

    Ok(ClusterOverview {
        server_version,
        node_count,
        ready_nodes,
        namespace_count,
        pod_count,
        deployment_count,
        service_count,
        configmap_count,
    })
}

fn node_is_ready(node: &Node) -> bool {
    node.status
        .as_ref()
        .and_then(|s| s.conditions.as_ref())
        .map(|conds| {
            conds
                .iter()
                .any(|c| c.type_ == "Ready" && c.status == "True")
        })
        .unwrap_or(false)
}
