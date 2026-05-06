//! Detect the bundled Python runtime (Windows).
//!
//! On Windows the NSIS installer ships a fully self-contained Python 3.12
//! runtime with all AI dependencies pre-installed at
//! `<resource_dir>/python-runtime/`.  This module exposes a single read-only
//! command (`check_python_env`) so the frontend can verify the bundle landed
//! correctly and surface a clear error if it didn't.  No download or install
//! logic — that is handled by the build pipeline (see
//! `app/src-tauri/scripts/build-windows-runtime.ps1`).
//!
//! macOS and Linux are no-ops: those platforms use the user-managed venv at
//! Tauri's `app_cache_dir`, resolved by `python::interpreter`.

use crate::error::AppError;
use serde::Serialize;
#[cfg(target_os = "windows")]
use tauri::Manager;

/// Status of the bundled Python runtime.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PythonSetupStatus {
    /// True when the bundled `python.exe` is present.  On macOS and Linux
    /// this is always true (system Python / venv is the resolution path).
    pub ready: bool,
    /// Absolute path to the bundled interpreter, when present.
    pub interpreter_path: Option<String>,
    /// True only on platforms where a bundled runtime is expected (Windows).
    /// Frontends use this to know whether to surface a "missing runtime"
    /// diagnostic vs. simply trusting the system Python.
    pub required: bool,
}

/// Probe the bundled Python runtime location.  Always returns ready on
/// non-Windows targets.
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
        let py = app
            .path()
            .resource_dir()
            .map_err(|e| AppError::Path(e.to_string()))?
            .join("python-runtime")
            .join("python.exe");
        let ready = py.exists();
        Ok(PythonSetupStatus {
            ready,
            interpreter_path: if ready {
                Some(py.to_string_lossy().into_owned())
            } else {
                None
            },
            required: true,
        })
    }
}
