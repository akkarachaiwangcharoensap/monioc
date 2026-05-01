//! Resolve the Python interpreter path for running receipt-scanner scripts.
//!
//! The public entry point `resolve` reads real environment variables; the pure
//! inner `resolve_with_env` takes them as arguments so it can be unit-tested
//! without any filesystem side-effects.

use std::path::Path;

const MAX_ANCESTOR_DEPTH: usize = 8;
const PROJECT_VENV_DIRS: [&str; 2] = ["venv312", "venv"];

#[cfg(target_os = "windows")]
const VENV_PYTHON_BINS: [&str; 2] = ["Scripts/python.exe", "Scripts/python3.exe"];

#[cfg(not(target_os = "windows"))]
const VENV_PYTHON_BINS: [&str; 2] = ["bin/python3", "bin/python"];

/// Resolve the best Python interpreter for `script_path`.
///
/// Priority order:
///   1. `RECEIPT_PYTHON` env var (explicit override)
///   2. Active `VIRTUAL_ENV` interpreter
///   3. `venv312` / `venv` directories in ancestors of `script_path` (up to 8)
///   4. `<resource_dir>/python-runtime/python.exe` — Windows bundled runtime
///      shipped by the installer (CI extracts python-3.12-embed-amd64 here and
///      pre-installs all AI deps, so this is the production path on Windows)
///   5. `<app_cache_dir>/venv[312]/...` — installer-managed venv (macOS / Linux)
///   6. `"python3"` / `"python"` system fallback
///
/// In production the `.app` bundle places scripts at `Contents/Resources/`, whose
/// ancestor chain contains no virtualenv.  Pass the Tauri `app_cache_dir`
/// (`~/Library/Caches/<bundle-id>/` on macOS) so the installer-managed
/// venv is found at step 5.  On Windows pass `resource_dir` so the bundled
/// Python at step 4 is preferred over any system installation.
pub fn resolve(
    script_path: &Path,
    app_cache_dir: Option<&Path>,
    resource_dir: Option<&Path>,
) -> String {
    resolve_with_env(
        script_path,
        &std::env::var("RECEIPT_PYTHON").ok(),
        &std::env::var("VIRTUAL_ENV").ok(),
        app_cache_dir,
        resource_dir,
    )
}

/// Pure inner function: all env vars are injected, making it unit-testable
/// without touching the process environment or filesystem.
pub(crate) fn resolve_with_env(
    script_path: &Path,
    receipt_python: &Option<String>,
    virtual_env: &Option<String>,
    app_cache_dir: Option<&Path>,
    resource_dir: Option<&Path>,
) -> String {
    if let Some(explicit) = receipt_python.as_deref().filter(|s| !s.trim().is_empty()) {
        return explicit.to_string();
    }

    if let Some(venv) = virtual_env {
        for bin in VENV_PYTHON_BINS {
            let p = Path::new(venv).join(bin);
            if p.exists() {
                return p.to_string_lossy().into_owned();
            }
        }
    }

    // Tauri dev resources live under src-tauri/target/debug; walk ancestors to
    // find project virtualenvs.  Prefer venv312 — PaddleOCR is more stable on
    // Python 3.12 than 3.13.
    for ancestor in script_path.ancestors().take(MAX_ANCESTOR_DEPTH) {
        for venv_dir in PROJECT_VENV_DIRS {
            for bin in VENV_PYTHON_BINS {
                let p = ancestor.join(venv_dir).join(bin);
                if p.exists() {
                    return p.to_string_lossy().into_owned();
                }
            }
        }
    }

    // Windows production: the installer ships a self-contained Python runtime
    // (python-3.12-embed-amd64 with all AI deps pre-installed) inside the
    // resource directory.  Always prefer it over system Python so we never
    // fall through to a user install that's missing paddleocr / paddlepaddle.
    #[cfg(target_os = "windows")]
    if let Some(res_dir) = resource_dir {
        let p = res_dir.join("python-runtime").join("python.exe");
        if p.exists() {
            return p.to_string_lossy().into_owned();
        }
    }
    #[cfg(not(target_os = "windows"))]
    let _ = resource_dir;

    // Production fallback: check the Tauri app-cache directory for a venv
    // created by the installer / setup-python-deps script.
    // On macOS this is ~/Library/Caches/<bundle-id>/venv[312].
    if let Some(data_dir) = app_cache_dir {
        for venv_dir in PROJECT_VENV_DIRS {
            for bin in VENV_PYTHON_BINS {
                let p = data_dir.join(venv_dir).join(bin);
                if p.exists() {
                    return p.to_string_lossy().into_owned();
                }
            }
        }
    }

    if cfg!(target_os = "windows") { "python".to_string() } else { "python3".to_string() }
}

#[cfg(test)]
mod tests {
    use super::resolve_with_env;
    use std::path::Path;

    #[test]
    fn explicit_env_var_wins() {
        let result = resolve_with_env(
            Path::new("/app/script.py"),
            &Some("/custom/python".to_string()),
            &Some("/venv".to_string()),
            None,
            None,
        );
        assert_eq!(result, "/custom/python");
    }

    #[test]
    fn blank_explicit_falls_through_to_fallback() {
        let result = resolve_with_env(
            Path::new("/app/script.py"),
            &Some("   ".to_string()),
            &None,
            None,
            None,
        );
        let expected = if cfg!(target_os = "windows") { "python" } else { "python3" };
        assert_eq!(result, expected);
    }

    #[test]
    fn fallback_is_platform_python() {
        let result = resolve_with_env(
            Path::new("/nowhere/script.py"),
            &None,
            &None,
            None,
            None,
        );
        let expected = if cfg!(target_os = "windows") { "python" } else { "python3" };
        assert_eq!(result, expected);
    }
}
