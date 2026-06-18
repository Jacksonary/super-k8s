use kube::api::ListParams;
use kube::Api;

/// Resolve a namespace selector into a flat list of resource objects.
///
/// - `namespace = Some(ns)` (non-empty): query exactly that namespace.
/// - `namespace = None`/empty ("All"): query all namespaces.
pub async fn list_scoped<K>(
    client: &kube::Client,
    cluster_id: &str,
    namespace: &Option<String>,
) -> Result<Vec<K>, String>
where
    K: kube::Resource<Scope = k8s_openapi::NamespaceResourceScope>
        + Clone
        + serde::de::DeserializeOwned
        + std::fmt::Debug,
    K::DynamicType: Default,
{
    list_scoped_with_params(client, cluster_id, namespace, ListParams::default()).await
}

pub async fn list_scoped_with_params<K>(
    client: &kube::Client,
    _cluster_id: &str,
    namespace: &Option<String>,
    lp: ListParams,
) -> Result<Vec<K>, String>
where
    K: kube::Resource<Scope = k8s_openapi::NamespaceResourceScope>
        + Clone
        + serde::de::DeserializeOwned
        + std::fmt::Debug,
    K::DynamicType: Default,
{
    if let Some(ns) = namespace {
        if !ns.is_empty() {
            let api: Api<K> = Api::namespaced(client.clone(), ns);
            let list = api
                .list(&lp)
                .await
                .map_err(|e| crate::errors::kube_error("list resources", e))?;
            return Ok(list.items);
        }
    }

    let api: Api<K> = Api::all(client.clone());
    let list = api
        .list(&lp)
        .await
        .map_err(|e| crate::errors::kube_error("list resources", e))?;
    Ok(list.items)
}
