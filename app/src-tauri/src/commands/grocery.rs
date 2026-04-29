//! Grocery data commands — serve Statistics Canada price data from the bundled
//! `grocery.sqlite3` via typed, paginated Tauri IPC commands.
//!
//! All commands are read-only; the grocery database is never mutated at
//! runtime.

use tauri::State;

use crate::db::grocery::{
    self, GroceryCategory, GroceryLocation, GroceryMetadata, PricePage, ProductPage,
};
use crate::db::GroceryDbState;
use crate::error::AppError;

/// Return metadata about the grocery dataset (record counts, date range).
#[tauri::command]
pub async fn get_grocery_metadata(
    state: State<'_, GroceryDbState>,
) -> Result<GroceryMetadata, AppError> {
    grocery::get_metadata(&state.0).await
}

/// Return all grocery categories with their product counts.
#[tauri::command]
pub async fn list_grocery_categories(
    state: State<'_, GroceryDbState>,
) -> Result<Vec<GroceryCategory>, AppError> {
    grocery::list_categories(&state.0).await
}

/// Return all locations present in the grocery dataset.
#[tauri::command]
pub async fn list_grocery_locations(
    state: State<'_, GroceryDbState>,
) -> Result<Vec<GroceryLocation>, AppError> {
    grocery::list_locations(&state.0).await
}

/// Return a paginated, optionally filtered list of grocery products.
///
/// # Arguments (IPC payload fields)
/// * `category`   – category name filter (empty string = all categories)
/// * `search`     – substring search on product name (empty = no search)
/// * `page`       – 1-based page index (default: 1)
/// * `page_size`  – records per page, clamped to \[1, 200\] (default: 50)
#[tauri::command]
pub async fn list_grocery_products(
    state: State<'_, GroceryDbState>,
    category: String,
    search: String,
    page: i64,
    page_size: i64,
) -> Result<ProductPage, AppError> {
    grocery::list_products(&state.0, &category, &search, page, page_size).await
}

/// Return paginated price history for a specific product.
///
/// # Arguments (IPC payload fields)
/// * `product_name` – exact product name (case-insensitive)
/// * `location`     – location filter (empty = all locations)
/// * `year`         – 4-digit year filter (empty = all years)
/// * `page`         – 1-based page index (default: 1)
/// * `page_size`    – records per page, clamped to \[1, 500\] (default: 100)
#[tauri::command]
pub async fn get_grocery_prices(
    state: State<'_, GroceryDbState>,
    product_name: String,
    location: String,
    year: String,
    page: i64,
    page_size: i64,
) -> Result<PricePage, AppError> {
    grocery::get_prices(&state.0, &product_name, &location, &year, page, page_size).await
}
