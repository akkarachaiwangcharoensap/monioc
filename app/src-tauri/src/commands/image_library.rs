//! Tauri command handlers for the image library.

use tauri::{AppHandle, Emitter, Manager, State};

use crate::db::connection::DbState;
use crate::db::image_library::{self, ImageLibraryEntry};
use crate::error::AppError;
use crate::image_ops;

/// Event name emitted after every image library mutation so the frontend
/// context can re-fetch the list.
pub const EVENT_LIBRARY_CHANGED: &str = "library:changed";

fn emit_changed(handle: &AppHandle) {
    let _ = handle.emit(EVENT_LIBRARY_CHANGED, ());
}

// ── Thumbnail generation ──────────────────────────────────────────────────────

/// Generate a small JPEG thumbnail (max 200px wide) and store it in the app
/// thumbnails directory.  Returns the destination path on success.
fn generate_thumbnail(app: &AppHandle, source_path: &str) -> Result<String, AppError> {
    use image::imageops::FilterType;

    let thumbs_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Path(e.to_string()))?
        .join("thumbnails");
    std::fs::create_dir_all(&thumbs_dir)?;

    // Hash the source path to namespace the thumbnail file (avoids collisions
    // and filesystem-unfriendly characters).  A millisecond timestamp is
    // appended so that re-uploading the same path produces a different URL,
    // preventing the WebView from serving a stale cached response.
    let hash = {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};
        let mut h = DefaultHasher::new();
        source_path.hash(&mut h);
        h.finish()
    };
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let dest = thumbs_dir.join(format!("{hash:016x}_{ts}.jpg"));

    let img = image::open(source_path)
        .map_err(|e| AppError::Image(format!("Failed to open image for thumbnail: {e}")))?;
    // Apply EXIF orientation so the thumbnail matches the device-corrected view.
    let img = image_ops::exif::correct_orientation(img, std::path::Path::new(source_path));
    let thumb = img.resize(200, 200, FilterType::Triangle);
    thumb
        .save(&dest)
        .map_err(|e| AppError::Image(format!("Failed to save thumbnail: {e}")))?;

    Ok(dest.to_string_lossy().to_string())
}

// ── File cleanup helpers ──────────────────────────────────────────────────────

/// Best-effort delete of a file on disk.  Missing files are silently ignored.
fn delete_file_if_exists(path: &str) {
    let p = std::path::Path::new(path);
    if p.exists() {
        let _ = std::fs::remove_file(p);
    }
}

/// Delete the thumbnail and staging files referenced by an image library entry.
fn cleanup_entry_files(entry: &ImageLibraryEntry) {
    if let Some(ref thumb) = entry.thumbnail_path {
        delete_file_if_exists(thumb);
    }
    if let Some(ref staging) = entry.staging_path {
        delete_file_if_exists(staging);
    }
}

// ── Commands ──────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn add_images_to_library(
    app: AppHandle,
    db: State<'_, DbState>,
    paths: Vec<String>,
) -> Result<Vec<ImageLibraryEntry>, AppError> {
    let pool = db.0.read().await;

    // Pre-fetch any existing thumbnail paths so they can be deleted from disk
    // after add_images clears them from the DB (re-upload scenario).  Without
    // this, the old {hash}_{ts}.jpg file would be orphaned on disk forever.
    let mut stale_thumbs: Vec<String> = Vec::new();
    for path in &paths {
        let canonical = std::fs::canonicalize(path)
            .unwrap_or_else(|_| std::path::PathBuf::from(path))
            .to_string_lossy()
            .to_string();
        if let Ok(Some(existing)) = image_library::get_by_path(&pool, &canonical).await {
            if let Some(thumb) = existing.thumbnail_path {
                stale_thumbs.push(thumb);
            }
        }
    }

    let mut entries = image_library::add_images(&pool, &paths).await?;

    // Delete stale thumbnail files now that the DB no longer references them.
    for old_thumb in &stale_thumbs {
        delete_file_if_exists(old_thumb);
    }

    // Generate thumbnails eagerly (best-effort — failures are non-fatal).
    for entry in &mut entries {
        match generate_thumbnail(&app, &entry.file_path) {
            Ok(thumb_path) => {
                let _ = image_library::update_thumbnail(&pool, entry.id, &thumb_path).await;
                entry.thumbnail_path = Some(thumb_path);
            }
            Err(e) => {
                eprintln!("Thumbnail generation failed for {}: {e}", entry.file_path);
            }
        }
    }

    emit_changed(&app);
    Ok(entries)
}

