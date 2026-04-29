//! Miscellaneous commands: app version, image editing, storage management, and model checks.

use crate::error::AppError;
use crate::image_ops;
use serde::Serialize;
use tauri::Manager;

/// Summary of on-disk storage used by this application.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageInfo {
    /// Absolute path to the app data directory.
    pub app_data_dir: String,
    /// Total number of regular files under the app data directory.
    pub file_count: usize,
    /// Sum of all file sizes in bytes.
    pub total_size_bytes: u64,
    /// Size of the SQLite database files (`.sqlite3`, WAL, SHM).
    pub db_size_bytes: u64,
    /// Size of saved receipt images (`receipt-scans/`).
    pub receipt_images_bytes: u64,
    /// Size of temporary staged images (`receipt-staging/`).
    pub staging_bytes: u64,
    /// Size of downloaded AI models (`models/`).
    pub models_bytes: u64,
    /// Size of any other files not in the categories above.
    pub other_bytes: u64,
}

/// Return the application version from `Cargo.toml`.
#[tauri::command]
pub fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// Open the browser devtools for the calling webview window.
/// In release builds this is a no-op — the frontend guards the call with
/// `import.meta.env.DEV` so it will never be invoked in production.
#[tauri::command]
pub fn dev_open_devtools(window: tauri::WebviewWindow) {
    #[cfg(debug_assertions)]
    window.open_devtools();
}

/// Apply geometric and tonal edits to a receipt image and write the result as
/// a JPEG in `<app-data-dir>/receipt-staging/`.
///
/// Edit order: EXIF orientation → flip → rotate → crop → brightness → contrast.
///
/// # Arguments
///
/// * `source_path` - Absolute path to the source image (any supported format)
/// * `params`      - Crop, rotation, flip, brightness, and contrast settings
///
/// # Returns
///
/// Absolute path to the saved output JPEG.
#[tauri::command]
pub async fn edit_image(
    app: tauri::AppHandle,
    source_path: String,
    params: image_ops::ImageEditParams,
) -> Result<String, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        let src = std::path::Path::new(&source_path);

        let img = image::open(src)
            .map_err(|e| AppError::Processing(format!("Cannot open image: {e}")))?;

        // Normalise EXIF orientation so pixel space matches the browser's view.
        let img = image_ops::exif::correct_orientation(img, src);

        // Apply the deterministic edit chain.
        let img = image_ops::pipeline::EditPipeline { params: &params }.apply(img);

        image_ops::storage::save_jpeg(&app, img)
    })
    .await
    .map_err(|e| AppError::Processing(format!("Image edit task failed: {e}")))?
}

/// Return storage statistics for this application's data directory.
///
/// The directory walk runs on a blocking thread-pool thread so the Tauri IPC
/// thread is not stalled while the filesystem is read.
#[tauri::command]
pub async fn get_storage_info(app: tauri::AppHandle) -> Result<StorageInfo, AppError> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Path(e.to_string()))?;
    let dir_clone = dir.clone();
    let bd = tauri::async_runtime::spawn_blocking(move || crate::utils::dir_breakdown(&dir_clone))
        .await
        .map_err(|e| AppError::Processing(format!("Storage info task failed: {e}")))?;
    Ok(StorageInfo {
        app_data_dir: dir.to_string_lossy().into_owned(),
        file_count: bd.file_count,
        total_size_bytes: bd.total_bytes,
        db_size_bytes: bd.db_bytes,
        receipt_images_bytes: bd.receipt_scans_bytes,
        staging_bytes: bd.staging_bytes,
        models_bytes: bd.models_bytes,
        other_bytes: bd.other_bytes,
    })
}

/// Delete all files in `<app-data-dir>/receipt-staging/`.
///
/// Called by the Settings page (`SettingsPage.tsx`) to clear staged images
/// accumulated during receipt scanning and editing sessions.
/// The directory itself is removed and will be recreated on the next scan.
#[tauri::command]
pub fn clear_receipt_staging(app: tauri::AppHandle) -> Result<(), AppError> {
    let uploads_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Path(e.to_string()))?
        .join(image_ops::storage::RECEIPT_STAGING_DIR);
    if uploads_dir.exists() {
        std::fs::remove_dir_all(&uploads_dir)?;
    }
    Ok(())
}

