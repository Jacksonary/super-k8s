use crate::commands::pods::map_pod;
use crate::commands::scope;
use crate::types::{ConfigMapInfo, DeploymentInfo, EndpointInfo, PodInfo, ServiceInfo};
use crate::AppState;
use k8s_openapi::api::apps::v1::Deployment;
use k8s_openapi::api::core::v1::{ConfigMap, Endpoints, Pod, Service};
use kube::api::{ListParams, Patch, PatchParams};
use kube::Api;
use serde_json::{json, Value};
use tauri::State;

#[tauri::command]
pub async fn list_deployments(
    state: State<'_, AppState>,
    cluster_id: String,
    namespace: Option<String>,
) -> Result<Vec<DeploymentInfo>, String> {
    let client = state.pool.get_or_create(&cluster_id).await?;
    let items = scope::list_scoped::<Deployment>(&client, &cluster_id, &namespace).await?;

    let mut out = Vec::with_capacity(items.len());
    for dep in items {
        let name = dep.metadata.name.clone().unwrap_or_default();
        let ns = dep.metadata.namespace.clone().unwrap_or_default();
        let age_ms = dep
            .metadata
            .creation_timestamp
            .as_ref()
            .map(|t| t.0.as_millisecond())
            .unwrap_or(0);

        let desired = dep.spec.as_ref().and_then(|s| s.replicas).unwrap_or(0);
        let status = dep.status.as_ref();
        let ready_replicas = status.and_then(|s| s.ready_replicas).unwrap_or(0);
        let available = status.and_then(|s| s.available_replicas).unwrap_or(0);
        let updated = status.and_then(|s| s.updated_replicas).unwrap_or(0);

        out.push(DeploymentInfo {
            name,
            namespace: ns,
            ready: format!("{ready_replicas}/{desired}"),
            replicas: desired,
            available,
            updated,
            age_ms,
        });
    }

    Ok(out)
}

#[tauri::command]
pub async fn scale_deployment(
    state: State<'_, AppState>,
    cluster_id: String,
    namespace: String,
    name: String,
    replicas: i32,
) -> Result<Value, String> {
    let client = state.pool.get_or_create(&cluster_id).await?;
    let api: Api<Deployment> = Api::namespaced(client.clone(), &namespace);
    let patch = json!({ "spec": { "replicas": replicas } });
    api.patch(&name, &PatchParams::default(), &Patch::Merge(&patch))
        .await
        .map_err(|e| crate::errors::kube_error("workload operation", e))?;
    Ok(json!({ "ok": true }))
}

#[tauri::command]
pub async fn restart_deployment(
    state: State<'_, AppState>,
    cluster_id: String,
    namespace: String,
    name: String,
) -> Result<Value, String> {
    let client = state.pool.get_or_create(&cluster_id).await?;
    let api: Api<Deployment> = Api::namespaced(client.clone(), &namespace);
    let now = chrono::Utc::now().to_rfc3339();
    let patch = json!({
        "spec": {
            "template": {
                "metadata": {
                    "annotations": {
                        "kubectl.kubernetes.io/restartedAt": now
                    }
                }
            }
        }
    });
    api.patch(&name, &PatchParams::default(), &Patch::Merge(&patch))
        .await
        .map_err(|e| crate::errors::kube_error("workload operation", e))?;
    Ok(json!({ "ok": true }))
}

