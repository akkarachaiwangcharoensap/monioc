//! Image library CRUD operations and data types.
//!
//! The `image_library` table provides persistent, tab-independent storage for
//! images staged for receipt scanning.  Images survive app restarts and tab
//! closes.  Each entry can optionally link to a receipt once scanned.

use serde::{Deserialize, Serialize};
use sqlx::{Row, SqlitePool};

use crate::error::AppError;

// ── Data types ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageLibraryEntry {
    pub id: i64,
    pub file_path: String,
    pub added_at: String,
    pub thumbnail_path: Option<String>,
    pub receipt_id: Option<i64>,
    pub staging_path: Option<String>,
}

// ── SQL constants ─────────────────────────────────────────────────────────────

const SELECT_COLS: &str = "SELECT id, file_path, added_at, thumbnail_path, receipt_id, staging_path
     FROM image_library";

const INSERT_SQL: &str = "INSERT OR IGNORE INTO image_library (file_path, added_at)
     VALUES (?, datetime('now'))";

// ── Query helpers ─────────────────────────────────────────────────────────────

fn map_row(row: &sqlx::sqlite::SqliteRow) -> Result<ImageLibraryEntry, AppError> {
    Ok(ImageLibraryEntry {
        id: row
            .try_get("id")
            .map_err(|e| AppError::Database(e.to_string()))?,
        file_path: row
            .try_get("file_path")
            .map_err(|e| AppError::Database(e.to_string()))?,
        added_at: row
            .try_get("added_at")
            .map_err(|e| AppError::Database(e.to_string()))?,
        thumbnail_path: row
            .try_get("thumbnail_path")
            .map_err(|e| AppError::Database(e.to_string()))?,
        receipt_id: row
            .try_get("receipt_id")
            .map_err(|e| AppError::Database(e.to_string()))?,
        staging_path: row
            .try_get("staging_path")
            .map_err(|e| AppError::Database(e.to_string()))?,
    })
}

// ── Public API ────────────────────────────────────────────────────────────────

/// List all entries ordered newest-first.
pub async fn list(pool: &SqlitePool) -> Result<Vec<ImageLibraryEntry>, AppError> {
    let rows = sqlx::query(&format!("{SELECT_COLS} ORDER BY added_at DESC"))
        .fetch_all(pool)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;
    rows.iter().map(map_row).collect()
}

/// Get a single entry by ID.
pub async fn get_by_id(pool: &SqlitePool, id: i64) -> Result<Option<ImageLibraryEntry>, AppError> {
    let row = sqlx::query(&format!("{SELECT_COLS} WHERE id = ?"))
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;
    row.as_ref().map(map_row).transpose()
}

/// Get a single entry by canonical file path.
pub async fn get_by_path(
    pool: &SqlitePool,
    path: &str,
) -> Result<Option<ImageLibraryEntry>, AppError> {
    let row = sqlx::query(&format!("{SELECT_COLS} WHERE file_path = ?"))
        .bind(path)
        .fetch_optional(pool)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;
    row.as_ref().map(map_row).transpose()
}

/// Add images to the library.  Paths are canonicalized before insert.
/// Duplicate file_path values are silently ignored (INSERT OR IGNORE).
/// Returns the full list of entries that were actually inserted.
pub async fn add_images(
    pool: &SqlitePool,
    paths: &[String],
) -> Result<Vec<ImageLibraryEntry>, AppError> {
    let mut inserted = Vec::new();
    for path in paths {
        let canonical = std::fs::canonicalize(path)
            .unwrap_or_else(|_| std::path::PathBuf::from(path))
            .to_string_lossy()
            .to_string();

        let result = sqlx::query(INSERT_SQL)
            .bind(&canonical)
            .execute(pool)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

        if result.rows_affected() > 0 {
            let id = result.last_insert_rowid();
            if let Some(entry) = get_by_id(pool, id).await? {
                inserted.push(entry);
            }
        } else {
            // Path already exists (INSERT OR IGNORE silently skipped it).
            // Return the existing entry so the caller can keep state consistent
            // instead of treating the path as a failed upload.
            if let Some(mut entry) = get_by_path(pool, &canonical).await? {
                // Clear any prior receipt link, staging path, and thumbnail so
                // a re-uploaded image re-enters the inbox as a fresh upload.
                // The receipt record itself is preserved; only the
                // image↔receipt association and cached images are cleared.
                let needs_clear = entry.receipt_id.is_some()
                    || entry.staging_path.is_some()
                    || entry.thumbnail_path.is_some();
                if needs_clear {
                    sqlx::query(
                        "UPDATE image_library SET receipt_id = NULL, staging_path = NULL, thumbnail_path = NULL WHERE id = ?",
                    )
                    .bind(entry.id)
                    .execute(pool)
                    .await
                    .map_err(|e| AppError::Database(e.to_string()))?;
                    entry.receipt_id = None;
                    entry.staging_path = None;
                    entry.thumbnail_path = None;
                }
                inserted.push(entry);
            }
        }
    }
    Ok(inserted)
}

/// Remove a single entry by ID.
pub async fn remove(pool: &SqlitePool, id: i64) -> Result<(), AppError> {
    sqlx::query("DELETE FROM image_library WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;
    Ok(())
}

/// Remove all entries.
pub async fn clear(pool: &SqlitePool) -> Result<(), AppError> {
    sqlx::query("DELETE FROM image_library")
        .execute(pool)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;
    Ok(())
}

/// Link an image to a receipt (after scan completion).
pub async fn link_to_receipt(pool: &SqlitePool, id: i64, receipt_id: i64) -> Result<(), AppError> {
    sqlx::query("UPDATE image_library SET receipt_id = ? WHERE id = ?")
        .bind(receipt_id)
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;
    Ok(())
}

/// Update the staging (crop edit) path for an image.
pub async fn update_staging_path(
    pool: &SqlitePool,
    id: i64,
    staging_path: Option<&str>,
) -> Result<(), AppError> {
    sqlx::query("UPDATE image_library SET staging_path = ? WHERE id = ?")
        .bind(staging_path)
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;
    Ok(())
}

/// Update the thumbnail path for an image.
pub async fn update_thumbnail(
    pool: &SqlitePool,
    id: i64,
    thumbnail_path: &str,
) -> Result<(), AppError> {
    sqlx::query("UPDATE image_library SET thumbnail_path = ? WHERE id = ?")
        .bind(thumbnail_path)
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;
    Ok(())
}

/// Clear receipt_id on all entries that reference the given receipt.
/// Called when a receipt is deleted so the library entry reverts to "unscanned".
pub async fn unlink_receipt(pool: &SqlitePool, receipt_id: i64) -> Result<bool, AppError> {
    let result = sqlx::query("UPDATE image_library SET receipt_id = NULL WHERE receipt_id = ?")
        .bind(receipt_id)
        .execute(pool)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;
    Ok(result.rows_affected() > 0)
}
