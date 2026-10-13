use serde::Serialize;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::{oneshot, Mutex};
use tokio::time::{timeout, Duration};

mod audio;
mod files;
mod git;
mod project;
mod wallpaper;

#[derive(Default)]
struct Backend {
    server: Mutex<Option<Arc<Server>>>,
    connect_lock: Mutex<()>,
}

struct Server {
    stdin: Mutex<ChildStdin>,
    child: Mutex<Child>,
    pending: Mutex<HashMap<u64, oneshot::Sender<Result<Value, String>>>>,
    approvals: Mutex<HashSet<u64>>,
    next_id: AtomicU64,
    connected: AtomicBool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ServerMessage {
    method: String,
    params: Value,
    id: Option<u64>,
}

impl Server {
    async fn write(&self, message: &Value) -> Result<(), String> {
        let mut line = serde_json::to_vec(message).map_err(|e| e.to_string())?;
        line.push(b'\n');
        self.stdin
            .lock()
            .await
            .write_all(&line)
            .await
            .map_err(|e| format!("Could not write to Codex: {e}"))
    }

    async fn request(&self, method: &str, params: Value) -> Result<Value, String> {
        if !self.connected.load(Ordering::SeqCst) {
            return Err("Codex app-server is disconnected.".into());
        }
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);
        let (sender, receiver) = oneshot::channel();
        self.pending.lock().await.insert(id, sender);
        if let Err(error) = self
            .write(&json!({ "id": id, "method": method, "params": params }))
            .await
        {
            self.pending.lock().await.remove(&id);
            return Err(error);
        }
        match timeout(Duration::from_secs(45), receiver).await {
            Ok(Ok(result)) => result,
            Ok(Err(_)) => Err("Codex app-server stopped before answering.".into()),
            Err(_) => {
                self.pending.lock().await.remove(&id);
                Err(format!(
                    "Codex app-server timed out while handling {method}."
                ))
            }
        }
    }

    async fn notify(&self, method: &str, params: Value) -> Result<(), String> {
        self.write(&json!({ "method": method, "params": params }))
            .await
    }

    async fn respond_approval(&self, id: u64, decision: &str) -> Result<(), String> {
        if !matches!(
            decision,
            "accept" | "acceptForSession" | "decline" | "cancel"
        ) {
            return Err("Unsupported approval decision.".into());
        }
        if !self.approvals.lock().await.remove(&id) {
            return Err("The approval request is no longer pending.".into());
        }
        self.write(&json!({ "id": id, "result": { "decision": decision } }))
            .await
    }

    async fn stop(&self) {
        self.connected.store(false, Ordering::SeqCst);
        let _ = self.child.lock().await.kill().await;
    }
}

fn codex_binary(custom_path: Option<String>) -> PathBuf {
    if let Some(path) = custom_path.filter(|path| !path.trim().is_empty()) {
        return PathBuf::from(path);
    }
    if let Ok(path) = std::env::var("TUXCODEX_CODEX_BIN") {
        if !path.trim().is_empty() {
            return PathBuf::from(path);
        }
    }
    #[cfg(windows)]
    if let Some(appdata) = std::env::var_os("APPDATA") {
        let candidate = PathBuf::from(appdata).join("npm/codex.cmd");
        if candidate.is_file() {
            return candidate;
        }
    }
    if let Some(home) = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")) {
        let home = PathBuf::from(home);
        for candidate in [home.join(".local/bin/codex"), home.join(".cargo/bin/codex")] {
            if candidate.is_file() {
                return candidate;
            }
        }
        let nvm_versions = home.join(".nvm/versions/node");
        if let Ok(versions) = std::fs::read_dir(nvm_versions) {
            let mut candidates: Vec<PathBuf> = versions
                .flatten()
                .map(|entry| entry.path().join("bin/codex"))
                .filter(|path| path.is_file())
                .collect();
            candidates.sort();
            if let Some(candidate) = candidates.pop() {
                return candidate;
            }
        }
    }
    for candidate in ["/usr/local/bin/codex", "/opt/homebrew/bin/codex"] {
        if std::path::Path::new(candidate).is_file() {
            return PathBuf::from(candidate);
        }
    }
    PathBuf::from("codex")
}