#[tauri::command]
pub async fn list_services(
    state: State<'_, AppState>,
    cluster_id: String,
    namespace: Option<String>,
) -> Result<Vec<ServiceInfo>, String> {
    let client = state.pool.get_or_create(&cluster_id).await?;
    let items = scope::list_scoped::<Service>(&client, &cluster_id, &namespace).await?;

    let mut out = Vec::with_capacity(items.len());
    for svc in items {
        let name = svc.metadata.name.clone().unwrap_or_default();
        let ns = svc.metadata.namespace.clone().unwrap_or_default();
        let age_ms = svc
            .metadata
            .creation_timestamp
            .as_ref()
            .map(|t| t.0.as_millisecond())
            .unwrap_or(0);

        let spec = svc.spec.as_ref();
        let svc_type = spec
            .and_then(|s| s.type_.clone())
            .unwrap_or_else(|| "ClusterIP".to_string());
        let cluster_ip = spec.and_then(|s| s.cluster_ip.clone()).unwrap_or_default();

        let ports: Vec<String> = spec
            .and_then(|s| s.ports.as_ref())
            .map(|ports| {
                ports
                    .iter()
                    .map(|p| {
                        let proto = p.protocol.clone().unwrap_or_else(|| "TCP".to_string());
                        match &p.target_port {
                            Some(tp) => {
                                let tp_str = match tp {
                                    k8s_openapi::apimachinery::pkg::util::intstr::IntOrString::Int(i) => i.to_string(),
                                    k8s_openapi::apimachinery::pkg::util::intstr::IntOrString::String(s) => s.clone(),
                                };
                                format!("{}:{}/{}", p.port, tp_str, proto)
                            }
                            None => format!("{}/{}", p.port, proto),
                        }
                    })
                    .collect()
            })
            .unwrap_or_default();

        let external_ip = svc
            .status
            .as_ref()
            .and_then(|s| s.load_balancer.as_ref())
            .and_then(|lb| lb.ingress.as_ref())
            .map(|ingress| {
                ingress
                    .iter()
                    .filter_map(|i| i.ip.clone().or_else(|| i.hostname.clone()))
                    .collect::<Vec<_>>()
                    .join(", ")
            })
            .filter(|s| !s.is_empty());

        out.push(ServiceInfo {
            name,
            namespace: ns,
            svc_type,
            cluster_ip,
            external_ip,
            ports,
            age_ms,
        });
    }

    Ok(out)
}

#[tauri::command]
pub async fn list_configmaps(
    state: State<'_, AppState>,
    cluster_id: String,
    namespace: Option<String>,
) -> Result<Vec<ConfigMapInfo>, String> {
    let client = state.pool.get_or_create(&cluster_id).await?;
    let items = scope::list_scoped::<ConfigMap>(&client, &cluster_id, &namespace).await?;

    let mut out = Vec::with_capacity(items.len());
    for cm in items {
        let name = cm.metadata.name.clone().unwrap_or_default();
        let ns = cm.metadata.namespace.clone().unwrap_or_default();
        let age_ms = cm
            .metadata
            .creation_timestamp
            .as_ref()
            .map(|t| t.0.as_millisecond())
            .unwrap_or(0);
        let data_keys: Vec<String> = cm
            .data
            .as_ref()
            .map(|d| d.keys().cloned().collect())
            .unwrap_or_default();

        out.push(ConfigMapInfo {
            name,
            namespace: ns,
            data_keys,
            age_ms,
        });
    }

    Ok(out)
}

/// List the pods managed by a deployment, via its spec.selector.matchLabels.
#[tauri::command]
pub async fn list_deployment_pods(
    state: State<'_, AppState>,
    cluster_id: String,
    namespace: String,
    name: String,
) -> Result<Vec<PodInfo>, String> {
    let client = state.pool.get_or_create(&cluster_id).await?;
    let dep_api: Api<Deployment> = Api::namespaced(client.clone(), &namespace);
    let dep = dep_api
        .get(&name)
        .await
        .map_err(|e| crate::errors::kube_error("workload operation", e))?;

    let match_labels = dep
        .spec
        .as_ref()
        .and_then(|s| s.selector.match_labels.as_ref());

    let selector = match match_labels {
        Some(labels) if !labels.is_empty() => labels
            .iter()
            .map(|(k, v)| format!("{k}={v}"))
            .collect::<Vec<_>>()
            .join(","),
        // No selector -> the deployment owns no pods we can resolve by label.
        _ => return Ok(Vec::new()),
    };

    let pod_api: Api<Pod> = Api::namespaced(client.clone(), &namespace);
    let lp = ListParams::default().labels(&selector);
    let list = pod_api
        .list(&lp)
        .await
        .map_err(|e| crate::errors::kube_error("workload operation", e))?;
    Ok(list.items.iter().map(map_pod).collect())
}

