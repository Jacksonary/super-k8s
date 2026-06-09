use crate::types::AppConfig;
use std::fs;
use std::path::PathBuf;

const APP_DIR: &str = "super-k8s";
const MANAGED_KUBECONFIG_FILE: &str = "kubeconfig.yaml";
const APP_CONFIG_FILE: &str = "app.yaml";

const EMPTY_KUBECONFIG: &str = "apiVersion: v1\nkind: Config\nclusters: []\nusers: []\ncontexts: []\n";

pub fn config_dir() -> Result<PathBuf, String> {
    let base = dirs::config_dir()
        .ok_or_else(|| "[CONFIG] cannot resolve user config directory".to_string())?;
    let dir = base.join(APP_DIR);
    if !dir.exists() {
        fs::create_dir_all(&dir)
            .map_err(|e| format!("[CONFIG] failed to create config dir: {e}"))?;
    }
    Ok(dir)
}

pub fn managed_kubeconfig_path() -> Result<PathBuf, String> {
    Ok(config_dir()?.join(MANAGED_KUBECONFIG_FILE))
}

fn app_config_path() -> Result<PathBuf, String> {
    Ok(config_dir()?.join(APP_CONFIG_FILE))
}

pub fn default_kubeconfig_path() -> Result<PathBuf, String> {
    let home =
        dirs::home_dir().ok_or_else(|| "[CONFIG] cannot resolve home directory".to_string())?;
    Ok(home.join(".kube").join("config"))
}

/// If the managed kubeconfig file does not exist, seed it from ~/.kube/config.
/// If that is also missing, write an empty kubeconfig skeleton.
pub fn ensure_seeded_from_default() -> Result<(), String> {
    let path = managed_kubeconfig_path()?;
    if path.exists() {
        return Ok(());
    }
    let default_path = default_kubeconfig_path()?;
    let seed = if default_path.exists() {
        fs::read_to_string(&default_path).map_err(|e| {
            format!(
                "[CONFIG] failed to read default kubeconfig {}: {e}",
                default_path.display()
            )
        })?
    } else {
        EMPTY_KUBECONFIG.to_string()
    };
    let seed = if seed.trim().is_empty() {
        EMPTY_KUBECONFIG.to_string()
    } else {
        seed
    };
    save_managed_yaml(&seed)
}

pub fn load_managed_yaml() -> Result<String, String> {
    let path = managed_kubeconfig_path()?;
    if !path.exists() {
        return Ok(EMPTY_KUBECONFIG.to_string());
    }
    let raw = fs::read_to_string(&path)
        .map_err(|e| format!("[CONFIG] failed to read {}: {e}", path.display()))?;
    if raw.trim().is_empty() {
        return Ok(EMPTY_KUBECONFIG.to_string());
    }
    Ok(raw)
}

pub fn save_managed_yaml(yaml: &str) -> Result<(), String> {
    let path = managed_kubeconfig_path()?;
    let tmp = path.with_extension("yaml.tmp");
    fs::write(&tmp, yaml)
        .map_err(|e| format!("[CONFIG] failed to write tmp {}: {e}", tmp.display()))?;
    fs::rename(&tmp, &path)
        .map_err(|e| format!("[CONFIG] failed to rename tmp -> kubeconfig.yaml: {e}"))?;
    Ok(())
}

pub fn load_app_config() -> Result<AppConfig, String> {
    let path = app_config_path()?;
    if !path.exists() {
        return Ok(AppConfig::default());
    }
    let raw = fs::read_to_string(&path)
        .map_err(|e| format!("[CONFIG] failed to read {}: {e}", path.display()))?;
    if raw.trim().is_empty() {
        return Ok(AppConfig::default());
    }
    serde_yaml::from_str::<AppConfig>(&raw)
        .map_err(|e| format!("[CONFIG] failed to parse app.yaml: {e}"))
}

pub fn save_app_config(config: &AppConfig) -> Result<(), String> {
    let path = app_config_path()?;
    let raw = serde_yaml::to_string(config)
        .map_err(|e| format!("[CONFIG] failed to serialize app config: {e}"))?;
    let tmp = path.with_extension("yaml.tmp");
    fs::write(&tmp, &raw)
        .map_err(|e| format!("[CONFIG] failed to write tmp {}: {e}", tmp.display()))?;
    fs::rename(&tmp, &path)
        .map_err(|e| format!("[CONFIG] failed to rename tmp -> app.yaml: {e}"))?;
    Ok(())
}