/// Delete all saved receipt images from `<app-data-dir>/receipt-scans/`.
///
/// Database records are **not** affected — only the image files are removed.
/// Thumbnails and full-size images will no longer load after the call, but
/// all receipt metadata (items, dates, names) is preserved in SQLite.
#[tauri::command]
pub fn remove_receipt_images(app: tauri::AppHandle) -> Result<(), AppError> {
    let scans_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Path(e.to_string()))?
        .join(image_ops::storage::RECEIPT_SCANS_DIR);
    if scans_dir.exists() {
        std::fs::remove_dir_all(&scans_dir)?;
    }
    Ok(())
}

/// Open the app data directory in the system file manager.
#[tauri::command]
pub fn open_app_data_dir(app: tauri::AppHandle) -> Result<(), AppError> {
    use tauri_plugin_opener::OpenerExt;
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Path(e.to_string()))?;
    app.opener()
        .open_path(dir.to_string_lossy().as_ref(), None::<&str>)
        .map_err(|e| AppError::Processing(e.to_string()))
}

/// Remove all app-generated data — images (scans + staging), downloaded models,
/// and any other files in app-data-dir — leaving only the SQLite database
/// behind (which will be vacuumed and cleared of all rows).
///
/// Use this on the Settings page as a "factory reset / Remove All" action.
#[tauri::command]
pub async fn remove_all_app_data(app: tauri::AppHandle) -> Result<(), AppError> {
    use crate::db::DbState;
    use sqlx::Executor;

    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Path(e.to_string()))?;

    // Directories to wipe entirely.
    let dirs_to_remove = [
        image_ops::storage::RECEIPT_SCANS_DIR,
        image_ops::storage::RECEIPT_STAGING_DIR,
        "models",
    ];
    for sub in &dirs_to_remove {
        let path = dir.join(sub);
        if path.exists() {
            std::fs::remove_dir_all(&path)?;
        }
    }

    // Also clear any AI model cache used by the Python toolchain.
    // This removes PaddleOCR models from ~/.paddlex and LLM files from HuggingFace cache.
    remove_models(app.clone()).await?;

    // Truncate all data tables in the database so it looks freshly installed.
    let db_state = app.state::<DbState>();
    let pool = db_state.0.write().await;
    // image_library must be cleared first to satisfy the FK reference from
    // its `receipt_id` column before receipt_scans rows are removed.
    pool.execute("DELETE FROM image_library").await
        .map_err(|e| AppError::Database(e.to_string()))?;
    pool.execute("DELETE FROM receipt_scans").await
        .map_err(|e| AppError::Database(e.to_string()))?;
    pool.execute("DELETE FROM categories").await
        .map_err(|e| AppError::Database(e.to_string()))?;
    pool.execute("VACUUM").await
        .map_err(|e| AppError::Database(e.to_string()))?;

    Ok(())
}

// ── AI Model status ──────────────────────────────────────────────────────────

/// Status of local AI model availability.
#[derive(Debug, Clone, Serialize)]
pub struct ModelStatus {
    /// PaddleOCR text-recognition models cached locally.
    pub ocr: bool,
    /// LLM model (MLX / GGUF / ollama) cached locally.
    pub llm: bool,
}

/// Progress of an ongoing model download, polled from disk.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelDownloadProgress {
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub downloaded_files: u32,
    pub total_files: u32,
}

/// Holds the child process of an in-flight model download so it can be killed.
pub struct ModelDownloadState(pub std::sync::Mutex<Option<tauri_plugin_shell::process::CommandChild>>);

impl ModelDownloadState {
    pub fn new() -> Self {
        Self(std::sync::Mutex::new(None))
    }
}

/// Resolve the Python command and script path for `check_models.py`.
fn resolve_check_models_cmd(
    app: &tauri::AppHandle,
) -> Result<(String, String), AppError> {
    let script_path = app
        .path()
        .resource_dir()
        .map_err(|e| AppError::Path(e.to_string()))?
        .join("check_models.py");

    let script_str = script_path
        .to_str()
        .ok_or_else(|| AppError::Path("Script path contains invalid UTF-8".into()))?
        .to_string();

    let app_cache_dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| AppError::Path(e.to_string()))?;
    let python_cmd = crate::python::resolve(&script_path, Some(&app_cache_dir));

    Ok((python_cmd, script_str))
}