/// Flatten a Service's Endpoints into a list of backing addresses.
#[tauri::command]
pub async fn list_service_endpoints(
    state: State<'_, AppState>,
    cluster_id: String,
    namespace: String,
    name: String,
) -> Result<Vec<EndpointInfo>, String> {
    let client = state.pool.get_or_create(&cluster_id).await?;
    let api: Api<Endpoints> = Api::namespaced(client.clone(), &namespace);

    let endpoints = match api.get(&name).await {
        Ok(ep) => ep,
        // No Endpoints object yet (e.g. service has no ready backends) -> empty.
        Err(kube::Error::Api(e)) if e.code == 404 => return Ok(Vec::new()),
        Err(e) => return Err(crate::errors::kube_error("workload operation", e)),
    };

    let mut out = Vec::new();
    let subsets = match endpoints.subsets {
        Some(s) => s,
        None => return Ok(out),
    };

    for subset in subsets {
        let ports: Vec<String> = subset
            .ports
            .as_ref()
            .map(|ports| {
                ports
                    .iter()
                    .map(|p| {
                        let proto = p.protocol.clone().unwrap_or_else(|| "TCP".to_string());
                        match &p.name {
                            Some(n) if !n.is_empty() => format!("{}:{}/{}", n, p.port, proto),
                            _ => format!("{}/{}", p.port, proto),
                        }
                    })
                    .collect()
            })
            .unwrap_or_default();

        // addresses = ready, notReadyAddresses = not ready.
        let groups = [
            (subset.addresses, true),
            (subset.not_ready_addresses, false),
        ];
        for (addrs, ready) in groups {
            if let Some(addrs) = addrs {
                for addr in addrs {
                    let target_ref = addr.target_ref.as_ref().map(|r| {
                        let kind = r.kind.clone().unwrap_or_default();
                        let n = r.name.clone().unwrap_or_default();
                        format!("{kind}/{n}")
                    });
                    out.push(EndpointInfo {
                        ip: addr.ip.clone(),
                        node_name: addr.node_name.clone(),
                        target_ref,
                        ports: ports.clone(),
                        ready,
                    });
                }
            }
        }
    }

    Ok(out)
}

#[tauri::command]
pub async fn list_secrets(
    state: State<'_, AppState>,
    cluster_id: String,
    namespace: Option<String>,
) -> Result<Vec<serde_json::Value>, String> {
    use k8s_openapi::api::core::v1::Secret;
    let client = state.pool.get_or_create(&cluster_id).await?;
    let secrets: kube::Api<Secret> = match &namespace {
        Some(ns) if !ns.is_empty() => kube::Api::namespaced(client, ns),
        _ => kube::Api::all(client),
    };
    let list = secrets
        .list(&Default::default())
        .await
        .map_err(|e| crate::errors::kube_error("list secrets", e))?;

    let now_ms = chrono::Utc::now().timestamp_millis();

    let result: Vec<serde_json::Value> = list
        .items
        .into_iter()
        .map(|s| {
            let meta = s.metadata;
            let created_ms = meta
                .creation_timestamp
                .as_ref()
                .map(|t| t.0.as_millisecond())
                .unwrap_or(now_ms);
            let age_ms = now_ms - created_ms;
            let data_keys: Vec<String> = s
                .data
                .as_ref()
                .map(|d| d.keys().cloned().collect())
                .unwrap_or_default();
            let string_data_keys: Vec<String> = s
                .string_data
                .as_ref()
                .map(|d| d.keys().cloned().collect())
                .unwrap_or_default();
            let mut all_keys = data_keys;
            all_keys.extend(string_data_keys);
            all_keys.sort();
            all_keys.dedup();
            serde_json::json!({
                "name": meta.name.unwrap_or_default(),
                "namespace": meta.namespace.unwrap_or_default(),
                "secret_type": s.type_.unwrap_or_else(|| "Opaque".to_string()),
                "data_keys": all_keys,
                "age_ms": age_ms,
            })
        })
        .collect();
    Ok(result)
}

#[tauri::command]
pub async fn get_secret_values(
    state: State<'_, AppState>,
    cluster_id: String,
    namespace: String,
    name: String,
) -> Result<std::collections::HashMap<String, String>, String> {
    use k8s_openapi::api::core::v1::Secret;
    let client = state.pool.get_or_create(&cluster_id).await?;
    let secrets: kube::Api<Secret> = kube::Api::namespaced(client, &namespace);
    let secret = secrets
        .get(&name)
        .await
        .map_err(|e| crate::errors::kube_error("get secret", e))?;

    let mut result = std::collections::HashMap::new();
    if let Some(data) = secret.data {
        for (k, v) in data {
            result.insert(k, String::from_utf8_lossy(&v.0).into_owned());
        }
    }
    if let Some(string_data) = secret.string_data {
        for (k, v) in string_data {
            result.insert(k, v);
        }
    }
    Ok(result)
}

