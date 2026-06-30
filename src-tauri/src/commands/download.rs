use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use kube::api::AttachParams;
use kube::Api;
use parking_lot::Mutex;
use k8s_openapi::api::core::v1::Pod;
use serde::Serialize;
use tauri::ipc::Channel;
use tauri::State;
use tokio::io::AsyncReadExt;

use crate::AppState;

pub struct DownloadSession {
    pub abort: tokio::task::AbortHandle,
}

#[derive(Default)]
pub struct DownloadSessions(pub Mutex<HashMap<String, DownloadSession>>);

#[derive(Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum FileDownloadEvent {
    /// Total file size, sent once before streaming begins.
    FileSize { total: u64 },
    /// Progress update (total bytes received so far).
    Progress { total_bytes: u64 },
    /// Download completed successfully.
    Complete { total_bytes: u64 },
    /// An error occurred.
    Error { message: String },
}

/// A single file/dir entry from a directory listing.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub name: String,
    pub is_dir: bool,
}

/// Build the shell command to run inside the pod.
/// For files: exec cat directly (raw text through stdout)
/// For directories: exec tar directly (raw tar bytes through stdout)
fn build_pod_command(source_path: &str, is_directory: bool) -> Vec<String> {
    if is_directory {
        if let Some((parent, name)) = split_path(source_path) {
            vec!["tar".to_string(), "cf".to_string(), "-".to_string(), "-C".to_string(), parent, name]
        } else {
            vec!["tar".to_string(), "cf".to_string(), "-".to_string(), source_path.to_string()]
        }
    } else {
        // For single files, use cat directly
        vec!["cat".to_string(), source_path.to_string()]
    }
}

/// Split a path into (parent_dir, basename).
/// e.g. "/app/config.yaml" → ("/app", "config.yaml")
///      "/" → None
fn split_path(path: &str) -> Option<(String, String)> {
    let path = path.trim_end_matches('/');
    if path.is_empty() || path == "/" {
        return None;
    }
    if let Some(pos) = path.rfind('/') {
        let parent = if pos == 0 { "/" } else { &path[..pos] };
        let name = &path[pos + 1..];
        if name.is_empty() {
            None
        } else {
            Some((parent.to_string(), name.to_string()))
        }
    } else {
        // Relative path like "config.yaml"
        Some((".".to_string(), path.to_string()))
    }
}

/// Get the size of a file or directory inside a pod, in bytes.
/// Uses `wc -c` for files and `find + wc -c` for directories — both are POSIX standard.
/// Returns None if the pod has no shell or the command fails.
async fn get_pod_file_size(
    api: &Api<Pod>,
    pod: &str,
    container: Option<&str>,
    path: &str,
    is_directory: bool,
) -> Option<u64> {
    // For a directory: sum all file sizes under it via find+wc (POSIX, no GNU extensions needed).
    // For a single file: wc -c reads from stdin redirect, avoiding the trailing filename in output.
    let script = if is_directory {
        format!("find '{path}' -type f -exec wc -c {{}} + 2>/dev/null | awk 'END{{print $1}}'")
    } else {
        format!("wc -c < '{path}' 2>/dev/null")
    };

    let cmd = vec!["/bin/sh".to_string(), "-c".to_string(), script];
    let mut ap = AttachParams::default().stdin(false).tty(false);
    if let Some(c) = container {
        ap = ap.container(c.to_string());
    }

    let mut attached = api.exec(pod, cmd, &ap).await.ok()?;
    let mut stdout = attached.stdout()?;
    let mut output = String::new();
    stdout.read_to_string(&mut output).await.ok()?;
    output.trim().parse::<u64>().ok()
}

