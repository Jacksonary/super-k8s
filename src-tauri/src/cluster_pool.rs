use std::collections::{HashMap, HashSet};

use kube::config::Kubeconfig;
use parking_lot::Mutex;
use serde_yaml::Value;

use crate::config;
use crate::kube_client;
use crate::types::ClusterConfig;

pub struct ClusterPool {
    cache: Mutex<HashMap<String, kube::Client>>,
}

impl ClusterPool {
    pub fn new() -> ClusterPool {
        // Best effort: seed the managed kubeconfig from ~/.kube/config on first run.
        let _ = config::ensure_seeded_from_default();
        ClusterPool {
            cache: Mutex::new(HashMap::new()),
        }
    }

    pub async fn get_or_create(&self, cluster_id: &str) -> Result<kube::Client, String> {
        if let Some(client) = self.cache.lock().get(cluster_id).cloned() {
            return Ok(client);
        }
        let yaml = config::load_managed_yaml()?;
        let client = kube_client::build_client(&yaml, cluster_id).await?;
        self.cache
            .lock()
            .insert(cluster_id.to_string(), client.clone());
        Ok(client)
    }

    pub fn invalidate(&self, cluster_id: &str) {
        self.cache.lock().remove(cluster_id);
    }

    pub fn list_clusters(&self) -> Result<Vec<ClusterConfig>, String> {
        let yaml = config::load_managed_yaml()?;
        let kc = Kubeconfig::from_yaml(&yaml).map_err(|e| crate::errors::kubeconfig_error(e))?;

        let server_by_cluster: HashMap<String, String> = kc
            .clusters
            .iter()
            .map(|c| {
                let server = c
                    .cluster
                    .as_ref()
                    .and_then(|cl| cl.server.clone())
                    .unwrap_or_default();
                (c.name.clone(), server)
            })
            .collect();

        let mut overrides = config::load_namespace_overrides().unwrap_or_default();

        let mut out = Vec::new();
        for ctx in &kc.contexts {
            let (cluster_ref, user, namespace) = match &ctx.context {
                Some(c) => (c.cluster.clone(), c.user.clone(), c.namespace.clone()),
                None => (String::new(), None, None),
            };
            let server = server_by_cluster
                .get(&cluster_ref)
                .cloned()
                .unwrap_or_default();
            let custom_namespaces = overrides.remove(&ctx.name).unwrap_or_default();
            out.push(ClusterConfig {
                id: ctx.name.clone(),
                name: ctx.name.clone(),
                server,
                namespace,
                user: user.unwrap_or_default(),
                source: "default".to_string(),
                custom_namespaces,
            });
        }
        Ok(out)
    }

    pub fn import_kubeconfig(&self, yaml: &str) -> Result<usize, String> {
        let (added, ids) = self.merge_yaml(yaml)?;
        for id in ids {
            self.invalidate(&id);
        }
        Ok(added)
    }

    pub fn delete_cluster(&self, cluster_id: &str) -> Result<(), String> {
        let managed_yaml = config::load_managed_yaml()?;
        let mut root: Value =
            serde_yaml::from_str(&managed_yaml).map_err(|e| crate::errors::kubeconfig_error(e))?;

        // Remove the context named cluster_id.
        remove_named(&mut root, "contexts", cluster_id);

        // Determine which clusters/users are still referenced by any remaining context.
        let mut used_clusters: HashSet<String> = HashSet::new();
        let mut used_users: HashSet<String> = HashSet::new();
        if let Some(contexts) = root.get("contexts").and_then(Value::as_sequence) {
            for ctx in contexts {
                if let Some(inner) = ctx.get("context") {
                    if let Some(c) = inner.get("cluster").and_then(Value::as_str) {
                        used_clusters.insert(c.to_string());
                    }
                    if let Some(u) = inner.get("user").and_then(Value::as_str) {
                        used_users.insert(u.to_string());
                    }
                }
            }
        }

        retain_named(&mut root, "clusters", &used_clusters);
        retain_named(&mut root, "users", &used_users);

        let serialized =
            serde_yaml::to_string(&root).map_err(|e| format!("Failed to save kubeconfig: {e}"))?;
        config::save_managed_yaml(&serialized)?;
        self.invalidate(cluster_id);
        Ok(())
    }

    pub fn reload_default(&self) -> Result<usize, String> {
        let default_path = config::default_kubeconfig_path()?;
        if !default_path.exists() {
            return Ok(0);
        }
        let incoming = std::fs::read_to_string(&default_path)
            .map_err(|e| format!("Failed to read default kubeconfig: {e}"))?;
        let (added, ids) = self.merge_yaml(&incoming)?;
        for id in ids {
            self.invalidate(&id);
        }
        Ok(added)
    }