#[tauri::command]
pub async fn list_cronjobs(
    state: State<'_, AppState>,
    cluster_id: String,
    namespace: Option<String>,
) -> Result<Vec<serde_json::Value>, String> {
    use k8s_openapi::api::batch::v1::CronJob;
    let client = state.pool.get_or_create(&cluster_id).await?;
    let cronjobs: kube::Api<CronJob> = match &namespace {
        Some(ns) if !ns.is_empty() => kube::Api::namespaced(client, ns),
        _ => kube::Api::all(client),
    };
    let list = cronjobs
        .list(&Default::default())
        .await
        .map_err(|e| crate::errors::kube_error("list cronjobs", e))?;

    let now_ms = chrono::Utc::now().timestamp_millis();

    let result: Vec<serde_json::Value> = list
        .items
        .into_iter()
        .map(|cj| {
            let meta = cj.metadata;
            let spec = cj.spec.unwrap_or_default();
            let status = cj.status.unwrap_or_default();
            let created_ms = meta
                .creation_timestamp
                .as_ref()
                .map(|t| t.0.as_millisecond())
                .unwrap_or(now_ms);
            let age_ms = now_ms - created_ms;
            let active_count = status.active.as_ref().map(|a| a.len()).unwrap_or(0);
            let last_schedule_ms: Option<i64> = status
                .last_schedule_time
                .as_ref()
                .map(|t| t.0.as_millisecond());
            serde_json::json!({
                "name": meta.name.unwrap_or_default(),
                "namespace": meta.namespace.unwrap_or_default(),
                "schedule": spec.schedule,
                "active": active_count,
                "last_schedule_ms": last_schedule_ms,
                "age_ms": age_ms,
            })
        })
        .collect();
    Ok(result)
}

#[tauri::command]
pub async fn update_deployment_labels(
    state: State<'_, AppState>,
    cluster_id: String,
    namespace: String,
    name: String,
    labels: std::collections::HashMap<String, String>,
) -> Result<(), String> {
    let client = state.pool.get_or_create(&cluster_id).await?;
    let deployments: Api<Deployment> = Api::namespaced(client, &namespace);
    let patch = json!({ "metadata": { "labels": labels } });
    deployments
        .patch(&name, &PatchParams::default(), &Patch::Merge(&patch))
        .await
        .map_err(|e| crate::errors::kube_error("update deployment labels", e))?;
    Ok(())
}

#[tauri::command]
pub async fn update_deployment_image(
    state: State<'_, AppState>,
    cluster_id: String,
    namespace: String,
    name: String,
    container_name: String,
    image: String,
) -> Result<(), String> {
    let client = state.pool.get_or_create(&cluster_id).await?;
    let deployments: Api<Deployment> = Api::namespaced(client, &namespace);
    let patch = json!({
        "spec": {
            "template": {
                "spec": {
                    "containers": [{ "name": container_name, "image": image }]
                }
            }
        }
    });
    deployments
        .patch(&name, &PatchParams::default(), &Patch::Merge(&patch))
        .await
        .map_err(|e| crate::errors::kube_error("update deployment image", e))?;
    Ok(())
}

#[tauri::command]
pub async fn update_deployment_strategy(
    state: State<'_, AppState>,
    cluster_id: String,
    namespace: String,
    name: String,
    strategy_type: String,
    max_surge: Option<String>,
    max_unavailable: Option<String>,
) -> Result<(), String> {
    let client = state.pool.get_or_create(&cluster_id).await?;
    let deployments: Api<Deployment> = Api::namespaced(client, &namespace);
    let patch = if strategy_type == "RollingUpdate" {
        json!({
            "spec": {
                "strategy": {
                    "type": strategy_type,
                    "rollingUpdate": {
                        "maxSurge": max_surge.unwrap_or_else(|| "25%".to_string()),
                        "maxUnavailable": max_unavailable.unwrap_or_else(|| "25%".to_string()),
                    }
                }
            }
        })
    } else {
        json!({
            "spec": {
                "strategy": {
                    "type": strategy_type,
                    "rollingUpdate": null
                }
            }
        })
    };
    deployments
        .patch(&name, &PatchParams::default(), &Patch::Merge(&patch))
        .await
        .map_err(|e| crate::errors::kube_error("update deployment strategy", e))?;
    Ok(())
}

