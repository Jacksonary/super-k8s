use kube::config::{KubeConfigOptions, Kubeconfig};

/// Build a `kube::Client` for the given context name out of the managed kubeconfig YAML.
pub async fn build_client(managed_yaml: &str, context_name: &str) -> Result<kube::Client, String> {
    let kc: Kubeconfig =
        Kubeconfig::from_yaml(managed_yaml).map_err(|e| crate::errors::kubeconfig_error(e))?;
    let opts = KubeConfigOptions {
        context: Some(context_name.to_string()),
        cluster: None,
        user: None,
    };
    let cfg = kube::Config::from_custom_kubeconfig(kc, &opts)
        .await
        .map_err(|e| crate::errors::kube_error("create client", e))?;
    let client =
        kube::Client::try_from(cfg).map_err(|e| crate::errors::kube_error("create client", e))?;
    Ok(client)
}