    /// Merge an incoming kubeconfig YAML into the managed file. Dedup by `.name`;
    /// on clash the incoming entry overwrites. Returns (newly added contexts, all affected context ids).
    fn merge_yaml(&self, incoming_yaml: &str) -> Result<(usize, Vec<String>), String> {
        let managed_yaml = config::load_managed_yaml()?;
        let mut managed: Value =
            serde_yaml::from_str(&managed_yaml).map_err(|e| crate::errors::kubeconfig_error(e))?;
        let incoming: Value =
            serde_yaml::from_str(incoming_yaml).map_err(|e| crate::errors::kubeconfig_error(e))?;

        ensure_mapping(&mut managed)?;

        merge_section(&mut managed, &incoming, "clusters");
        merge_section(&mut managed, &incoming, "users");
        let (added, affected) = merge_contexts(&mut managed, &incoming);

        let serialized = serde_yaml::to_string(&managed)
            .map_err(|e| format!("Failed to save kubeconfig: {e}"))?;
        config::save_managed_yaml(&serialized)?;
        Ok((added, affected))
    }
}

impl Default for ClusterPool {
    fn default() -> Self {
        Self::new()
    }
}

fn ensure_mapping(root: &mut Value) -> Result<(), String> {
    if !root.is_mapping() {
        return Err("Invalid kubeconfig: root must be a YAML object".to_string());
    }
    let map = root.as_mapping_mut().unwrap();
    map.entry(Value::String("apiVersion".to_string()))
        .or_insert_with(|| Value::String("v1".to_string()));
    map.entry(Value::String("kind".to_string()))
        .or_insert_with(|| Value::String("Config".to_string()));
    for key in ["clusters", "users", "contexts"] {
        map.entry(Value::String(key.to_string()))
            .or_insert_with(|| Value::Sequence(Vec::new()));
    }
    Ok(())
}

fn entry_name(entry: &Value) -> Option<String> {
    entry
        .get("name")
        .and_then(Value::as_str)
        .map(|s| s.to_string())
}

/// Merge a plain (clusters/users) named-list section: incoming entries overwrite same-named ones.
fn merge_section(managed: &mut Value, incoming: &Value, key: &str) {
    let incoming_items: Vec<Value> = incoming
        .get(key)
        .and_then(Value::as_sequence)
        .cloned()
        .unwrap_or_default();
    if incoming_items.is_empty() {
        return;
    }
    let map = managed.as_mapping_mut().unwrap();
    let slot = map
        .entry(Value::String(key.to_string()))
        .or_insert_with(|| Value::Sequence(Vec::new()));
    let existing = match slot.as_sequence_mut() {
        Some(seq) => seq,
        None => {
            *slot = Value::Sequence(Vec::new());
            slot.as_sequence_mut().unwrap()
        }
    };
    for item in incoming_items {
        if let Some(name) = entry_name(&item) {
            existing.retain(|e| entry_name(e).as_deref() != Some(name.as_str()));
        }
        existing.push(item);
    }
}

/// Merge contexts; return (number of brand-new context names, all affected context names).
fn merge_contexts(managed: &mut Value, incoming: &Value) -> (usize, Vec<String>) {
    let incoming_items: Vec<Value> = incoming
        .get("contexts")
        .and_then(Value::as_sequence)
        .cloned()
        .unwrap_or_default();

    let map = managed.as_mapping_mut().unwrap();
    let slot = map
        .entry(Value::String("contexts".to_string()))
        .or_insert_with(|| Value::Sequence(Vec::new()));
    let existing = match slot.as_sequence_mut() {
        Some(seq) => seq,
        None => {
            *slot = Value::Sequence(Vec::new());
            slot.as_sequence_mut().unwrap()
        }
    };

    let existing_names: HashSet<String> = existing.iter().filter_map(entry_name).collect();

    let mut added = 0usize;
    let mut affected = Vec::new();
    for item in incoming_items {
        if let Some(name) = entry_name(&item) {
            if !existing_names.contains(&name) {
                added += 1;
            }
            existing.retain(|e| entry_name(e).as_deref() != Some(name.as_str()));
            affected.push(name);
        }
        existing.push(item);
    }
    (added, affected)
}

fn remove_named(root: &mut Value, key: &str, name: &str) {
    if let Some(seq) = root.get_mut(key).and_then(Value::as_sequence_mut) {
        seq.retain(|e| entry_name(e).as_deref() != Some(name));
    }
}

fn retain_named(root: &mut Value, key: &str, keep: &HashSet<String>) {
    if let Some(seq) = root.get_mut(key).and_then(Value::as_sequence_mut) {
        seq.retain(|e| match entry_name(e) {
            Some(n) => keep.contains(&n),
            None => false,
        });
    }
}