#[tauri::command]
pub async fn list_ingresses(
    state: State<'_, AppState>,
    cluster_id: String,
    namespace: Option<String>,
) -> Result<Vec<serde_json::Value>, String> {
    use k8s_openapi::api::networking::v1::Ingress;
    let client = state.pool.get_or_create(&cluster_id).await?;
    let ingresses: kube::Api<Ingress> = match &namespace {
        Some(ns) if !ns.is_empty() => kube::Api::namespaced(client, ns),
        _ => kube::Api::all(client),
    };
    let list = ingresses
        .list(&Default::default())
        .await
        .map_err(|e| crate::errors::kube_error("list ingresses", e))?;

    let now_ms = chrono::Utc::now().timestamp_millis();

    let result: Vec<serde_json::Value> = list
        .items
        .into_iter()
        .map(|ing| {
            let meta = ing.metadata;
            let spec = ing.spec.unwrap_or_default();
            let created_ms = meta
                .creation_timestamp
                .as_ref()
                .map(|t| t.0.as_millisecond())
                .unwrap_or(now_ms);
            let age_ms = now_ms - created_ms;

            let ingress_class = spec.ingress_class_name.clone();
            let hosts: Vec<String> = spec
                .rules
                .as_ref()
                .unwrap_or(&vec![])
                .iter()
                .filter_map(|r| r.host.clone())
                .collect();
            let rules_count = spec.rules.as_ref().map(|r| r.len()).unwrap_or(0);

            serde_json::json!({
                "name": meta.name.unwrap_or_default(),
                "namespace": meta.namespace.unwrap_or_default(),
                "ingress_class": ingress_class,
                "hosts": hosts,
                "rules_count": rules_count,
                "age_ms": age_ms,
            })
        })
        .collect();

    Ok(result)
}

#[tauri::command]
pub async fn update_ingress_metadata(
    state: State<'_, AppState>,
    cluster_id: String,
    namespace: String,
    name: String,
    labels: std::collections::HashMap<String, String>,
    annotations: std::collections::HashMap<String, String>,
) -> Result<(), String> {
    use k8s_openapi::api::networking::v1::Ingress;
    use kube::api::{Patch, PatchParams};
    let client = state.pool.get_or_create(&cluster_id).await?;
    let ingresses: kube::Api<Ingress> = kube::Api::namespaced(client, &namespace);
    let patch = serde_json::json!({
        "metadata": { "labels": labels, "annotations": annotations }
    });
    ingresses
        .patch(&name, &PatchParams::default(), &Patch::Merge(patch))
        .await
        .map_err(|e| crate::errors::kube_error("update ingress metadata", e))?;
    Ok(())
}

#[tauri::command]
pub async fn update_ingress_rules(
    state: State<'_, AppState>,
    cluster_id: String,
    namespace: String,
    name: String,
    rules: serde_json::Value,
) -> Result<(), String> {
    use k8s_openapi::api::networking::v1::Ingress;
    use kube::api::{Patch, PatchParams};
    let client = state.pool.get_or_create(&cluster_id).await?;
    let ingresses: kube::Api<Ingress> = kube::Api::namespaced(client, &namespace);
    let patch = serde_json::json!({ "spec": { "rules": rules } });
    ingresses
        .patch(&name, &PatchParams::default(), &Patch::Merge(patch))
        .await
        .map_err(|e| crate::errors::kube_error("update ingress rules", e))?;
    Ok(())
}

#[tauri::command]
pub async fn update_configmap_data(
    state: State<'_, AppState>,
    cluster_id: String,
    namespace: String,
    name: String,
    data: std::collections::HashMap<String, String>,
) -> Result<(), String> {
    use k8s_openapi::api::core::v1::ConfigMap;
    use kube::api::{Patch, PatchParams};
    let client = state.pool.get_or_create(&cluster_id).await?;
    let configmaps: kube::Api<ConfigMap> = kube::Api::namespaced(client, &namespace);
    let patch = serde_json::json!({ "data": data });
    configmaps
        .patch(&name, &PatchParams::default(), &Patch::Merge(patch))
        .await
        .map_err(|e| crate::errors::kube_error("update configmap data", e))?;
    Ok(())
}

