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
///   4. `venv312` / `venv` inside `app_cache_dir` (production install location)
///   5. `"python3"` system fallback
///
/// In production the `.app` bundle places scripts at `Contents/Resources/`, whose
/// ancestor chain contains no virtualenv.  Pass the Tauri `app_cache_dir`
/// (`~/Library/Caches/<bundle-id>/` on macOS) so the installer-managed
/// venv is found at step 4.
pub fn resolve(script_path: &Path, app_cache_dir: Option<&Path>) -> String {
    resolve_with_env(
        script_path,
        &std::env::var("RECEIPT_PYTHON").ok(),
        &std::env::var("VIRTUAL_ENV").ok(),
        app_cache_dir,
    )
}

/// Pure inner function: all env vars are injected, making it unit-testable
/// without touching the process environment or filesystem.
pub(crate) fn resolve_with_env(
    script_path: &Path,
    receipt_python: &Option<String>,
    virtual_env: &Option<String>,
    app_cache_dir: Option<&Path>,
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

    // Production fallback: check the Tauri app-cache directory for a venv
    // created by the installer / setup-python-deps script.
    // On macOS this is ~/Library/Caches/<bundle-id>/venv[312].
    if let Some(data_dir) = app_cache_dir {
        // Windows: the first-launch bootstrap installs an isolated, embedded
        // Python at <app_cache_dir>/python/python.exe (no venv layer because
        // python-embed-amd64 doesn't support the venv module out of the box).
        #[cfg(target_os = "windows")]
        {
            let p = data_dir.join("python").join("python.exe");
            if p.exists() {
                return p.to_string_lossy().into_owned();
            }
        }

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
        );
        let expected = if cfg!(target_os = "windows") { "python" } else { "python3" };
        assert_eq!(result, expected);
    }

    #[test]
    fn fallback_is_platform_python() {
        let result = resolve_with_env(Path::new("/nowhere/script.py"), &None, &None, None);
        let expected = if cfg!(target_os = "windows") { "python" } else { "python3" };
        assert_eq!(result, expected);
    }
}
