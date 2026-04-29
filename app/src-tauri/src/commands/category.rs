//! Category management Tauri commands.

use crate::db::category::CategoryRecord;
use crate::db::connection::DbState;
use crate::error::AppError;
use crate::events::emit_category_changed;
use serde::Deserialize;
use tauri::AppHandle;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryInput {
    pub name: String,
    pub color: String,
    pub sort_order: i64,
}

#[tauri::command]
pub async fn list_categories(
    state: tauri::State<'_, DbState>,
) -> Result<Vec<CategoryRecord>, AppError> {
    let pool = state.0.read().await;
    crate::db::category::list(&pool).await
}

#[tauri::command]
pub async fn save_categories(
    app: AppHandle,
    state: tauri::State<'_, DbState>,
    categories: Vec<CategoryInput>,
) -> Result<(), AppError> {
    let tuples: Vec<(String, String, i64)> = categories
        .into_iter()
        .map(|c| (c.name, c.color, c.sort_order))
        .collect();
    let pool = state.0.read().await;
    crate::db::category::replace_all(&pool, &tuples).await?;
    emit_category_changed(&app);
    Ok(())
}

#[tauri::command]
pub async fn update_category_color(
    app: AppHandle,
    state: tauri::State<'_, DbState>,
    name: String,
    color: String,
) -> Result<(), AppError> {
    let pool = state.0.read().await;
    crate::db::category::update_color(&pool, &name, &color).await?;
    emit_category_changed(&app);
    Ok(())
}

#[tauri::command]
pub async fn rename_category(
    app: AppHandle,
    state: tauri::State<'_, DbState>,
    old_name: String,
    new_name: String,
) -> Result<(), AppError> {
    let pool = state.0.read().await;
    crate::db::category::rename(&pool, &old_name, &new_name).await?;
    emit_category_changed(&app);
    Ok(())
}

#[tauri::command]
pub async fn delete_category(
    app: AppHandle,
    state: tauri::State<'_, DbState>,
    name: String,
) -> Result<(), AppError> {
    let pool = state.0.read().await;
    crate::db::category::delete(&pool, &name).await?;
    emit_category_changed(&app);
    Ok(())
}

#[tauri::command]
pub async fn add_category(
    app: AppHandle,
    state: tauri::State<'_, DbState>,
    name: String,
    color: String,
    sort_order: i64,
) -> Result<(), AppError> {
    let pool = state.0.read().await;
    crate::db::category::add(&pool, &name, &color, sort_order).await?;
    emit_category_changed(&app);
    Ok(())
}

#[tauri::command]
pub async fn update_category_order(
    app: AppHandle,
    state: tauri::State<'_, DbState>,
    ordered_names: Vec<String>,
) -> Result<(), AppError> {
    let pool = state.0.read().await;
    crate::db::category::update_order(&pool, &ordered_names).await?;
    emit_category_changed(&app);
    Ok(())
}