#[tauri::command]
pub async fn get_image_library(db: State<'_, DbState>) -> Result<Vec<ImageLibraryEntry>, AppError> {
    let pool = db.0.read().await;
    image_library::list(&pool).await
}

#[tauri::command]
pub async fn get_library_entry(
    db: State<'_, DbState>,
    id: i64,
) -> Result<Option<ImageLibraryEntry>, AppError> {
    let pool = db.0.read().await;
    image_library::get_by_id(&pool, id).await
}

#[tauri::command]
pub async fn remove_from_library(
    app: AppHandle,
    db: State<'_, DbState>,
    id: i64,
) -> Result<(), AppError> {
    let pool = db.0.read().await;
    // Fetch entry before deleting so we can clean up associated files.
    if let Some(entry) = image_library::get_by_id(&pool, id).await? {
        image_library::remove(&pool, id).await?;
        cleanup_entry_files(&entry);
    }
    emit_changed(&app);
    Ok(())
}

#[tauri::command]
pub async fn clear_library(app: AppHandle, db: State<'_, DbState>) -> Result<(), AppError> {
    let pool = db.0.read().await;
    // Fetch all entries before clearing so we can clean up associated files.
    let entries = image_library::list(&pool).await?;
    image_library::clear(&pool).await?;
    for entry in &entries {
        cleanup_entry_files(entry);
    }
    emit_changed(&app);
    Ok(())
}

#[tauri::command]
pub async fn link_image_to_receipt(
    app: AppHandle,
    db: State<'_, DbState>,
    id: i64,
    receipt_id: i64,
) -> Result<(), AppError> {
    let pool = db.0.read().await;
    image_library::link_to_receipt(&pool, id, receipt_id).await?;
    emit_changed(&app);
    Ok(())
}

#[tauri::command]
pub async fn update_library_entry_staging(
    app: AppHandle,
    db: State<'_, DbState>,
    id: i64,
    staging_path: Option<String>,
) -> Result<(), AppError> {
    let pool = db.0.read().await;
    image_library::update_staging_path(&pool, id, staging_path.as_deref()).await?;
    emit_changed(&app);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn delete_file_if_exists_removes_existing_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("thumb.jpg");
        std::fs::write(&path, b"fake").unwrap();
        assert!(path.exists());
        delete_file_if_exists(path.to_str().unwrap());
        assert!(!path.exists());
    }

    #[test]
    fn delete_file_if_exists_ignores_missing_file() {
        // Should not panic when the file doesn't exist.
        delete_file_if_exists("/tmp/nonexistent-image-library-test-file.jpg");
    }

    #[test]
    fn cleanup_entry_files_deletes_thumbnail_and_staging() {
        let dir = tempfile::tempdir().unwrap();
        let thumb = dir.path().join("thumb.jpg");
        let staging = dir.path().join("staged.jpg");
        std::fs::write(&thumb, b"t").unwrap();
        std::fs::write(&staging, b"s").unwrap();

        let entry = ImageLibraryEntry {
            id: 1,
            file_path: "/original.jpg".to_string(),
            added_at: "2025-01-01 00:00:00".to_string(),
            thumbnail_path: Some(thumb.to_string_lossy().to_string()),
            receipt_id: None,
            staging_path: Some(staging.to_string_lossy().to_string()),
        };

        cleanup_entry_files(&entry);
        assert!(!thumb.exists());
        assert!(!staging.exists());
    }

    #[test]
    fn cleanup_entry_files_handles_none_paths() {
        let entry = ImageLibraryEntry {
            id: 1,
            file_path: "/original.jpg".to_string(),
            added_at: "2025-01-01 00:00:00".to_string(),
            thumbnail_path: None,
            receipt_id: None,
            staging_path: None,
        };
        // Should not panic.
        cleanup_entry_files(&entry);
    }
}
