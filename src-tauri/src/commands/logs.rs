use std::collections::HashMap;

use futures::{AsyncBufReadExt, StreamExt};
use k8s_openapi::api::core::v1::Pod;
use kube::api::LogParams;
use kube::Api;
use parking_lot::Mutex;
use serde::Serialize;
use tauri::ipc::Channel;
use tauri::State;

use crate::AppState;

pub struct LogSession {
    pub abort: tokio::task::AbortHandle,
}

#[derive(Default)]
pub struct LogSessions(pub Mutex<HashMap<String, LogSession>>);

#[derive(Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum LogEvent {
    Line { data: String },
    Done,
    Error { message: String },
}

#[tauri::command]
pub async fn log_stream_start(
    state: State<'_, AppState>,
    sessions: State<'_, LogSessions>,
    cluster_id: String,
    namespace: String,
    pod: String,
    container: Option<String>,
    tail_lines: Option<i64>,
    follow: bool,
    session_id: String,
    channel: Channel<LogEvent>,
) -> Result<(), String> {
    let client = state.pool.get_or_create(&cluster_id).await?;
    let pods: Api<Pod> = Api::namespaced(client, &namespace);

    let params = LogParams {
        follow,
        tail_lines,
        container,
        ..Default::default()
    };

    // log_stream() 返回 impl futures::AsyncBufRead，直接用 futures::AsyncBufReadExt::lines()
    let stream = pods
        .log_stream(&pod, &params)
        .await
        .map_err(|e| crate::errors::kube_error("log_stream", e))?;

    let handle = tokio::spawn(async move {
        let mut lines = stream.lines();
        loop {
            match lines.next().await {
                Some(Ok(line)) => {
                    let _ = channel.send(LogEvent::Line { data: line });
                }
                None => {
                    let _ = channel.send(LogEvent::Done);
                    break;
                }
                Some(Err(e)) => {
                    let _ = channel.send(LogEvent::Error {
                        message: e.to_string(),
                    });
                    break;
                }
            }
        }
    });

    sessions
        .0
        .lock()
        .insert(session_id, LogSession { abort: handle.abort_handle() });

    Ok(())
}

#[tauri::command]
pub async fn log_stream_stop(
    sessions: State<'_, LogSessions>,
    session_id: String,
) -> Result<(), String> {
    if let Some(sess) = sessions.0.lock().remove(&session_id) {
        sess.abort.abort();
    }
    Ok(())
}
