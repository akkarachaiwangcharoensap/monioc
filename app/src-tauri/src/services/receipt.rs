//! Business logic for receipt operations.
//!
//! This layer sits between Tauri commands and the database/image_ops layers.
//! It owns path-normalisation, file-cleanup, and CSV-export logic so that
//! commands remain thin glue and the logic is testable without Tauri state.

use crate::db::receipt::{ReceiptData, ReceiptScanRecord};
use crate::error::AppError;
use crate::image_ops;

// ── CSV constants ─────────────────────────────────────────────────────────────

/// UTF-8 BOM prefix written at the start of every exported CSV so Excel /
/// Numbers detect the encoding automatically.
const CSV_BOM: &str = "\u{FEFF}";
const CSV_HEADER: &str = "Name,Price";

// ── Path helpers ──────────────────────────────────────────────────────────────

/// Normalise an incoming image path for persistence.
///
/// - If `incoming_path` is `None`, returns `None`.
/// - If the path is unchanged from the existing record, returns it as-is.
/// - If the path is already inside an app-managed directory, returns it as-is.
/// - Otherwise returns it verbatim (external source file; tracked for identity).
pub fn normalize_image_path(
    app: &tauri::AppHandle,
    incoming_path: Option<String>,
    existing_path: Option<&str>,
) -> Result<Option<String>, AppError> {
    let Some(path) = incoming_path else {
        return Ok(None);
    };
    if existing_path == Some(path.as_str()) {
        return Ok(Some(path));
    }
    if image_ops::storage::is_app_managed_image_path(app, &path)? {
        return Ok(Some(path));
    }
    Ok(Some(path))
}

/// Delete an app-managed file if it has been replaced by a new path.
///
/// The file is only deleted when:
/// 1. `old_path` is `Some`.
/// 2. `old_path` differs from both `next_image_path` and `next_processed_image_path`.
pub fn cleanup_replaced_file(
    app: &tauri::AppHandle,
    old_path: Option<&str>,
    next_image_path: Option<&str>,
    next_processed_image_path: Option<&str>,
) -> Result<(), AppError> {
    let Some(old_path) = old_path else {
        return Ok(());
    };
    if Some(old_path) == next_image_path || Some(old_path) == next_processed_image_path {
        return Ok(());
    }
    image_ops::storage::delete_app_managed_image(app, old_path)
}

// ── CSV export ────────────────────────────────────────────────────────────────

/// Generate an RFC 4180 CSV file from receipt data and write it to `dest_path`.
///
/// A UTF-8 BOM is prepended so the file opens correctly in Excel / Numbers.
pub fn export_csv(data: &ReceiptData, dest_path: &str) -> Result<(), AppError> {
    fn escape(v: &str) -> String {
        if v.contains(',') || v.contains('"') || v.contains('\n') {
            format!("\"{}\"", v.replace('"', "\"\""))
        } else {
            v.to_string()
        }
    }
    let mut lines: Vec<String> = vec![format!("{CSV_BOM}{CSV_HEADER}")];
    for row in &data.rows {
        lines.push(format!("{},{:.2}", escape(&row.name), row.price));
    }
    let csv = lines.join("\n");
    std::fs::write(dest_path, csv)?;
    Ok(())
}

// ── Update helper ─────────────────────────────────────────────────────────────

/// Update a receipt record and clean up any replaced app-managed files.
pub async fn update_and_cleanup(
    app: &tauri::AppHandle,
    pool: &sqlx::SqlitePool,
    id: i64,
    image_path: Option<String>,
    processed_image_path: Option<String>,
    data: ReceiptData,
    existing: &ReceiptScanRecord,
) -> Result<ReceiptScanRecord, AppError> {
    let image_path = normalize_image_path(app, image_path, existing.image_path.as_deref())?;
    let updated =
        crate::db::receipt::update(pool, id, image_path, processed_image_path, &data).await?;

    cleanup_replaced_file(
        app,
        existing.image_path.as_deref(),
        updated.image_path.as_deref(),
        updated.processed_image_path.as_deref(),
    )?;
    cleanup_replaced_file(
        app,
        existing.processed_image_path.as_deref(),
        updated.image_path.as_deref(),
        updated.processed_image_path.as_deref(),
    )?;

    Ok(updated)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::receipt::ReceiptRow;

    #[test]
    fn export_csv_basic() {
        let dir = std::env::temp_dir();
        let path = dir.join("test_receipt_export.csv");
        let data = ReceiptData {
            rows: vec![
                ReceiptRow { name: "Milk".into(), price: 3.99, category: None },
                ReceiptRow { name: "Bread".into(), price: 2.49, category: None },
            ],
        };
        export_csv(&data, path.to_str().unwrap()).unwrap();
        let content = std::fs::read_to_string(&path).unwrap();
        std::fs::remove_file(&path).ok();

        assert!(content.starts_with('\u{FEFF}'));
        assert!(content.contains("Milk,3.99"));
        assert!(content.contains("Bread,2.49"));
        assert!(content.contains("Name,Price"));
    }

    #[test]
    fn export_csv_escapes_commas_and_quotes() {
        let dir = std::env::temp_dir();
        let path = dir.join("test_receipt_escape.csv");
        let data = ReceiptData {
            rows: vec![ReceiptRow {
                name: "Say \"Hello\", World".into(),
                price: 1.00,
                category: None,
            }],
        };
        export_csv(&data, path.to_str().unwrap()).unwrap();
        let content = std::fs::read_to_string(&path).unwrap();
        std::fs::remove_file(&path).ok();

        assert!(content.contains("\"Say \"\"Hello\"\", World\""));
    }

    #[test]
    fn export_csv_empty_rows() {
        let dir = std::env::temp_dir();
        let path = dir.join("test_receipt_empty.csv");
        let data = ReceiptData { rows: vec![] };
        export_csv(&data, path.to_str().unwrap()).unwrap();
        let content = std::fs::read_to_string(&path).unwrap();
        std::fs::remove_file(&path).ok();

        let lines: Vec<&str> = content.trim_start_matches('\u{FEFF}').lines().collect();
        assert_eq!(lines.len(), 1);
        assert_eq!(lines[0], "Name,Price");
    }

    #[test]
    fn export_csv_newline_in_name_is_escaped() {
        let dir = std::env::temp_dir();
        let path = dir.join("test_receipt_newline.csv");
        let data = ReceiptData {
            rows: vec![ReceiptRow { name: "Line1\nLine2".into(), price: 5.00, category: None }],
        };
        export_csv(&data, path.to_str().unwrap()).unwrap();
        let content = std::fs::read_to_string(&path).unwrap();
        std::fs::remove_file(&path).ok();

        // The name must be quoted because it contains a newline.
        assert!(content.contains('"'), "newline-containing names must be quoted");
    }
}