/// Run `check_models.py` with the given args – captures stdout JSON, streams
/// stderr progress, and optionally stores the child process for cancellation.
async fn run_check_models_script(
    app: &tauri::AppHandle,
    extra_args: &[&str],
    store_child: bool,
) -> Result<serde_json::Value, AppError> {
    use tauri_plugin_shell::process::CommandEvent;
    use tauri_plugin_shell::ShellExt;

    let (python_cmd, script_str) = resolve_check_models_cmd(app)?;

    let mut args = vec![script_str];
    for a in extra_args {
        args.push(a.to_string());
    }

    let (mut rx, child) = app
        .shell()
        .command(&python_cmd)
        .args(args.iter().map(|s| s.as_str()).collect::<Vec<_>>())
        .spawn()
        .map_err(|e| AppError::Processing(e.to_string()))?;

    // Store the child so it can be cancelled mid-flight.
    if store_child {
        if let Ok(mut guard) = app.state::<ModelDownloadState>().0.lock() {
            *guard = Some(child);
        }
    }

    let mut stdout_bytes: Vec<u8> = Vec::new();
    let mut stderr_bytes: Vec<u8> = Vec::new();
    let mut exit_code: Option<i32> = None;

    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(bytes) => stdout_bytes.extend_from_slice(&bytes),
            CommandEvent::Stderr(bytes) => {
                stderr_bytes.extend_from_slice(&bytes);
                if let Ok(text) = std::str::from_utf8(&bytes) {
                    for raw_line in text.lines() {
                        let trimmed = raw_line.trim();
                        if trimmed.is_empty() {
                            continue;
                        }
                        eprintln!("[check_models.py] {trimmed}");
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

    // Clear child from state once the process exits.
    if store_child {
        if let Ok(mut guard) = app.state::<ModelDownloadState>().0.lock() {
            *guard = None;
        }
    }

    let stdout = String::from_utf8_lossy(&stdout_bytes);

    if exit_code != Some(0) {
        let stderr = String::from_utf8_lossy(&stderr_bytes);
        return Err(AppError::Processing(format!(
            "Model check failed: {stderr}"
        )));
    }

    serde_json::from_str(stdout.trim())
        .map_err(|e| AppError::Processing(format!("Invalid model status JSON: {e}")))
}

/// Check whether AI models (OCR + LLM) are available locally.
#[tauri::command]
pub async fn check_model_status(app: tauri::AppHandle) -> Result<ModelStatus, AppError> {
    let parsed = run_check_models_script(&app, &[], false).await?;
    Ok(ModelStatus {
        ocr: parsed.get("ocr").and_then(|v| v.as_bool()).unwrap_or(false),
        llm: parsed.get("llm").and_then(|v| v.as_bool()).unwrap_or(false),
    })
}

/// Download any missing AI models. Streams progress via `model-download-progress` events.
/// The child process is stored in `ModelDownloadState` so it can be cancelled.
#[tauri::command]
pub async fn download_models(app: tauri::AppHandle) -> Result<ModelStatus, AppError> {
    let parsed = run_check_models_script(&app, &["--download"], true).await?;
    Ok(ModelStatus {
        ocr: parsed.get("ocr").and_then(|v| v.as_bool()).unwrap_or(false),
        llm: parsed.get("llm").and_then(|v| v.as_bool()).unwrap_or(false),
    })
}

/// Kill the currently-running model download process, if any.
#[tauri::command]
pub async fn cancel_model_download(
    state: tauri::State<'_, ModelDownloadState>,
) -> Result<(), AppError> {
    let child = state.0
        .lock()
        .map_err(|_| AppError::Processing("model download state lock poisoned".into()))?
        .take();
    if let Some(child) = child {
        child.kill().map_err(|e| AppError::Processing(e.to_string()))?;
    }
    Ok(())
}

/// Poll on-disk progress of an in-flight model download.
#[tauri::command]
pub async fn model_download_progress(app: tauri::AppHandle) -> Result<ModelDownloadProgress, AppError> {
    let parsed = run_check_models_script(&app, &["--progress"], false).await?;
    Ok(ModelDownloadProgress {
        downloaded_bytes: parsed.get("downloadedBytes").and_then(|v| v.as_u64()).unwrap_or(0),
        total_bytes: parsed.get("totalBytes").and_then(|v| v.as_u64()).unwrap_or(0),
        downloaded_files: parsed.get("downloadedFiles").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
        total_files: parsed.get("totalFiles").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
    })
}

/// Remove all cached AI models (OCR + LLM).
#[tauri::command]
pub async fn remove_models(app: tauri::AppHandle) -> Result<(), AppError> {
    run_check_models_script(&app, &["--remove"], false).await?;
    Ok(())
}
