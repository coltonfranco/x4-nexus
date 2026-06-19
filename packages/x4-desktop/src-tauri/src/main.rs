// Hide the extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::{Child, Command};
use std::sync::Mutex;

use tauri::{Manager, RunEvent};

/// Holds the spawned API server process so we can terminate it when the window closes.
/// Without this the uvicorn process would outlive the desktop shell.
struct ServerProcess(Mutex<Option<Child>>);

/// Launch the x4-api server (FastAPI/uvicorn on 127.0.0.1:8765).
///
/// Dev: run it from source via `uv run x4c serve` at the repo root, so uv resolves the
/// workspace. Release: prefer a bundled `x4c-server` sidecar exe sitting next to the
/// desktop binary (produced by the PyInstaller follow-up), falling back to `uv` so a
/// source build still works.
fn spawn_server() -> Option<Child> {
    // env!("CARGO_MANIFEST_DIR") is packages/x4-desktop/src-tauri at compile time;
    // three levels up is the repository root.
    let repo_root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../..");

    if !cfg!(debug_assertions) {
        if let Ok(exe) = std::env::current_exe() {
            if let Some(dir) = exe.parent() {
                let sidecar = dir.join(if cfg!(windows) {
                    "x4c-server.exe"
                } else {
                    "x4c-server"
                });
                if sidecar.exists() {
                    return Command::new(sidecar).spawn().ok();
                }
            }
        }
    }

    Command::new("uv")
        .args(["run", "x4c", "serve"])
        .current_dir(repo_root)
        .spawn()
        .ok()
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(ServerProcess(Mutex::new(None)))
        .setup(|app| {
            let child = spawn_server();
            if child.is_none() {
                eprintln!("x4-desktop: failed to start the API server (is `uv` on PATH?)");
            }
            *app.state::<ServerProcess>().0.lock().unwrap() = child;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building the X4 Nexus desktop app")
        .run(|app_handle, event| {
            if let RunEvent::Exit = event {
                if let Some(mut child) =
                    app_handle.state::<ServerProcess>().0.lock().unwrap().take()
                {
                    let _ = child.kill();
                }
            }
        });
}
