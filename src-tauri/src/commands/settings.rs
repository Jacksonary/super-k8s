use crate::AppState;
use serde_json::{json, Value};
use tauri::State;

#[tauri::command]
pub async fn get_app_config(state: State<'_, AppState>) -> Result<crate::types::AppConfig, String> {
    Ok(state.app_config.lock().clone())
}

#[tauri::command]
pub async fn save_app_config(
    state: State<'_, AppState>,
    config: crate::types::AppConfig,
) -> Result<Value, String> {
    crate::config::save_app_config(&config)?;
    *state.app_config.lock() = config;
    Ok(json!({ "ok": true }))
}
