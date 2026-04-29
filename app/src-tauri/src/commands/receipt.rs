//! Receipt scan Tauri commands: scan, save, list, update, delete, rename, export.

use crate::db::connection::DbState;
use crate::db::receipt::{ReceiptData, ReceiptScanRecord};
use crate::error::AppError;
use crate::events::ReceiptDeletedEvent;
use crate::image_ops;
use crate::job_queue::{Job, JobQueue};
use crate::services;
use tauri::{Emitter, Manager};

// ── Commands ──────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn save_receipt_scan(
    app: tauri::AppHandle,
    state: tauri::State<'_, DbState>,
    image_path: Option<String>,
    processed_image_path: Option<String>,
    data: ReceiptData,
    display_name: Option<String>,
) -> Result<ReceiptScanRecord, AppError> {
    let pool = state.0.read().await;
    let image_path = services::receipt::normalize_image_path(&app, image_path, None)?;
    let record =
        crate::db::receipt::save(&pool, image_path, processed_image_path, &data, display_name)
            .await?;
    let _ = app.emit(crate::events::names::RECEIPT_SAVED, &record);
    Ok(record)
}

#[tauri::command]
pub async fn list_receipt_scans(
    state: tauri::State<'_, DbState>,
) -> Result<Vec<ReceiptScanRecord>, AppError> {
    let pool = state.0.read().await;
    crate::db::receipt::list(&pool).await
}

#[tauri::command]
pub async fn update_receipt_scan(
    app: tauri::AppHandle,
    state: tauri::State<'_, DbState>,
    id: i64,
    image_path: Option<String>,
    processed_image_path: Option<String>,
    data: ReceiptData,
) -> Result<ReceiptScanRecord, AppError> {
    let pool = state.0.read().await;
    let existing = crate::db::receipt::get_by_id(&pool, id).await?;
    let record = services::receipt::update_and_cleanup(
        &app,
        &pool,
        id,
        image_path,
        processed_image_path,
        data,
        &existing,
    )
    .await?;
    let _ = app.emit(crate::events::names::RECEIPT_SAVED, &record);
    Ok(record)
}

#[tauri::command]
pub async fn delete_receipt_scan(
    app: tauri::AppHandle,
    state: tauri::State<'_, DbState>,
    id: i64,
) -> Result<(), AppError> {
    let pool = state.0.read().await;
    let record = crate::db::receipt::get_by_id(&pool, id).await?;
    let image_path = record.image_path.clone();
    let processed_image_path = record.processed_image_path.clone();
    crate::db::receipt::delete(&pool, id).await?;
    // The FK ON DELETE SET NULL clears receipt_id on linked image_library
    // entries. Check if any were affected and notify the frontend.
    let library_affected = crate::db::image_library::unlink_receipt(&pool, id)
        .await
        .unwrap_or(false);
    let _ = app.emit(
        crate::events::names::RECEIPT_DELETED,
        ReceiptDeletedEvent { id },
    );
    if library_affected {
        let _ = app.emit(crate::commands::image_library::EVENT_LIBRARY_CHANGED, ());
    }
    if let Some(path) = image_path {
        image_ops::storage::delete_app_managed_image(&app, &path)?;
    }
    if let Some(path) = processed_image_path {
        image_ops::storage::delete_app_managed_image(&app, &path)?;
    }
    Ok(())
}

#[tauri::command]
pub async fn rename_receipt_scan(
    app: tauri::AppHandle,
    state: tauri::State<'_, DbState>,
    id: i64,
    name: Option<String>,
) -> Result<ReceiptScanRecord, AppError> {
    let pool = state.0.read().await;
    let record = crate::db::receipt::rename(&pool, id, name).await?;
    let _ = app.emit(crate::events::names::RECEIPT_SAVED, &record);
    Ok(record)
}

#[tauri::command]
pub async fn update_receipt_purchase_date(
    app: tauri::AppHandle,
    state: tauri::State<'_, DbState>,
    id: i64,
    purchase_date: Option<String>,
) -> Result<ReceiptScanRecord, AppError> {
    let pool = state.0.read().await;
    let record = crate::db::receipt::update_purchase_date(&pool, id, purchase_date).await?;
    let _ = app.emit(crate::events::names::RECEIPT_SAVED, &record);
    Ok(record)
}