#[tauri::command]
pub async fn update_secret_data(
    state: State<'_, AppState>,
    cluster_id: String,
    namespace: String,
    name: String,
    data: std::collections::HashMap<String, String>,
) -> Result<(), String> {
    use k8s_openapi::api::core::v1::Secret;
    use kube::api::{Patch, PatchParams};
    let client = state.pool.get_or_create(&cluster_id).await?;
    let secrets: kube::Api<Secret> = kube::Api::namespaced(client, &namespace);
    // Use stringData so Kubernetes handles base64 encoding automatically
    let patch = serde_json::json!({ "stringData": data });
    secrets
        .patch(&name, &PatchParams::default(), &Patch::Merge(patch))
        .await
        .map_err(|e| crate::errors::kube_error("update secret data", e))?;
    Ok(())
}

#[tauri::command]
pub async fn update_cronjob_spec(
    state: State<'_, AppState>,
    cluster_id: String,
    namespace: String,
    name: String,
    schedule: String,
    suspend: bool,
    concurrency_policy: String,
    successful_jobs_history_limit: i32,
    failed_jobs_history_limit: i32,
) -> Result<(), String> {
    use k8s_openapi::api::batch::v1::CronJob;
    use kube::api::{Patch, PatchParams};
    let client = state.pool.get_or_create(&cluster_id).await?;
    let cronjobs: kube::Api<CronJob> = kube::Api::namespaced(client, &namespace);
    let patch = serde_json::json!({
        "spec": {
            "schedule": schedule,
            "suspend": suspend,
            "concurrencyPolicy": concurrency_policy,
            "successfulJobsHistoryLimit": successful_jobs_history_limit,
            "failedJobsHistoryLimit": failed_jobs_history_limit,
        }
    });
    cronjobs
        .patch(&name, &PatchParams::default(), &Patch::Merge(patch))
        .await
        .map_err(|e| crate::errors::kube_error("update cronjob spec", e))?;
    Ok(())
}

#[tauri::command]
pub async fn update_cronjob_metadata(
    state: State<'_, AppState>,
    cluster_id: String,
    namespace: String,
    name: String,
    labels: std::collections::HashMap<String, String>,
    annotations: std::collections::HashMap<String, String>,
) -> Result<(), String> {
    use k8s_openapi::api::batch::v1::CronJob;
    use kube::api::{Patch, PatchParams};
    let client = state.pool.get_or_create(&cluster_id).await?;
    let cronjobs: kube::Api<CronJob> = kube::Api::namespaced(client, &namespace);
    let patch = serde_json::json!({
        "metadata": { "labels": labels, "annotations": annotations }
    });
    cronjobs
        .patch(&name, &PatchParams::default(), &Patch::Merge(patch))
        .await
        .map_err(|e| crate::errors::kube_error("update cronjob metadata", e))?;
    Ok(())
}

#[tauri::command]
pub async fn list_jobs(
    state: State<'_, AppState>,
    cluster_id: String,
    namespace: Option<String>,
) -> Result<Vec<serde_json::Value>, String> {
    use k8s_openapi::api::batch::v1::Job;
    let client = state.pool.get_or_create(&cluster_id).await?;
    let jobs: kube::Api<Job> = match &namespace {
        Some(ns) if !ns.is_empty() => kube::Api::namespaced(client, ns),
        _ => kube::Api::all(client),
    };
    let list = jobs.list(&Default::default()).await
        .map_err(|e| crate::errors::kube_error("list jobs", e))?;

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;

    let result: Vec<serde_json::Value> = list.items.into_iter().map(|job| {
        let meta = job.metadata;
        let spec = job.spec.unwrap_or_default();
        let status = job.status.unwrap_or_default();

        let created_ms = meta.creation_timestamp
            .as_ref()
            .and_then(|t| t.0.as_millisecond().try_into().ok())
            .unwrap_or(now);
        let age_ms = now - created_ms as i64;

        let completions = spec.completions;
        let succeeded = status.succeeded.unwrap_or(0);
        let failed = status.failed.unwrap_or(0);
        let active = status.active.unwrap_or(0);

        // A job is complete when conditions contain "Complete" = True
        let complete = status.conditions.as_ref()
            .map(|cs| cs.iter().any(|c| c.type_ == "Complete" && c.status == "True"))
            .unwrap_or(false);

        serde_json::json!({
            "name": meta.name.unwrap_or_default(),
            "namespace": meta.namespace.unwrap_or_default(),
            "completions": completions,
            "succeeded": succeeded,
            "failed": failed,
            "active": active,
            "complete": complete,
            "age_ms": age_ms,
        })
    }).collect();

    Ok(result)
}
