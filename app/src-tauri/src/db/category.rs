//! Category CRUD operations and data types.

use serde::{Deserialize, Serialize};
use sqlx::{Row, SqlitePool};

use crate::error::AppError;

// ── Data types ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryRecord {
    pub id: i64,
    pub name: String,
    pub color: String,
    pub sort_order: i64,
}

// ── SQL constants ─────────────────────────────────────────────────────────────

const SELECT_COLS: &str =
    "SELECT id, name, color, sort_order FROM categories ORDER BY sort_order ASC";

const INSERT_SQL: &str = "INSERT INTO categories (name, color, sort_order) VALUES (?, ?, ?)";

const UPDATE_COLOR_SQL: &str = "UPDATE categories SET color = ? WHERE name = ?";

const RENAME_SQL: &str = "UPDATE categories SET name = ? WHERE name = ?";

const DELETE_SQL: &str = "DELETE FROM categories WHERE name = ?";

const DELETE_ALL_SQL: &str = "DELETE FROM categories";

// ── Public CRUD API ───────────────────────────────────────────────────────────

pub async fn list(pool: &SqlitePool) -> Result<Vec<CategoryRecord>, AppError> {
    let rows = sqlx::query(SELECT_COLS)
        .fetch_all(pool)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    rows.iter()
        .map(|row| {
            Ok(CategoryRecord {
                id: row
                    .try_get("id")
                    .map_err(|e| AppError::Database(e.to_string()))?,
                name: row
                    .try_get("name")
                    .map_err(|e| AppError::Database(e.to_string()))?,
                color: row
                    .try_get("color")
                    .map_err(|e| AppError::Database(e.to_string()))?,
                sort_order: row
                    .try_get("sort_order")
                    .map_err(|e| AppError::Database(e.to_string()))?,
            })
        })
        .collect()
}

pub async fn add(
    pool: &SqlitePool,
    name: &str,
    color: &str,
    sort_order: i64,
) -> Result<(), AppError> {
    sqlx::query(INSERT_SQL)
        .bind(name)
        .bind(color)
        .bind(sort_order)
        .execute(pool)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;
    Ok(())
}

pub async fn update_color(pool: &SqlitePool, name: &str, color: &str) -> Result<(), AppError> {
    let result = sqlx::query(UPDATE_COLOR_SQL)
        .bind(color)
        .bind(name)
        .execute(pool)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("Category not found: {name}")));
    }
    Ok(())
}

pub async fn rename(pool: &SqlitePool, old_name: &str, new_name: &str) -> Result<(), AppError> {
    let result = sqlx::query(RENAME_SQL)
        .bind(new_name)
        .bind(old_name)
        .execute(pool)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound(format!(
            "Category not found: {old_name}"
        )));
    }
    Ok(())
}

pub async fn delete(pool: &SqlitePool, name: &str) -> Result<(), AppError> {
    let result = sqlx::query(DELETE_SQL)
        .bind(name)
        .execute(pool)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("Category not found: {name}")));
    }
    Ok(())
}

pub async fn replace_all(
    pool: &SqlitePool,
    categories: &[(String, String, i64)],
) -> Result<(), AppError> {
    let mut tx = pool
        .begin()
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    sqlx::query(DELETE_ALL_SQL)
        .execute(&mut *tx)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    for (name, color, sort_order) in categories {
        sqlx::query(INSERT_SQL)
            .bind(name)
            .bind(color)
            .bind(sort_order)
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;
    }

    tx.commit()
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;
    Ok(())
}