#[tauri::command]
pub async fn update_receipt_created_at(
    app: tauri::AppHandle,
    state: tauri::State<'_, DbState>,
    id: i64,
    created_at: String,
) -> Result<ReceiptScanRecord, AppError> {
    let pool = state.0.read().await;
    let record = crate::db::receipt::update_created_at(&pool, id, created_at).await?;
    let _ = app.emit(crate::events::names::RECEIPT_SAVED, &record);
    Ok(record)
}

#[tauri::command]
pub fn export_receipt_csv(data: ReceiptData, dest_path: String) -> Result<(), AppError> {
    services::receipt::export_csv(&data, &dest_path)
}

/// Submit a receipt scan job to the background queue.
///
/// Returns the `job_key` immediately. The caller subscribes to `job:status`
/// events to track progress. The pipeline runs: Scanning → Saving →
/// (optionally) Categorizing → Done.
#[tauri::command]
pub async fn scan_receipt(
    app: tauri::AppHandle,
    image_path: String,
    receipt_id: Option<i64>,
    with_auto_cat: bool,
    categories: Vec<String>,
) -> Result<String, AppError> {
    let queue = app.state::<JobQueue>();
    let job_key = image_path.clone();

    // Emit Queued immediately so the frontend can show it in the list.
    crate::events::emit_job_status(
        &app,
        &crate::events::JobStatusPayload {
            job_key: job_key.clone(),
            phase: crate::events::JobPhase::Queued,
            run_id: 0,
            record: None,
            error: None,
            seq: 0,
        },
    );

    queue
        .submit(Job::Scan {
            job_key: job_key.clone(),
            image_path,
            receipt_id,
            with_auto_cat,
            categories,
        })
        .await;

    Ok(job_key)
}

/// Submit a categorize-only job to the background queue.
///
/// Returns the `job_key` immediately.
#[tauri::command]
pub async fn infer_item_categories(
    app: tauri::AppHandle,
    receipt_id: i64,
    items: Vec<String>,
    categories: Vec<String>,
    data: ReceiptData,
) -> Result<String, AppError> {
    let queue = app.state::<JobQueue>();
    let job_key = receipt_id.to_string();

    crate::events::emit_job_status(
        &app,
        &crate::events::JobStatusPayload {
            job_key: job_key.clone(),
            phase: crate::events::JobPhase::Queued,
            run_id: 0,
            record: None,
            error: None,
            seq: 0,
        },
    );

    queue
        .submit(Job::Categorize {
            job_key: job_key.clone(),
            receipt_id,
            items,
            categories,
            data,
        })
        .await;

    Ok(job_key)
}

/// Cancel an in-flight or queued job by its key.
#[tauri::command]
pub async fn cancel_job(app: tauri::AppHandle, job_key: String) -> Result<(), AppError> {
    let queue = app.state::<JobQueue>();
    // cancel_now returns false only the *first* time cancel is called for a
    // job that is still sitting in the channel queue (not yet running).  In
    // that case the worker won't emit the Cancelled event until it dequeues
    // the job — which only happens after all preceding jobs finish.  We emit
    // it here immediately so the React UI updates without that delay.
    let was_running = queue.cancel_now(&job_key);
    if !was_running {
        crate::events::emit_job_status(
            &app,
            &crate::events::JobStatusPayload {
                job_key: job_key.clone(),
                phase: crate::events::JobPhase::Cancelled,
                // run_id=0 is consistent with the initial Queued sentinel;
                // seq=1 is the next logical event after seq=0 (Queued).
                run_id: 0,
                record: None,
                error: None,
                seq: 1,
            },
        );
    }
    // Enqueue a Cancel marker as a belt-and-suspenders fallback (handles the
    // rare race where cancel_now runs between register and the first checkpoint).
    queue.submit(Job::Cancel { job_key }).await;
    Ok(())
}

