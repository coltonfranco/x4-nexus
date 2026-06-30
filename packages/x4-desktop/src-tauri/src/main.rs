// Hide the extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::{Child, Command};
use std::sync::Mutex;

use tauri::{Manager, RunEvent, WindowEvent};

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Holds the spawned API server process so we can terminate it when the window closes.
/// Without this the uvicorn process would outlive the desktop shell.
struct ServerProcess(Mutex<Option<Child>>);

/// Launch the x4-api server (FastAPI/uvicorn on 127.0.0.1:8765).
///
/// Release: run the bundled `x4c-server` PyInstaller sidecar shipped as a Tauri resource
/// (`<resource_dir>/server/x4c-server/x4c-server[.exe]`), telling it where the dashboard
/// `dist/` resource lives via `X4C_DASHBOARD_DIST` so it can serve the SPA. The webview's
/// loader page then redirects to the server, making every relative /api and /static URL
/// same-origin.  On Windows the sidecar's console window is hidden with CREATE_NO_WINDOW.
///
/// Dev: fall back to `uv run x4c serve` at the repo root so a source checkout still works
/// with live reload (no sidecar staged).
fn spawn_server(app: &tauri::AppHandle) -> Option<Child> {
    #[cfg(windows)]
    use std::os::windows::process::CommandExt;
    // env!("CARGO_MANIFEST_DIR") is packages/x4-desktop/src-tauri at compile time;
    // three levels up is the repository root.
    let repo_root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../..");

    if !cfg!(debug_assertions) {
        if let Ok(resource_dir) = app.path().resource_dir() {
            let server_dir = resource_dir.join("server").join("x4c-server");
            let sidecar = server_dir.join(if cfg!(windows) {
                "x4c-server.exe"
            } else {
                "x4c-server"
            });
            let dashboard_dist = resource_dir.join("dashboard");
            if sidecar.exists() {
                let mut cmd = Command::new(sidecar);
                cmd.env("X4C_DASHBOARD_DIST", dashboard_dist);
                #[cfg(windows)]
                {
                    cmd.creation_flags(CREATE_NO_WINDOW);
                }
                return cmd.spawn().ok();
            }
        }
    }

    Command::new("uv")
        .args(["run", "x4c", "serve"])
        .current_dir(repo_root)
        .spawn()
        .ok()
}

/// Terminate the server and ALL of its descendants.
///
/// `Child::kill()` only signals the immediate child. In dev that child is `uv`, which
/// spawns `x4c` → `python`/uvicorn as grandchildren; killing `uv` alone orphans the
/// uvicorn process, which keeps holding port 8765 and serving stale code after the
/// window is closed. On Windows we therefore kill the whole tree with `taskkill /T`.
fn kill_server_tree(mut child: Child) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let _ = Command::new("taskkill")
            .args(["/F", "/T", "/PID", &child.id().to_string()])
            .creation_flags(CREATE_NO_WINDOW)
            .status();
    }
    #[cfg(not(windows))]
    {
        let _ = child.kill();
    }
    // Reap so we don't leave a zombie entry; the tree is already gone above.
    let _ = child.wait();
}

/// Take the stored child (if any) and kill its process tree. Idempotent: the `take()`
/// means a second call (e.g. CloseRequested then Exit) is a no-op.
fn shutdown_server(app: &tauri::AppHandle) {
    if let Some(child) = app.state::<ServerProcess>().0.lock().unwrap().take() {
        kill_server_tree(child);
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(ServerProcess(Mutex::new(None)))
        .setup(|app| {
            let child = spawn_server(app.handle());
            if child.is_none() {
                eprintln!(
                    "x4-desktop: failed to start the API server \
                     (bundled sidecar missing and `uv` not on PATH?)"
                );
            }
            *app.state::<ServerProcess>().0.lock().unwrap() = child;
            Ok(())
        })
        // Clicking the window's X fires CloseRequested before the app tears down — kill the
        // server here so no background service survives the window closing.
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { .. } = event {
                shutdown_server(window.app_handle());
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building the X4 Nexus desktop app")
        // Backstop: also kill on the final Exit event (covers paths that don't emit a
        // window CloseRequested, e.g. a tray/quit action).
        .run(|app_handle, event| {
            if let RunEvent::Exit = event {
                shutdown_server(app_handle);
            }
        });
}
