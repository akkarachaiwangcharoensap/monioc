//! Read-only probe for the user-managed Python venv.
//!
//! Monioc does not bundle Python on any platform.  At install time the user
//! runs `app/scripts/setup-python-deps.py`, which creates a virtualenv at
//! Tauri's `app_cache_dir` and installs paddleocr / paddlepaddle /
//! llama-cpp-python (or mlx-lm on macOS).  At runtime `python::interpreter`
//! resolves that venv's interpreter for every script invocation.
//!
//! This command exposes the venv's resolved interpreter path to the frontend
//! so it can render setup diagnostics.  It is *advisory only* — `ready` is
//! always `true` because the actual interpreter resolution happens at the
//! call site (it can pick up `RECEIPT_PYTHON`, an active `VIRTUAL_ENV`, an
//! ancestor `venv312/`, or the cache-dir venv) and we do not want to gate
//! the UI on a single one of those signals.

use crate::error::AppError;
use serde::Serialize;
use tauri::Manager;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PythonSetupStatus {
    /// Always `true` — kept for forwards compatibility with the previous
    /// bundled-runtime variant of this command.
    pub ready: bool,
    /// Best-effort path to the venv interpreter at `app_cache_dir/venv`.
    /// `None` if the user has not yet run `setup-python-deps.py` (the app
    /// will then fall through to system `python3` / `python` and surface the
    /// real failure when a script invocation fails).
    pub interpreter_path: Option<String>,
    /// Always `false` on every platform — Monioc no longer ships a
    /// bundled runtime, so no platform "requires" one.
    pub required: bool,
}

#[tauri::command]
pub fn check_python_env(app: tauri::AppHandle) -> Result<PythonSetupStatus, AppError> {
    let cache_dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| AppError::Path(e.to_string()))?;

    #[cfg(target_os = "windows")]
    let py = cache_dir.join("venv").join("Scripts").join("python.exe");
    #[cfg(not(target_os = "windows"))]
    let py = cache_dir.join("venv").join("bin").join("python3");

    let interpreter_path = if py.exists() {
        Some(py.to_string_lossy().into_owned())
    } else {
        None
    };

    Ok(PythonSetupStatus {
        ready: true,
        interpreter_path,
        required: false,
    })
}
