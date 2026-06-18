use crate::commands::scope;
use crate::types::EventInfo;
use crate::AppState;
use k8s_openapi::api::core::v1::Event;
use tauri::State;

#[tauri::command]
pub async fn list_events(
    state: State<'_, AppState>,
    cluster_id: String,
    namespace: Option<String>,
) -> Result<Vec<EventInfo>, String> {
    let client = state.pool.get_or_create(&cluster_id).await?;
    let items = scope::list_scoped::<Event>(&client, &cluster_id, &namespace).await?;

    let mut out = Vec::with_capacity(items.len());
    for ev in items {
        let ns = ev.metadata.namespace.clone().unwrap_or_default();
        let event_type = ev.type_.clone().unwrap_or_default();
        let reason = ev.reason.clone().unwrap_or_default();
        let message = ev.message.clone().unwrap_or_default();
        let count = ev.count.unwrap_or(0);

        let kind = ev.involved_object.kind.clone().unwrap_or_default();
        let obj_name = ev.involved_object.name.clone().unwrap_or_default();
        let object = if kind.is_empty() {
            obj_name
        } else {
            format!("{kind}/{obj_name}")
        };

        let last_seen_ms = ev
            .last_timestamp
            .as_ref()
            .map(|t| t.0.as_millisecond())
            .or_else(|| ev.event_time.as_ref().map(|t| t.0.as_millisecond()))
            .or_else(|| {
                ev.metadata
                    .creation_timestamp
                    .as_ref()
                    .map(|t| t.0.as_millisecond())
            })
            .unwrap_or(0);

        out.push(EventInfo {
            namespace: ns,
            event_type,
            reason,
            object,
            message,
            count,
            last_seen_ms,
        });
    }

    out.sort_by(|a, b| b.last_seen_ms.cmp(&a.last_seen_ms));
    Ok(out)
}
