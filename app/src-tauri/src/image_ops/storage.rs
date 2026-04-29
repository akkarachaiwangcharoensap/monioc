//! Persist a processed receipt image as JPEG in the app's uploads directory.

use crate::error::AppError;
use image::DynamicImage;
use std::path::{Path, PathBuf};
use tauri::Manager;

/// Sub-directory inside `app_data_dir` for temporary staged receipt images.
pub const RECEIPT_STAGING_DIR: &str = "receipt-staging";
/// Sub-directory inside `app_data_dir` for canonical processed receipt images.
pub const RECEIPT_SCANS_DIR: &str = "receipt-scans";

fn timestamp_millis() -> Result<u128, AppError> {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| AppError::Processing(e.to_string()))
        .map(|d| d.as_millis())
}

fn uploads_dir(app: &tauri::AppHandle) -> Result<PathBuf, AppError> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Path(e.to_string()))?
        .join(RECEIPT_STAGING_DIR))
}

fn processed_dir(app: &tauri::AppHandle) -> Result<PathBuf, AppError> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Path(e.to_string()))?
        .join(RECEIPT_SCANS_DIR))
}

pub fn is_app_managed_image_path(app: &tauri::AppHandle, path: &str) -> Result<bool, AppError> {
    let candidate = Path::new(path);
    Ok(candidate.starts_with(uploads_dir(app)?) || candidate.starts_with(processed_dir(app)?))
}

pub fn delete_app_managed_image(app: &tauri::AppHandle, path: &str) -> Result<(), AppError> {
    if !is_app_managed_image_path(app, path)? {
        return Ok(());
    }

    match std::fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(err) => Err(AppError::Io(err)),
    }
}

/// Delete `path` if it lives in the `receipt-staging/` temporary directory.
///
/// Called after a successful OCR scan to reclaim the temporary edit file once
/// the Python pipeline has written the canonical image to `receipt-scans/`.
/// Silently succeeds when the path is not a staging file or the file is missing.
pub fn delete_staging_image(app: &tauri::AppHandle, path: &str) -> Result<(), AppError> {
    let candidate = std::path::Path::new(path);
    if !candidate.starts_with(uploads_dir(app)?) {
        return Ok(());
    }
    match std::fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(err) => Err(AppError::Io(err)),
    }
}

/// Save `img` as a timestamped JPEG in `<app-data-dir>/receipt-staging/`.
///
/// Returns the absolute path to the saved file.
pub fn save_jpeg(app: &tauri::AppHandle, img: DynamicImage) -> Result<String, AppError> {
    let uploads_dir = uploads_dir(app)?;

    std::fs::create_dir_all(&uploads_dir)?;

    let ts = timestamp_millis()?;

    let out_path = uploads_dir.join(format!("receipt-{ts}.jpg"));

    img.save_with_format(&out_path, image::ImageFormat::Jpeg)
        .map_err(|e| AppError::Processing(format!("Cannot save image: {e}")))?;

    Ok(out_path.to_string_lossy().to_string())
}
