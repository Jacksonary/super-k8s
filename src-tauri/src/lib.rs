pub mod cluster_pool;
pub mod commands;
pub mod config;
pub mod kube_client;
pub mod types;

use std::sync::Arc;

use crate::cluster_pool::ClusterPool;
use crate::types::AppConfig;

pub struct AppState {
    pub pool: Arc<ClusterPool>,
    pub app_config: parking_lot::Mutex<AppConfig>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let pool = Arc::new(ClusterPool::new());
    let app_config_init = config::load_app_config().unwrap_or_default();

    let mut builder = tauri::Builder::default();
    if !app_config_init.allow_multiple_instances {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            use tauri::Manager;
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }));
    }
    // 根据用户保存的 theme 动态调整 webview 启动背景色，避免 light 用户启动时
    // window 默认 dark 底闪一下再切 light（tauri.conf.json 是静态的）。
    let mut context = tauri::generate_context!();
    if app_config_init.theme == "light" {
        if let Some(win) = context.config_mut().app.windows.get_mut(0) {
            win.background_color = Some(tauri::utils::config::Color(245, 247, 250, 255));
        }
    }

    builder
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            pool,
            app_config: parking_lot::Mutex::new(app_config_init),
        })
        .invoke_handler(tauri::generate_handler![
            commands::clusters::list_clusters,
            commands::clusters::import_kubeconfig,
            commands::clusters::delete_cluster,
            commands::clusters::reload_default_kubeconfig,
            commands::clusters::test_connection,
            commands::clusters::get_cluster_summary,
            commands::clusters::ping_cluster,
            commands::overview::get_overview,
            commands::nodes::list_nodes,
            commands::namespaces::list_namespaces,
            commands::pods::list_pods,
            commands::pods::get_pod_logs,
            commands::pods::delete_pod,
            commands::workloads::list_deployments,
            commands::workloads::scale_deployment,
            commands::workloads::restart_deployment,
            commands::workloads::list_services,
            commands::workloads::list_configmaps,
            commands::events::list_events,
            commands::settings::get_app_config,
            commands::settings::save_app_config,
        ])
        .run(context)
        .expect("error while running tauri application");
}
