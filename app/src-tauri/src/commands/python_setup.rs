//! First-launch Python environment bootstrap (Windows).
//!
//! On Windows, the installer ships only the `.py` scripts — there is no Python
//! interpreter, no venv, and no AI dependencies pre-installed.  This module
//! downloads `python-3.12-embed-amd64.zip` from python.org, extracts it under
//! `app_cache_dir/python/`, bootstraps pip via `get-pip.py`, and installs the
//! contents of `requirements.txt`.
//!
//! macOS and Linux are no-ops: those platforms either have a system Python or
//! rely on the platform-specific setup scripts under `app/scripts/`.

use crate::error::AppError;
use serde::Serialize;
#[cfg(target_os = "windows")]
use tauri::{Emitter, Manager};

/// Status of the embedded Python environment.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PythonSetupStatus {
    /// True when the interpreter exists *and* the dependency-install marker
    /// file is present (so we know `pip install -r requirements.txt` finished).
    pub ready: bool,
    /// Absolute path to the interpreter, if installed.
    pub interpreter_path: Option<String>,
    /// True only on platforms where this setup applies (Windows).  macOS /
    /// Linux clients can use this flag to skip the setup-step UI entirely.
    pub required: bool,
}

/// Holds the in-flight setup process so the UI can cancel it.
pub struct PythonSetupState(
    pub std::sync::Mutex<Option<tauri_plugin_shell::process::CommandChild>>,
);

impl PythonSetupState {
    pub fn new() -> Self {
        Self(std::sync::Mutex::new(None))
    }
}

#[cfg(target_os = "windows")]
fn embed_python_paths(
    app: &tauri::AppHandle,
) -> Result<(std::path::PathBuf, std::path::PathBuf), AppError> {
    let cache = app
        .path()
        .app_cache_dir()
        .map_err(|e| AppError::Path(e.to_string()))?;
    let python_dir = cache.join("python");
    Ok((
        python_dir.join("python.exe"),
        python_dir.join(".monioc-deps-installed"),
    ))
}

/// Probe the on-disk state of the embedded Python install.
#[tauri::command]
pub fn check_python_env(app: tauri::AppHandle) -> Result<PythonSetupStatus, AppError> {
    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
        return Ok(PythonSetupStatus {
            ready: true,
            interpreter_path: None,
            required: false,
        });
    }

    #[cfg(target_os = "windows")]
    {
        let (py, marker) = embed_python_paths(&app)?;
        let ready = py.exists() && marker.exists();
        Ok(PythonSetupStatus {
            ready,
            interpreter_path: if py.exists() {
                Some(py.to_string_lossy().into_owned())
            } else {
                None
            },
            required: true,
        })
    }
}

/// Run the Windows PowerShell bootstrap script and stream its output to the
/// frontend via the `python-setup-progress` event so the UI can show live
/// status (download → extract → pip install …).  Returns the post-setup
/// status; on failure the error message includes the captured stderr tail
/// so production users can see exactly what went wrong.
#[tauri::command]
pub async fn setup_python_env(app: tauri::AppHandle) -> Result<PythonSetupStatus, AppError> {
    #[cfg(not(target_os = "windows"))]
    {
        return check_python_env(app);
    }

    #[cfg(target_os = "windows")]
    {
        use tauri_plugin_shell::process::CommandEvent;
        use tauri_plugin_shell::ShellExt;

        let resources = app
            .path()
            .resource_dir()
            .map_err(|e| AppError::Path(e.to_string()))?;
        let script_path = resources.join("setup-python-env.ps1");
        let req_path = resources.join("requirements.txt");

        if !script_path.exists() {
            return Err(AppError::Path(format!(
                "setup-python-env.ps1 not found at {}",
                script_path.display()
            )));
        }
        if !req_path.exists() {
            return Err(AppError::Path(format!(
                "requirements.txt not found at {}",
                req_path.display()
            )));
        }

        let install_dir = app
            .path()
            .app_cache_dir()
            .map_err(|e| AppError::Path(e.to_string()))?;
        std::fs::create_dir_all(&install_dir).map_err(|e| {
            AppError::Processing(format!("Cannot create install dir: {e}"))
        })?;

        let args: Vec<String> = vec![
            "-NoProfile".into(),
            "-NonInteractive".into(),
            "-ExecutionPolicy".into(),
            "Bypass".into(),
            "-File".into(),
            script_path.to_string_lossy().into_owned(),
            "-InstallDir".into(),
            install_dir.to_string_lossy().into_owned(),
            "-Requirements".into(),
            req_path.to_string_lossy().into_owned(),
        ];

        let (mut rx, child) = app
            .shell()
            .command("powershell.exe")
            .args(args.iter().map(|s| s.as_str()).collect::<Vec<_>>())
            .spawn()
            .map_err(|e| AppError::Processing(e.to_string()))?;

        if let Ok(mut guard) = app.state::<PythonSetupState>().0.lock() {
            *guard = Some(child);
        }

        // Keep a rolling tail so we can include it in the error message — pip
        // failures (network, SSL, MSVC runtime missing) usually surface in the
        // last 20-30 lines of output.
        let mut output_tail: std::collections::VecDeque<String> =
            std::collections::VecDeque::with_capacity(80);
        let mut exit_code: Option<i32> = None;

        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(bytes) | CommandEvent::Stderr(bytes) => {
                    if let Ok(text) = std::str::from_utf8(&bytes) {
                        for raw in text.lines() {
                            let line = raw.trim();
                            if line.is_empty() {
                                continue;
                            }
                            if output_tail.len() == 80 {
                                output_tail.pop_front();
                            }
                            output_tail.push_back(line.to_string());
                            // Forward to the frontend so the UI can show
                            // "Extracting Python runtime …" etc. live.
                            let _ = app.emit("python-setup-progress", line);
                            eprintln!("[setup-python-env] {line}");
                        }
                    }
                }
                CommandEvent::Terminated(payload) => {
                    exit_code = payload.code;
                    break;
                }
                _ => {}
            }
        }

        if let Ok(mut guard) = app.state::<PythonSetupState>().0.lock() {
            *guard = None;
        }

        if exit_code != Some(0) {
            let tail: Vec<String> = output_tail.into_iter().collect();
            let detail = tail.join("\n");
            return Err(AppError::Processing(format!(
                "Python environment setup failed (exit {:?}).\n{}",
                exit_code, detail
            )));
        }

        check_python_env(app.clone())
    }
}

/// Cancel an in-flight setup.  No-op when no setup is running.
#[tauri::command]
pub async fn cancel_python_setup(
    state: tauri::State<'_, PythonSetupState>,
) -> Result<(), AppError> {
    let child = state
        .0
        .lock()
        .map_err(|_| AppError::Processing("python setup state lock poisoned".into()))?
        .take();
    if let Some(child) = child {
        child
            .kill()
            .map_err(|e| AppError::Processing(e.to_string()))?;
    }
    Ok(())
}
