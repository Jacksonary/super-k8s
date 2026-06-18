use std::collections::HashMap;
use std::sync::Arc;

use futures::SinkExt;
use k8s_openapi::api::core::v1::Pod;
use kube::api::{AttachParams, TerminalSize};
use kube::Api;
use parking_lot::Mutex;
use serde::Serialize;
use tauri::ipc::Channel;
use tauri::State;
use tokio::io::AsyncWriteExt;

use crate::AppState;

type StdinWriter = Box<dyn tokio::io::AsyncWrite + Unpin + Send>;

/// One interactive exec session. The stdin writer lives behind a tokio Mutex so
/// it can be awaited without holding the (non-Send) parking_lot guard of the map.
pub struct ExecSession {
    pub stdin: Arc<tokio::sync::Mutex<StdinWriter>>,
    pub resize: Option<futures::channel::mpsc::Sender<TerminalSize>>,
    pub abort: tokio::task::AbortHandle,
}

#[derive(Default)]
pub struct ExecSessions(pub Mutex<HashMap<String, ExecSession>>);

#[derive(Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ExecEvent {
    /// A chunk of stdout/stderr bytes, decoded lossily to a string for xterm.
    Data { data: String },
    /// The session ended (process exit / stream closed / error).
    Exit { message: Option<String> },
}

/// Start an interactive shell in a pod container. Output is streamed to the
/// frontend over `channel`; the session is tracked by `session_id` for
/// subsequent write/resize/stop calls.
#[tauri::command]
pub async fn exec_start(
    state: State<'_, AppState>,
    sessions: State<'_, ExecSessions>,
    cluster_id: String,
    namespace: String,
    pod: String,
    container: Option<String>,
    command: Option<Vec<String>>,
    session_id: String,
    channel: Channel<ExecEvent>,
) -> Result<(), String> {
    let client = state.pool.get_or_create(&cluster_id).await?;
    let api: Api<Pod> = Api::namespaced(client, &namespace);

    let cmd = command.unwrap_or_else(|| {
        vec![
            "/bin/sh".to_string(),
            "-c".to_string(),
            "command -v bash >/dev/null 2>&1 && exec bash || exec sh".to_string(),
        ]
    });

    let mut ap = AttachParams::interactive_tty();
    if let Some(c) = container {
        ap = ap.container(c);
    }

    let mut attached = api
        .exec(&pod, cmd, &ap)
        .await
        .map_err(|e| crate::errors::kube_error("pod exec", e))?;

    let mut stdout = attached
        .stdout()
        .ok_or_else(|| "Pod exec failed: no stdout".to_string())?;
    let stdin = attached
        .stdin()
        .ok_or_else(|| "Pod exec failed: no stdin".to_string())?;
    let resize = attached.terminal_size();

    // Pump container stdout -> frontend channel until EOF/error.
    let ch = channel.clone();
    let handle = tokio::spawn(async move {
        use tokio::io::AsyncReadExt;
        let mut buf = [0u8; 8192];
        loop {
            match stdout.read(&mut buf).await {
                Ok(0) => break,
                Ok(n) => {
                    let text = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = ch.send(ExecEvent::Data { data: text });
                }
                Err(e) => {
                    let _ = ch.send(ExecEvent::Exit {
                        message: Some(e.to_string()),
                    });
                    return;
                }
            }
        }
        let _ = ch.send(ExecEvent::Exit { message: None });
    });

    sessions.0.lock().insert(
        session_id,
        ExecSession {
            stdin: Arc::new(tokio::sync::Mutex::new(Box::new(stdin) as StdinWriter)),
            resize,
            abort: handle.abort_handle(),
        },
    );
    Ok(())
}

/// Forward a chunk of user keystrokes to the container's stdin.
#[tauri::command]
pub async fn exec_write(
    sessions: State<'_, ExecSessions>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    // Clone the Arc'd writer out under the (non-Send) parking_lot guard, then drop
    // the guard before awaiting on the tokio mutex — keeps this future Send.
    let writer = {
        let guard = sessions.0.lock();
        guard.get(&session_id).map(|s| s.stdin.clone())
    };
    if let Some(writer) = writer {
        let mut w = writer.lock().await;
        w.write_all(data.as_bytes())
            .await
            .map_err(|e| format!("[EXEC] write: {e}"))?;
        w.flush().await.map_err(|e| format!("[EXEC] flush: {e}"))?;
    }
    Ok(())
}

/// Notify the container of a new terminal size (cols x rows).
#[tauri::command]
pub async fn exec_resize(
    sessions: State<'_, ExecSessions>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let mut sender = {
        let mut guard = sessions.0.lock();
        match guard.get_mut(&session_id).and_then(|s| s.resize.clone()) {
            Some(s) => s,
            None => return Ok(()),
        }
    };
    sender
        .send(TerminalSize {
            width: cols,
            height: rows,
        })
        .await
        .map_err(|e| format!("[EXEC] resize: {e}"))?;
    Ok(())
}

/// End an exec session: abort the stdout pump and drop the stdin/resize handles.
#[tauri::command]
pub async fn exec_stop(
    sessions: State<'_, ExecSessions>,
    session_id: String,
) -> Result<(), String> {
    if let Some(sess) = sessions.0.lock().remove(&session_id) {
        sess.abort.abort();
    }
    Ok(())
}