/// Parse the `{"categories": [...]}` JSON written to stdout by `categorize_items.py`.
///
/// Degrades gracefully on any parse failure or structural mismatch: missing
/// keys, non-JSON output, short arrays (padded with `"Other"`), and null /
/// non-string entries all fall back to `"Other"` rather than returning an error.
pub(crate) fn parse_categorize_output(stdout: &str, item_count: usize) -> Vec<String> {
    if item_count == 0 {
        return Vec::new();
    }
    let fallback = || vec!["Other".to_string(); item_count];
    let Ok(parsed) = serde_json::from_str::<serde_json::Value>(stdout.trim()) else {
        return fallback();
    };
    let Some(arr) = parsed.get("categories").and_then(|v| v.as_array()) else {
        return fallback();
    };
    let mut result: Vec<String> = arr
        .iter()
        .map(|v| v.as_str().unwrap_or("Other").to_string())
        .collect();
    // Pad if the LLM returned fewer entries than expected.
    result.resize(item_count, "Other".to_string());
    result
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::parse_categorize_output;

    // ── Happy-path parsing ────────────────────────────────────────────────────

    #[test]
    fn parses_valid_categories_array() {
        let stdout = r#"{"categories": ["Produce", "Dairy & Eggs", "Beverages"]}"#;
        assert_eq!(
            parse_categorize_output(stdout, 3),
            vec!["Produce", "Dairy & Eggs", "Beverages"],
        );
    }

    #[test]
    fn trims_surrounding_whitespace_and_newlines() {
        let stdout = "\n\n{\"categories\": [\"Meat & Seafood\"]}\n";
        assert_eq!(parse_categorize_output(stdout, 1), vec!["Meat & Seafood"]);
    }

    #[test]
    fn handles_single_item() {
        let stdout = r#"{"categories": ["Snacks & Candy"]}"#;
        assert_eq!(parse_categorize_output(stdout, 1), vec!["Snacks & Candy"]);
    }

    // ── Graceful degradation ──────────────────────────────────────────────────

    #[test]
    fn empty_item_count_returns_empty_vec() {
        // item_count == 0 must return empty regardless of stdout content.
        assert_eq!(
            parse_categorize_output(r#"{"categories": ["Produce"]}"#, 0),
            Vec::<String>::new()
        );
        assert_eq!(parse_categorize_output("", 0), Vec::<String>::new());
    }

    #[test]
    fn non_json_stdout_returns_all_other() {
        let result = parse_categorize_output("Model loading...", 3);
        assert_eq!(result, vec!["Other", "Other", "Other"]);
    }

    #[test]
    fn empty_stdout_returns_all_other() {
        assert_eq!(parse_categorize_output("", 2), vec!["Other", "Other"]);
    }

    #[test]
    fn whitespace_only_stdout_returns_all_other() {
        assert_eq!(
            parse_categorize_output("   \n  ", 2),
            vec!["Other", "Other"]
        );
    }

    #[test]
    fn missing_categories_key_returns_all_other() {
        // Python returned a different JSON shape.
        let stdout = r#"{"result": ["Produce", "Beverages"]}"#;
        assert_eq!(parse_categorize_output(stdout, 2), vec!["Other", "Other"],);
    }

    #[test]
    fn categories_value_is_not_array_returns_all_other() {
        let stdout = r#"{"categories": "Produce"}"#;
        assert_eq!(parse_categorize_output(stdout, 1), vec!["Other"]);
    }

    #[test]
    fn null_entries_replaced_with_other() {
        let stdout = r#"{"categories": [null, "Produce", null]}"#;
        assert_eq!(
            parse_categorize_output(stdout, 3),
            vec!["Other", "Produce", "Other"],
        );
    }

    #[test]
    fn short_array_padded_with_other() {
        // LLM returned only 1 category for 3 items.
        let stdout = r#"{"categories": ["Produce"]}"#;
        assert_eq!(
            parse_categorize_output(stdout, 3),
            vec!["Produce", "Other", "Other"],
        );
    }

    #[test]
    fn long_array_truncated_to_item_count() {
        // LLM hallucinated extra entries.
        let stdout =
            r#"{"categories": ["Produce", "Dairy & Eggs", "Beverages", "Snacks & Candy"]}"#;
        assert_eq!(
            parse_categorize_output(stdout, 2),
            vec!["Produce", "Dairy & Eggs"],
        );
    }

    #[test]
    fn empty_categories_array_pads_with_other() {
        let stdout = r#"{"categories": []}"#;
        assert_eq!(
            parse_categorize_output(stdout, 3),
            vec!["Other", "Other", "Other"],
        );
    }

    #[test]
    fn numeric_entries_replaced_with_other() {
        // JSON numbers are not `as_str()` → fall back to "Other".
        let stdout = r#"{"categories": [42, "Produce"]}"#;
        assert_eq!(parse_categorize_output(stdout, 2), vec!["Other", "Produce"],);
    }
}
