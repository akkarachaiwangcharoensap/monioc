//! Receipt scan CRUD operations and data types.

use serde::{Deserialize, Serialize};
use sqlx::{Row, SqlitePool};

use crate::error::AppError;

// ── Error message constants ───────────────────────────────────────────────────

const RECEIPT_NOT_FOUND: &str = "Receipt scan not found";

// ── Data types ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReceiptRow {
    pub name: String,
    pub price: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReceiptData {
    pub rows: Vec<ReceiptRow>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReceiptScanRecord {
    pub id: i64,
    pub display_name: Option<String>,
    pub image_path: Option<String>,
    pub processed_image_path: Option<String>,
    pub data: ReceiptData,
    pub created_at: String,
    pub updated_at: String,
    pub purchase_date: Option<String>,
}

// ── SQL constants ─────────────────────────────────────────────────────────────

const SELECT_COLS: &str =
    "SELECT id, display_name, image_path, processed_image_path, rows_json,
            created_at, updated_at, purchase_date
     FROM receipt_scans";

const INSERT_SQL: &str =
    "INSERT INTO receipt_scans (image_path, processed_image_path, rows_json, display_name)
     VALUES (?, ?, ?, ?)";

const UPDATE_SQL: &str =
    "UPDATE receipt_scans
     SET image_path = ?,
         processed_image_path = ?,
         rows_json = ?,
         updated_at = datetime('now')
     WHERE id = ?";

const RENAME_SQL: &str =
    "UPDATE receipt_scans
     SET display_name = ?,
         updated_at = datetime('now')
     WHERE id = ?";

const UPDATE_PURCHASE_DATE_SQL: &str =
    "UPDATE receipt_scans
     SET purchase_date = ?,
         updated_at = datetime('now')
     WHERE id = ?";

const UPDATE_CREATED_AT_SQL: &str =
    "UPDATE receipt_scans
     SET created_at = ?,
         updated_at = datetime('now')
     WHERE id = ?";

const DELETE_SQL: &str = "DELETE FROM receipt_scans WHERE id = ?";

// ── Internal helpers ──────────────────────────────────────────────────────────

/// Return an error when a mutating query affected zero rows.
fn ensure_affected(affected: u64, id: i64) -> Result<(), AppError> {
    if affected == 0 {
        return Err(AppError::Database(format!("{RECEIPT_NOT_FOUND}: id={id}")));
    }
    Ok(())
}

fn map_row(row: &sqlx::sqlite::SqliteRow) -> Result<ReceiptScanRecord, AppError> {
    let rows_json: String = row
        .try_get("rows_json")
        .map_err(|e| AppError::Database(e.to_string()))?;

    let rows: Vec<ReceiptRow> = if rows_json.trim().is_empty() {
        Vec::new()
    } else {
        serde_json::from_str(&rows_json).map_err(AppError::Json)?
    };

    Ok(ReceiptScanRecord {
        id: row.try_get("id").map_err(|e| AppError::Database(e.to_string()))?,
        display_name: row
            .try_get("display_name")
            .map_err(|e| AppError::Database(e.to_string()))?,
        image_path: row
            .try_get("image_path")
            .map_err(|e| AppError::Database(e.to_string()))?,
        processed_image_path: row
            .try_get("processed_image_path")
            .map_err(|e| AppError::Database(e.to_string()))?,
        data: ReceiptData { rows },
        created_at: row
            .try_get("created_at")
            .map_err(|e| AppError::Database(e.to_string()))?,
        updated_at: row
            .try_get("updated_at")
            .map_err(|e| AppError::Database(e.to_string()))?,
        purchase_date: row
            .try_get("purchase_date")
            .map_err(|e| AppError::Database(e.to_string()))?,
    })
}

// ── Public CRUD API ───────────────────────────────────────────────────────────

pub async fn get_by_id(pool: &SqlitePool, id: i64) -> Result<ReceiptScanRecord, AppError> {
    let row = sqlx::query(&format!("{SELECT_COLS} WHERE id = ?"))
        .bind(id)
        .fetch_one(pool)
        .await
        .map_err(|e| match e {
            sqlx::Error::RowNotFound => {
                AppError::Database(format!("{RECEIPT_NOT_FOUND}: id={id}"))
            }
            e => AppError::Database(e.to_string()),
        })?;

    map_row(&row)
}

pub async fn save(
    pool: &SqlitePool,
    image_path: Option<String>,
    processed_image_path: Option<String>,
    data: &ReceiptData,
    display_name: Option<String>,
) -> Result<ReceiptScanRecord, AppError> {
    let rows_json = serde_json::to_string(&data.rows).map_err(AppError::Json)?;

    let id = sqlx::query(INSERT_SQL)
        .bind(&image_path)
        .bind(&processed_image_path)
        .bind(&rows_json)
        .bind(&display_name)
        .execute(pool)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?
        .last_insert_rowid();

    get_by_id(pool, id).await
}

pub async fn list(pool: &SqlitePool) -> Result<Vec<ReceiptScanRecord>, AppError> {
    let rows = sqlx::query(&format!("{SELECT_COLS} ORDER BY id DESC"))
        .fetch_all(pool)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    rows.iter().map(map_row).collect()
}

pub async fn update(
    pool: &SqlitePool,
    id: i64,
    image_path: Option<String>,
    processed_image_path: Option<String>,
    data: &ReceiptData,
) -> Result<ReceiptScanRecord, AppError> {
    let rows_json = serde_json::to_string(&data.rows).map_err(AppError::Json)?;

    let affected = sqlx::query(UPDATE_SQL)
        .bind(&image_path)
        .bind(&processed_image_path)
        .bind(&rows_json)
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?
        .rows_affected();

    ensure_affected(affected, id)?;

    get_by_id(pool, id).await
}

pub async fn delete(pool: &SqlitePool, id: i64) -> Result<(), AppError> {
    let affected = sqlx::query(DELETE_SQL)
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?
        .rows_affected();

    ensure_affected(affected, id)?;

    Ok(())
}

pub async fn rename(
    pool: &SqlitePool,
    id: i64,
    name: Option<String>,
) -> Result<ReceiptScanRecord, AppError> {
    let affected = sqlx::query(RENAME_SQL)
        .bind(&name)
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?
        .rows_affected();

    ensure_affected(affected, id)?;

    get_by_id(pool, id).await
}

pub async fn update_purchase_date(
    pool: &SqlitePool,
    id: i64,
    purchase_date: Option<String>,
) -> Result<ReceiptScanRecord, AppError> {
    let affected = sqlx::query(UPDATE_PURCHASE_DATE_SQL)
        .bind(&purchase_date)
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?
        .rows_affected();

    ensure_affected(affected, id)?;

    get_by_id(pool, id).await
}

pub async fn update_created_at(
    pool: &SqlitePool,
    id: i64,
    created_at: String,
) -> Result<ReceiptScanRecord, AppError> {
    let affected = sqlx::query(UPDATE_CREATED_AT_SQL)
        .bind(&created_at)
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?
        .rows_affected();

    ensure_affected(affected, id)?;

    get_by_id(pool, id).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::SqlitePool;

    /// Create an in-memory SQLite pool with the fully-migrated schema applied.
    ///
    /// Mirrors the final state produced by the `tauri-plugin-sql` migrations
    /// defined in `lib.rs`, allowing CRUD tests to run without a real app.
    async fn migrated_pool() -> SqlitePool {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        sqlx::raw_sql(
            "CREATE TABLE IF NOT EXISTS receipt_scans (
                id                   INTEGER PRIMARY KEY AUTOINCREMENT,
                display_name         TEXT,
                image_path           TEXT,
                processed_image_path TEXT,
                rows_json            TEXT NOT NULL DEFAULT '[]',
                created_at           TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at           TEXT NOT NULL DEFAULT (datetime('now')),
                purchase_date        TEXT
            );",
        )
        .execute(&pool)
        .await
        .unwrap();
        pool
    }

    #[tokio::test]
    async fn save_and_get_roundtrip() {
        let pool = migrated_pool().await;
        let data = ReceiptData {
            rows: vec![ReceiptRow { name: "Milk".into(), price: 3.99, category: None }],
        };
        let saved = save(&pool, None, None, &data, Some("My Receipt".into()))
            .await
            .unwrap();
        assert_eq!(saved.display_name.as_deref(), Some("My Receipt"));
        assert_eq!(saved.data.rows.len(), 1);

        let fetched = get_by_id(&pool, saved.id).await.unwrap();
        assert_eq!(fetched.data.rows[0].name, "Milk");
    }

    #[tokio::test]
    async fn save_with_paths_roundtrip() {
        let pool = migrated_pool().await;
        let data = ReceiptData { rows: vec![] };
        let saved = save(
            &pool,
            Some("/tmp/original.jpg".into()),
            Some("/data/processed.jpg".into()),
            &data,
            None,
        )
        .await
        .unwrap();
        assert_eq!(saved.image_path.as_deref(), Some("/tmp/original.jpg"));
        assert_eq!(saved.processed_image_path.as_deref(), Some("/data/processed.jpg"));
    }

    #[tokio::test]
    async fn list_returns_newest_first() {
        let pool = migrated_pool().await;
        let data = ReceiptData { rows: vec![] };
        let a = save(&pool, None, None, &data, Some("A".into())).await.unwrap();
        let b = save(&pool, None, None, &data, Some("B".into())).await.unwrap();
        let records = list(&pool).await.unwrap();
        assert_eq!(records[0].id, b.id);
        assert_eq!(records[1].id, a.id);
    }

    #[tokio::test]
    async fn update_changes_rows() {
        let pool = migrated_pool().await;
        let data = ReceiptData {
            rows: vec![ReceiptRow { name: "Old".into(), price: 1.0, category: None }],
        };
        let saved = save(&pool, None, None, &data, None).await.unwrap();

        let new_data = ReceiptData {
            rows: vec![ReceiptRow { name: "New".into(), price: 2.0, category: None }],
        };
        let updated = update(&pool, saved.id, None, None, &new_data).await.unwrap();
        assert_eq!(updated.data.rows[0].name, "New");
    }

    #[tokio::test]
    async fn update_not_found_returns_error() {
        let pool = migrated_pool().await;
        let result = update(&pool, 9999, None, None, &ReceiptData { rows: vec![] }).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn delete_removes_record() {
        let pool = migrated_pool().await;
        let data = ReceiptData { rows: vec![] };
        let saved = save(&pool, None, None, &data, None).await.unwrap();
        delete(&pool, saved.id).await.unwrap();
        assert!(get_by_id(&pool, saved.id).await.is_err());
    }

    #[tokio::test]
    async fn delete_nonexistent_returns_error() {
        let pool = migrated_pool().await;
        assert!(delete(&pool, 9999).await.is_err());
    }

    #[tokio::test]
    async fn rename_updates_display_name() {
        let pool = migrated_pool().await;
        let data = ReceiptData { rows: vec![] };
        let saved = save(&pool, None, None, &data, None).await.unwrap();
        let renamed = rename(&pool, saved.id, Some("New Name".into())).await.unwrap();
        assert_eq!(renamed.display_name.as_deref(), Some("New Name"));
    }

    #[tokio::test]
    async fn rename_to_none_clears_display_name() {
        let pool = migrated_pool().await;
        let data = ReceiptData { rows: vec![] };
        let saved =
            save(&pool, None, None, &data, Some("Original".into())).await.unwrap();
        let cleared = rename(&pool, saved.id, None).await.unwrap();
        assert!(cleared.display_name.is_none());
    }

    #[tokio::test]
    async fn rename_not_found_returns_error() {
        let pool = migrated_pool().await;
        assert!(rename(&pool, 9999, Some("X".into())).await.is_err());
    }
}