/// Run ls + test -d inside a pod to list directory contents with type info.
/// This approach works on all POSIX systems: ls lists names, test -d checks dirs.
async fn exec_list(
    client: kube::Client,
    namespace: &str,
    pod: &str,
    container: Option<&str>,
    path: &str,
) -> Result<Vec<FileEntry>, String> {
    let api: Api<Pod> = Api::namespaced(client, namespace);

    // Generate a script that lists entries and checks if each is a directory.
    // Works on all POSIX shells without GNU extensions.
    // Single-quote the path for shell safety, then interpolate in the loop.
    let script = format!(
        "for f in '{path}'/* '{path}'/.*; do \
            base=$(basename \"$f\"); \
            [ \"$base\" = \".\" ] || [ \"$base\" = \"..\" ] && continue; \
            [ -e \"$f\" ] || continue; \
            if [ -d \"$f\" ]; then \
                echo \"d $base\"; \
            else \
                echo \"- $base\"; \
            fi; \
        done"
    );

    let cmd = vec![
        "/bin/sh".to_string(),
        "-c".to_string(),
        script,
    ];

    let mut ap = AttachParams::default().stdin(false).tty(false);
    if let Some(c) = container {
        ap = ap.container(c.to_string());
    }

    let mut attached = api
        .exec(pod, cmd, &ap)
        .await
        .map_err(|e| crate::errors::kube_error("pod exec (ls)", e))?;

    let mut stdout = attached
        .stdout()
        .ok_or_else(|| "Pod exec failed: no stdout".to_string())?;

    let mut output = String::new();
    stdout
        .read_to_string(&mut output)
        .await
        .map_err(|e| format!("Failed to read output: {e}"))?;

    // Parse "d filename" or "- filename" format
    let entries: Vec<FileEntry> = output
        .lines()
        .filter(|l| !l.is_empty())
        .filter_map(|line| {
            if line.len() < 3 {
                return None;
            }
            let type_char = line.chars().next().unwrap();
            let name = line[2..].to_string();
            match type_char {
                'd' | 'D' => Some(FileEntry { name, is_dir: true }),
                _ => Some(FileEntry { name, is_dir: false }),
            }
        })
        .collect();

    Ok(entries)
}

/// List files inside a pod at a given path.
#[tauri::command]
pub async fn list_pod_files(
    state: State<'_, AppState>,
    cluster_id: String,
    namespace: String,
    pod: String,
    container: Option<String>,
    path: String,
) -> Result<Vec<FileEntry>, String> {
    let client = state.pool.get_or_create(&cluster_id).await?;
    exec_list(client, &namespace, &pod, container.as_deref(), &path).await
}

