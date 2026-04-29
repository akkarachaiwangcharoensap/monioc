//! Grocery reference database — read-only queries against the bundled
//! `grocery.sqlite3` produced from Statistics Canada data.
//!
//! The database is opened at startup from the app-data directory.  On first
//! launch, `lib.rs` copies the bundled resource file to app-data before
//! opening the connection.

use serde::{Deserialize, Serialize};
use sqlx::{Row, SqlitePool};

use crate::error::AppError;

// ── Public data types ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroceryCategory {
    pub id: i64,
    pub name: String,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroceryLocation {
    pub id: i64,
    pub location: String,
    pub city: String,
    pub province: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroceryProduct {
    pub id: i64,
    pub name: String,
    pub category: String,
    pub unit: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroceryPriceRecord {
    pub date: String,
    pub product_name: String,
    pub category: String,
    pub price_per_unit: f64,
    pub unit: String,
    pub location: String,
    pub city: String,
    pub province: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroceryMetadata {
    pub total_records: i64,
    pub total_products: i64,
    pub total_locations: i64,
    pub total_categories: i64,
    pub date_min: String,
    pub date_max: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductPage {
    pub products: Vec<GroceryProduct>,
    pub total: i64,
    pub page: i64,
    pub page_size: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PricePage {
    pub prices: Vec<GroceryPriceRecord>,
    pub total: i64,
    pub page: i64,
    pub page_size: i64,
}

// ── Managed state ─────────────────────────────────────────────────────────────

/// Tauri managed state for the read-only grocery SQLite connection pool.
pub struct GroceryDbState(pub SqlitePool);

// ── Query functions ───────────────────────────────────────────────────────────

/// Return metadata about the grocery dataset (record counts, date range).
pub async fn get_metadata(pool: &SqlitePool) -> Result<GroceryMetadata, AppError> {
    let row = sqlx::query(
        r"SELECT
              (SELECT COUNT(*) FROM grocery_prices)    AS total_records,
              (SELECT COUNT(*) FROM grocery_products)  AS total_products,
              (SELECT COUNT(*) FROM grocery_locations) AS total_locations,
              (SELECT COUNT(*) FROM grocery_categories) AS total_categories,
              (SELECT MIN(date) FROM grocery_prices)   AS date_min,
              (SELECT MAX(date) FROM grocery_prices)   AS date_max",
    )
    .fetch_one(pool)
    .await
    .map_err(|e| AppError::Database(e.to_string()))?;

    Ok(GroceryMetadata {
        total_records: row.try_get("total_records").unwrap_or(0),
        total_products: row.try_get("total_products").unwrap_or(0),
        total_locations: row.try_get("total_locations").unwrap_or(0),
        total_categories: row.try_get("total_categories").unwrap_or(0),
        date_min: row.try_get::<String, _>("date_min").unwrap_or_default(),
        date_max: row.try_get::<String, _>("date_max").unwrap_or_default(),
    })
}

/// Return all categories with a count of the products in each.
pub async fn list_categories(pool: &SqlitePool) -> Result<Vec<GroceryCategory>, AppError> {
    let rows = sqlx::query(
        r"SELECT
              c.id,
              c.name,
              COUNT(DISTINCT p.id) AS count
          FROM grocery_categories c
          LEFT JOIN grocery_products p ON p.category_id = c.id
          GROUP BY c.id, c.name
          ORDER BY count DESC",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| AppError::Database(e.to_string()))?;

    rows.iter()
        .map(|r| {
            Ok(GroceryCategory {
                id: r.try_get("id").map_err(|e| AppError::Database(e.to_string()))?,
                name: r.try_get("name").map_err(|e| AppError::Database(e.to_string()))?,
                count: r.try_get("count").map_err(|e| AppError::Database(e.to_string()))?,
            })
        })
        .collect()
}

/// Return all locations.
pub async fn list_locations(pool: &SqlitePool) -> Result<Vec<GroceryLocation>, AppError> {
    let rows = sqlx::query(
        "SELECT id, location, city, province FROM grocery_locations ORDER BY province, city",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| AppError::Database(e.to_string()))?;

    rows.iter()
        .map(|r| {
            Ok(GroceryLocation {
                id: r.try_get("id").map_err(|e| AppError::Database(e.to_string()))?,
                location: r.try_get("location").map_err(|e| AppError::Database(e.to_string()))?,
                city: r.try_get("city").map_err(|e| AppError::Database(e.to_string()))?,
                province: r.try_get("province").map_err(|e| AppError::Database(e.to_string()))?,
            })
        })
        .collect()
}

/// Return a paginated, optionally filtered list of products.
///
/// # Arguments
/// * `category` – filter by category name (empty string = all)
/// * `search`   – case-insensitive substring match on product name (empty = all)
/// * `page`     – 1-based page number
/// * `page_size` – number of products per page (clamped to 1–200)
pub async fn list_products(
    pool: &SqlitePool,
    category: &str,
    search: &str,
    page: i64,
    page_size: i64,
) -> Result<ProductPage, AppError> {
    let page_size = page_size.clamp(1, 200);
    let offset = (page - 1).max(0) * page_size;

    // Build a shared WHERE clause reused for both count and data queries.
    // Parameters are bound positionally in the same order for both queries.
    let (where_clause, has_cat, has_search) = build_product_where(category, search);

    let count_sql = format!(
        r"SELECT COUNT(*) AS n
          FROM grocery_products p
          JOIN grocery_categories c ON c.id = p.category_id
          {where_clause}"
    );

    let data_sql = format!(
        r"SELECT p.id, p.name, c.name AS category, p.unit
          FROM grocery_products p
          JOIN grocery_categories c ON c.id = p.category_id
          {where_clause}
          ORDER BY p.name
          LIMIT ? OFFSET ?"
    );

    let total: i64 = {
        let mut q = sqlx::query(&count_sql);
        if has_cat {
            q = q.bind(category);
        }
        if has_search {
            q = q.bind(format!("%{search}%"));
        }
        q.fetch_one(pool)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?
            .try_get("n")
            .map_err(|e| AppError::Database(e.to_string()))?
    };

    let rows = {
        let mut q = sqlx::query(&data_sql);
        if has_cat {
            q = q.bind(category);
        }
        if has_search {
            q = q.bind(format!("%{search}%"));
        }
        q.bind(page_size).bind(offset).fetch_all(pool).await
    }
    .map_err(|e| AppError::Database(e.to_string()))?;

    let products = rows
        .iter()
        .map(|r| {
            Ok(GroceryProduct {
                id: r.try_get("id").map_err(|e| AppError::Database(e.to_string()))?,
                name: r.try_get("name").map_err(|e| AppError::Database(e.to_string()))?,
                category: r.try_get("category").map_err(|e| AppError::Database(e.to_string()))?,
                unit: r.try_get("unit").map_err(|e| AppError::Database(e.to_string()))?,
            })
        })
        .collect::<Result<Vec<_>, AppError>>()?;

    Ok(ProductPage { products, total, page, page_size })
}

/// Return paginated price history for a specific product, optionally filtered
/// by location and/or year.
///
/// # Arguments
/// * `product_name` – exact product name (case-insensitive)
/// * `location`     – filter to this location string (empty = all)
/// * `year`         – 4-digit year string to filter (empty = all)
/// * `page`         – 1-based page number
/// * `page_size`    – records per page (clamped to 1–500)
pub async fn get_prices(
    pool: &SqlitePool,
    product_name: &str,
    location: &str,
    year: &str,
    page: i64,
    page_size: i64,
) -> Result<PricePage, AppError> {
    let page_size = page_size.clamp(1, 500);
    let offset = (page - 1).max(0) * page_size;

    let (where_clause, binds) = build_price_where(product_name, location, year);

    let count_sql = format!(
        r"SELECT COUNT(*) AS n
          FROM grocery_prices pr
          JOIN grocery_products p  ON p.id  = pr.product_id
          JOIN grocery_locations l ON l.id  = pr.location_id
          JOIN grocery_categories c ON c.id = p.category_id
          {where_clause}"
    );

    let data_sql = format!(
        r"SELECT pr.date, p.name AS product_name, c.name AS category,
                 pr.price_per_unit, p.unit,
                 l.location, l.city, l.province
          FROM grocery_prices pr
          JOIN grocery_products p  ON p.id  = pr.product_id
          JOIN grocery_locations l ON l.id  = pr.location_id
          JOIN grocery_categories c ON c.id = p.category_id
          {where_clause}
          ORDER BY pr.date ASC
          LIMIT ? OFFSET ?"
    );

    let total: i64 = {
        let mut q = sqlx::query(&count_sql);
        for b in &binds {
            q = q.bind(b.as_str());
        }
        q.fetch_one(pool)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?
            .try_get("n")
            .map_err(|e| AppError::Database(e.to_string()))?
    };

    let rows = {
        let mut q = sqlx::query(&data_sql);
        for b in &binds {
            q = q.bind(b.as_str());
        }
        q.bind(page_size).bind(offset).fetch_all(pool).await
    }
    .map_err(|e| AppError::Database(e.to_string()))?;

    let prices = rows
        .iter()
        .map(|r| {
            Ok(GroceryPriceRecord {
                date: r.try_get("date").map_err(|e| AppError::Database(e.to_string()))?,
                product_name: r.try_get("product_name").map_err(|e| AppError::Database(e.to_string()))?,
                category: r.try_get("category").map_err(|e| AppError::Database(e.to_string()))?,
                price_per_unit: r.try_get("price_per_unit").map_err(|e| AppError::Database(e.to_string()))?,
                unit: r.try_get("unit").map_err(|e| AppError::Database(e.to_string()))?,
                location: r.try_get("location").map_err(|e| AppError::Database(e.to_string()))?,
                city: r.try_get("city").map_err(|e| AppError::Database(e.to_string()))?,
                province: r.try_get("province").map_err(|e| AppError::Database(e.to_string()))?,
            })
        })
        .collect::<Result<Vec<_>, AppError>>()?;

    Ok(PricePage { prices, total, page, page_size })
}

// ── WHERE clause builders (safe, parameterized) ───────────────────────────────

fn build_product_where(category: &str, search: &str) -> (String, bool, bool) {
    let has_cat = !category.is_empty();
    let has_search = !search.is_empty();

    let mut conditions = Vec::new();
    if has_cat {
        conditions.push("c.name = ?");
    }
    if has_search {
        conditions.push("p.name LIKE ? COLLATE NOCASE");
    }

    let clause = if conditions.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", conditions.join(" AND "))
    };

    (clause, has_cat, has_search)
}

fn build_price_where(product_name: &str, location: &str, year: &str) -> (String, Vec<String>) {
    let mut conditions = Vec::new();
    let mut binds: Vec<String> = Vec::new();

    if !product_name.is_empty() {
        conditions.push("p.name = ? COLLATE NOCASE".to_string());
        binds.push(product_name.to_string());
    }
    if !location.is_empty() {
        conditions.push("l.location = ?".to_string());
        binds.push(location.to_string());
    }
    if !year.is_empty() {
        conditions.push("strftime('%Y', pr.date) = ?".to_string());
        binds.push(year.to_string());
    }

    let clause = if conditions.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", conditions.join(" AND "))
    };

    (clause, binds)
}
