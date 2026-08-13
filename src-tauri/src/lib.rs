pub mod cluster_pool;
pub mod commands;
pub mod config;
pub mod errors;
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
        .manage(commands::exec::ExecSessions::default())
        .manage(commands::logs::LogSessions::default())
        .manage(commands::download::DownloadSessions::default())
        .invoke_handler(tauri::generate_handler![
            commands::clusters::list_clusters,
            commands::clusters::import_kubeconfig,
            commands::clusters::delete_cluster,
            commands::clusters::reorder_clusters,
            commands::clusters::reload_default_kubeconfig,
            commands::clusters::test_connection,
            commands::clusters::get_cluster_summary,
            commands::clusters::ping_cluster,
            commands::overview::get_overview,
            commands::nodes::list_nodes,
            commands::nodes::cordon_node,
            commands::nodes::list_node_pods,
            commands::namespaces::list_namespaces,
            commands::namespaces::set_namespace_override,
            commands::namespaces::update_namespace_metadata,
            commands::pods::list_pods,
            commands::pods::get_pod_logs,
            commands::pods::delete_pod,
            commands::workloads::list_deployments,
            commands::workloads::scale_deployment,
            commands::workloads::restart_deployment,
            commands::workloads::list_services,
            commands::workloads::list_configmaps,
            commands::workloads::list_deployment_pods,
            commands::workloads::list_service_endpoints,
            commands::workloads::list_secrets,
            commands::workloads::get_secret_values,
            commands::workloads::list_cronjobs,
            commands::workloads::update_deployment_labels,
            commands::workloads::update_deployment_image,
            commands::workloads::update_deployment_strategy,
            commands::workloads::list_ingresses,
            commands::workloads::update_ingress_metadata,
            commands::workloads::update_ingress_rules,
            commands::workloads::update_configmap_data,
            commands::workloads::update_secret_data,
            commands::workloads::update_cronjob_spec,
            commands::workloads::update_cronjob_metadata,
            commands::workloads::list_jobs,
            commands::events::list_events,
            commands::settings::get_app_config,
            commands::settings::save_app_config,
            commands::yaml::get_resource_yaml,
            commands::yaml::apply_resource_yaml,
            commands::yaml::get_resource_json,
            commands::yaml::delete_resource,
            commands::exec::exec_start,
            commands::exec::exec_write,
            commands::exec::exec_resize,
            commands::exec::exec_stop,
            commands::logs::log_stream_start,
            commands::logs::log_stream_stop,
            commands::download::file_download_start,
            commands::download::file_download_stop,
            commands::download::list_pod_files,
            commands::metadata::update_resource_metadata,
            commands::update::check_update,
        ])
        .run(context)
        .expect("error while running tauri application");
}