pub async fn update_order(pool: &SqlitePool, ordered_names: &[String]) -> Result<(), AppError> {
    let mut tx = pool
        .begin()
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    for (index, name) in ordered_names.iter().enumerate() {
        sqlx::query("UPDATE categories SET sort_order = ? WHERE name = ?")
            .bind(index as i64)
            .bind(name)
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;
    }

    tx.commit()
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::SqlitePool;

    async fn migrated_pool() -> SqlitePool {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        sqlx::raw_sql(
            "CREATE TABLE IF NOT EXISTS categories (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                name       TEXT NOT NULL UNIQUE,
                color      TEXT NOT NULL DEFAULT '#888888',
                sort_order INTEGER NOT NULL DEFAULT 0
            );",
        )
        .execute(&pool)
        .await
        .unwrap();
        pool
    }

    #[tokio::test]
    async fn add_and_list_roundtrip() {
        let pool = migrated_pool().await;
        add(&pool, "Produce", "#22c55e", 0).await.unwrap();
        add(&pool, "Dairy", "#3b82f6", 1).await.unwrap();
        let cats = list(&pool).await.unwrap();
        assert_eq!(cats.len(), 2);
        assert_eq!(cats[0].name, "Produce");
        assert_eq!(cats[0].color, "#22c55e");
        assert_eq!(cats[1].name, "Dairy");
    }

    #[tokio::test]
    async fn rename_updates_name() {
        let pool = migrated_pool().await;
        add(&pool, "Produce", "#22c55e", 0).await.unwrap();
        rename(&pool, "Produce", "Vegetables").await.unwrap();
        let cats = list(&pool).await.unwrap();
        assert_eq!(cats[0].name, "Vegetables");
    }

    #[tokio::test]
    async fn rename_nonexistent_returns_not_found() {
        let pool = migrated_pool().await;
        let err = rename(&pool, "Ghost", "Whatever").await.unwrap_err();
        assert!(
            err.to_string().contains("not found"),
            "expected NotFound, got: {err}"
        );
    }

    #[tokio::test]
    async fn update_color_changes_color() {
        let pool = migrated_pool().await;
        add(&pool, "Produce", "#22c55e", 0).await.unwrap();
        update_color(&pool, "Produce", "#ff0000").await.unwrap();
        let cats = list(&pool).await.unwrap();
        assert_eq!(cats[0].color, "#ff0000");
    }

    #[tokio::test]
    async fn update_color_nonexistent_returns_not_found() {
        let pool = migrated_pool().await;
        let err = update_color(&pool, "Ghost", "#ff0000").await.unwrap_err();
        assert!(
            err.to_string().contains("not found"),
            "expected NotFound, got: {err}"
        );
    }

    #[tokio::test]
    async fn delete_removes_category() {
        let pool = migrated_pool().await;
        add(&pool, "Produce", "#22c55e", 0).await.unwrap();
        delete(&pool, "Produce").await.unwrap();
        let cats = list(&pool).await.unwrap();
        assert!(cats.is_empty());
    }

    #[tokio::test]
    async fn delete_nonexistent_returns_not_found() {
        let pool = migrated_pool().await;
        let err = delete(&pool, "Ghost").await.unwrap_err();
        assert!(
            err.to_string().contains("not found"),
            "expected NotFound, got: {err}"
        );
    }

    #[tokio::test]
    async fn replace_all_replaces_categories() {
        let pool = migrated_pool().await;
        add(&pool, "Old", "#000", 0).await.unwrap();
        let new_cats = vec![
            ("A".to_string(), "#aaa".to_string(), 0),
            ("B".to_string(), "#bbb".to_string(), 1),
        ];
        replace_all(&pool, &new_cats).await.unwrap();
        let cats = list(&pool).await.unwrap();
        assert_eq!(cats.len(), 2);
        assert_eq!(cats[0].name, "A");
        assert_eq!(cats[1].name, "B");
    }

    #[tokio::test]
    async fn update_order_reorders_categories() {
        let pool = migrated_pool().await;
        add(&pool, "C", "#ccc", 0).await.unwrap();
        add(&pool, "A", "#aaa", 1).await.unwrap();
        add(&pool, "B", "#bbb", 2).await.unwrap();
        update_order(&pool, &["A".into(), "B".into(), "C".into()])
            .await
            .unwrap();
        let cats = list(&pool).await.unwrap();
        assert_eq!(cats[0].name, "A");
        assert_eq!(cats[1].name, "B");
        assert_eq!(cats[2].name, "C");
    }
}