/// Start a file download session: exec into the pod, run the appropriate command,
/// and write the output directly to save_path on the local filesystem.
#[tauri::command]
pub async fn file_download_start(
    state: State<'_, AppState>,
    sessions: State<'_, DownloadSessions>,
    cluster_id: String,
    namespace: String,
    pod: String,
    container: Option<String>,
    source_path: String,
    is_directory: bool,
    save_path: String,
    session_id: String,
    channel: Channel<FileDownloadEvent>,
) -> Result<(), String> {
    let client = state.pool.get_or_create(&cluster_id).await?;
    let api: Api<Pod> = Api::namespaced(client, &namespace);

    let cmd = build_pod_command(&source_path, is_directory);
    eprintln!("[download] cmd: {:?}", cmd);
    eprintln!("[download] cluster={} namespace={} pod={} path={} is_dir={}", cluster_id, namespace, pod, source_path, is_directory);

    let mut ap = AttachParams::default().stdin(false).tty(false);
    if let Some(c) = &container {
        ap = ap.container(c.clone());
    }

    let mut attached = api
        .exec(&pod, cmd, &ap)
        .await
        .map_err(|e| crate::errors::kube_error("pod exec (download)", e))?;

    let mut stdout = attached
        .stdout()
        .ok_or_else(|| "Pod exec failed: no stdout".to_string())?;

    let mut stderr = attached
        .stderr()
        .ok_or_else(|| "Pod exec failed: no stderr".to_string())?;

    // Query file size before spawning the download task.
    // Send it to the frontend so it can show a real progress percentage.
    if let Some(size) = get_pod_file_size(&api, &pod, container.as_deref(), &source_path, is_directory).await {
        let _ = channel.send(FileDownloadEvent::FileSize { total: size });
    }

    let total_bytes = Arc::new(AtomicU64::new(0));
    let ch = channel.clone();

    let handle = tokio::spawn(async move {
        eprintln!("[download] spawned task started");

        // Handle stderr in a separate task so it doesn't interfere with stdout reading.
        let stderr_handle = tokio::spawn(async move {
            let mut stderr_buf = [0u8; 4096];
            let mut stderr_output = Vec::new();
            loop {
                match stderr.read(&mut stderr_buf).await {
                    Ok(0) => break,
                    Ok(n) => stderr_output.extend_from_slice(&stderr_buf[..n]),
                    Err(_) => break,
                }
            }
            stderr_output
        });

        // Open the destination file for writing.
        let mut file = match tokio::fs::File::create(&save_path).await {
            Ok(f) => f,
            Err(e) => {
                let _ = ch.send(FileDownloadEvent::Error {
                    message: format!("Failed to create file '{}': {}", save_path, e),
                });
                return;
            }
        };

        // Read stdout and write directly to disk.
        let mut buf = [0u8; 32768];
        loop {
            let n = match stdout.read(&mut buf).await {
                Ok(0) => {
                    eprintln!("[download] stdout EOF");
                    break;
                }
                Ok(n) => n,
                Err(e) => {
                    eprintln!("[download] stdout error: {}", e);
                    let _ = ch.send(FileDownloadEvent::Error {
                        message: format!("Read error: {}", e),
                    });
                    return;
                }
            };

            if let Err(e) = tokio::io::AsyncWriteExt::write_all(&mut file, &buf[..n]).await {
                let _ = ch.send(FileDownloadEvent::Error {
                    message: format!("Write error: {}", e),
                });
                return;
            }

            let total = total_bytes.fetch_add(n as u64, Ordering::Relaxed) + n as u64;
            let _ = ch.send(FileDownloadEvent::Progress { total_bytes: total });
        }

        // Wait for stderr reader to finish
        let stderr_output = stderr_handle.await.unwrap_or_default();
        eprintln!("[download] stderr: {:?}", String::from_utf8_lossy(&stderr_output));

        // Check the exit status
        if let Some(status_future) = attached.take_status() {
            let status_opt = status_future.await;
            eprintln!("[download] status: {:?}", status_opt);
            if let Some(status) = status_opt {
                if status.status.as_deref() == Some("Failure") {
                    let msg = status.message.clone().unwrap_or_else(|| "Command failed".to_string());
                    let stderr_msg = String::from_utf8_lossy(&stderr_output).trim().to_string();
                    let error_msg = if stderr_msg.is_empty() {
                        msg
                    } else {
                        format!("{msg}: {stderr_msg}")
                    };
                    eprintln!("[download] sending error event: {}", error_msg);
                    // Remove the partially written file on failure
                    let _ = tokio::fs::remove_file(&save_path).await;
                    let _ = ch.send(FileDownloadEvent::Error { message: error_msg });
                    return;
                }
            }
        }

        let total = total_bytes.load(Ordering::Relaxed);
        eprintln!("[download] total bytes written: {}", total);

        if total == 0 {
            let stderr_msg = String::from_utf8_lossy(&stderr_output).trim().to_string();
            let _ = tokio::fs::remove_file(&save_path).await;
            if !stderr_msg.is_empty() {
                let _ = ch.send(FileDownloadEvent::Error { message: stderr_msg });
            } else {
                let _ = ch.send(FileDownloadEvent::Error {
                    message: "No data received. File may not exist or command not available in container.".to_string(),
                });
            }
            return;
        }

        eprintln!("[download] sending complete event");
        let _ = ch.send(FileDownloadEvent::Complete { total_bytes: total });
    });

    sessions.0.lock().insert(
        session_id,
        DownloadSession {
            abort: handle.abort_handle(),
        },
    );
    Ok(())
}

/// Cancel an in-progress download session.
#[tauri::command]
pub async fn file_download_stop(
    sessions: State<'_, DownloadSessions>,
    session_id: String,
) -> Result<(), String> {
    if let Some(sess) = sessions.0.lock().remove(&session_id) {
        sess.abort.abort();
    }
    Ok(())
}