fn is_approval_request(method: &str) -> bool {
    matches!(
        method,
        "item/commandExecution/requestApproval" | "item/fileChange/requestApproval"
    )
}

fn is_allowed_method(method: &str) -> bool {
    matches!(
        method,
        "account/read"
            | "configRequirements/read"
            | "model/list"
            | "thread/start"
            | "thread/resume"
            | "thread/list"
            | "thread/read"
            | "thread/archive"
            | "thread/delete"
            | "turn/start"
            | "turn/interrupt"
            | "review/start"
    )
}

async fn read_server(app: AppHandle, server: Arc<Server>, stdout: tokio::process::ChildStdout) {
    let mut lines = BufReader::new(stdout).lines();
    loop {
        let line = match lines.next_line().await {
            Ok(Some(line)) => line,
            Ok(None) => break,
            Err(error) => {
                let _ = app.emit("codex-status", format!("Connection error: {error}"));
                break;
            }
        };
        let message: Value = match serde_json::from_str(&line) {
            Ok(message) => message,
            Err(_) => continue,
        };
        // A restarted server may still have buffered stdout. Never forward its
        // events or approval requests to the new server's UI.
        let is_current = app
            .state::<Backend>()
            .server
            .lock()
            .await
            .as_ref()
            .is_some_and(|current| Arc::ptr_eq(current, &server));
        if !is_current || !server.connected.load(Ordering::SeqCst) {
            break;
        }
        let id = message.get("id").and_then(Value::as_u64);
        let method = message.get("method").and_then(Value::as_str);
        match (id, method) {
            (Some(id), None) => {
                if let Some(sender) = server.pending.lock().await.remove(&id) {
                    let result = if let Some(error) = message.get("error") {
                        Err(error
                            .get("message")
                            .and_then(Value::as_str)
                            .unwrap_or("Codex app-server returned an error.")
                            .to_string())
                    } else {
                        Ok(message.get("result").cloned().unwrap_or(Value::Null))
                    };
                    let _ = sender.send(result);
                }
            }
            (Some(id), Some(method)) if is_approval_request(method) => {
                server.approvals.lock().await.insert(id);
                let event = ServerMessage {
                    method: method.to_string(),
                    params: message.get("params").cloned().unwrap_or(Value::Null),
                    id: Some(id),
                };
                if app.emit("codex-request", event).is_err() {
                    let _ = server.respond_approval(id, "decline").await;
                } else {
                    let server_for_timeout = server.clone();
                    tokio::spawn(async move {
                        tokio::time::sleep(Duration::from_secs(300)).await;
                        let _ = server_for_timeout.respond_approval(id, "decline").await;
                    });
                }
            }
            (Some(id), Some(_)) => {
                let _ = server
                    .write(&json!({
                        "id": id,
                        "error": { "code": -32601, "message": "Unsupported client request" }
                    }))
                    .await;
            }
            (None, Some(method)) => {
                let _ = app.emit(
                    "codex-event",
                    ServerMessage {
                        method: method.to_string(),
                        params: message.get("params").cloned().unwrap_or(Value::Null),
                        id: None,
                    },
                );
            }
            _ => {}
        }
    }
    server.connected.store(false, Ordering::SeqCst);
    server.pending.lock().await.clear();
    server.approvals.lock().await.clear();
    let is_current = app
        .state::<Backend>()
        .server
        .lock()
        .await
        .as_ref()
        .is_some_and(|current| Arc::ptr_eq(current, &server));
    if is_current {
        let _ = app.emit("codex-status", "Codex app-server disconnected.");
    }
}

#[tauri::command]
async fn connect(
    app: AppHandle,
    state: State<'_, Backend>,
    codex_path: Option<String>,
    restart: bool,
) -> Result<(), String> {
    let _connect_guard = state.connect_lock.lock().await;
    let mut slot = state.server.lock().await;
    if let Some(existing) = slot.as_ref() {
        if existing.connected.load(Ordering::SeqCst) && !restart {
            return Ok(());
        }
        existing.stop().await;
    }
    *slot = None;

    let binary = codex_binary(codex_path);
    let mut child = Command::new(&binary)
        .arg("app-server")
        .arg("--listen")
        .arg("stdio://")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true)
        .spawn()
        .map_err(|error| format!("Could not launch {}: {error}", binary.display()))?;
    let stdin = child.stdin.take().ok_or("Codex stdin was unavailable.")?;
    let stdout = child.stdout.take().ok_or("Codex stdout was unavailable.")?;
    let server = Arc::new(Server {
        stdin: Mutex::new(stdin),
        child: Mutex::new(child),
        pending: Mutex::new(HashMap::new()),
        approvals: Mutex::new(HashSet::new()),
        next_id: AtomicU64::new(1),
        connected: AtomicBool::new(true),
    });
    *slot = Some(server.clone());
    drop(slot);
    tokio::spawn(read_server(app.clone(), server.clone(), stdout));

    let initialized = server
        .request(
            "initialize",
            json!({
                "clientInfo": {
                    "name": "tuxcodex",
                    "title": "TuxCodex",
                    "version": env!("CARGO_PKG_VERSION")
                }
            }),
        )
        .await;
    if let Err(error) = initialized {
        server.stop().await;
        return Err(error);
    }
    if let Err(error) = server.notify("initialized", json!({})).await {
        server.stop().await;
        return Err(error);
    }
    let _ = app.emit("codex-status", "Connected to Codex app-server.");
    Ok(())
}

#[tauri::command]
async fn rpc(state: State<'_, Backend>, method: String, params: Value) -> Result<Value, String> {
    if !is_allowed_method(&method) {
        return Err("This app-server method is not available in TuxCodex.".into());
    }
    let server = state
        .server
        .lock()
        .await
        .as_ref()
        .cloned()
        .ok_or("Connect to Codex first.")?;
    server.request(&method, params).await
}

#[tauri::command]
async fn respond_approval(
    state: State<'_, Backend>,
    id: u64,
    decision: String,
) -> Result<(), String> {
    let server = state
        .server
        .lock()
        .await
        .as_ref()
        .cloned()
        .ok_or("Codex app-server is disconnected.")?;
    server.respond_approval(id, &decision).await
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(Backend::default())
        .invoke_handler(tauri::generate_handler![
            connect,
            rpc,
            respond_approval,
            git::git_snapshot,
            git::create_worktree,
            project::create_project,
            wallpaper::import_wallpaper,
            wallpaper::read_wallpaper,
            files::preview_file,
            files::open_workspace_file,
            files::copy_workspace_file,
            audio::import_audio,
            audio::save_recording,
            audio::read_audio,
            report_frontend_error
        ])
        .run(tauri::generate_context!())
        .expect("failed to run TuxCodex");
}

#[tauri::command]
fn report_frontend_error(message: String) {
    let safe = message
        .chars()
        .take(2000)
        .collect::<String>()
        .replace('\n', " ")
        .replace('\r', " ");
    eprintln!("[TuxCodex webview] {safe}");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn approval_requests_are_explicit() {
        assert!(is_approval_request("item/commandExecution/requestApproval"));
        assert!(is_approval_request("item/fileChange/requestApproval"));
        assert!(!is_approval_request("tool/requestUserInput"));
    }

    #[test]
    fn arbitrary_rpc_methods_are_rejected() {
        assert!(is_allowed_method("thread/read"));
        assert!(!is_allowed_method("account/logout"));
    }
}
