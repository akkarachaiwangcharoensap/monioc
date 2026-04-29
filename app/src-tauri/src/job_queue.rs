//! Rust-owned serial job queue for receipt scanning and categorization.
//!
//! Replaces the JavaScript `ScanStatusContext` serial queue entirely.
//! Jobs run one at a time in submission order on a single background task.
//! Every phase transition emits a `job:status` event so the React frontend
//! can derive UI state without polling.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

use crate::db::connection::DbState;
use crate::db::receipt::{ReceiptData, ReceiptRow, ReceiptScanRecord};
use crate::error::AppError;
use crate::events::{self, JobPhase, JobStatusPayload};
use crate::image_ops;

// ── Constants ─────────────────────────────────────────────────────────────────

const RECEIPT_SCANS_DIR: &str = image_ops::storage::RECEIPT_SCANS_DIR;
const RECEIPT_FILE_PREFIX: &str = "receipt-";
const SCRIPT_PROGRESS_PREFIX: &str = "[scan_receipt] ";
const SCRIPT_LOG_TAG: &str = "[scan_receipt.py]";

// ── Global run-id counter ─────────────────────────────────────────────────────
// Each call to process_scan / process_categorize grabs a unique run_id so the
// frontend can distinguish events from different runs of the same job_key.
// The command handler uses run_id=0 as a sentinel ("queued, not yet running").
static GLOBAL_RUN_ID: AtomicU32 = AtomicU32::new(1);

// ── Job variants ──────────────────────────────────────────────────────────────

pub enum Job {
    Scan {
        job_key: String,
        image_path: String,
        receipt_id: Option<i64>,
        with_auto_cat: bool,
        categories: Vec<String>,
    },
    Categorize {
        job_key: String,
        receipt_id: i64,
        items: Vec<String>,
        categories: Vec<String>,
        /// Current receipt data from the frontend — used for apply_categories so
        /// user renames are preserved even when the auto-save has not yet committed.
        data: ReceiptData,
    },
    Cancel {
        job_key: String,
    },
}

// ── JobQueue handle ───────────────────────────────────────────────────────────

/// Handle to the serial job queue. Registered as Tauri managed state.
pub struct JobQueue {
    tx: mpsc::Sender<Job>,
    active_cancellations: Arc<Mutex<HashMap<String, CancellationToken>>>,
}

impl JobQueue {
    /// Spawn the background worker task and return the queue handle.
    pub fn spawn(app: AppHandle) -> Self {
        let (tx, rx) = mpsc::channel(256);
        let cancellations: Arc<Mutex<HashMap<String, CancellationToken>>> = Default::default();

        let worker = JobWorker {
            app,
            cancellations: cancellations.clone(),
        };

        tauri::async_runtime::spawn(worker.run(rx));

        Self {
            tx,
            active_cancellations: cancellations,
        }
    }

    /// Enqueue a job. Returns immediately.
    pub async fn submit(&self, job: Job) {
        let _ = self.tx.send(job).await;
    }

    /// Cancel a job immediately.
    ///
    /// - If the job is **currently running**, its `CancellationToken` is
    ///   cancelled directly (bypasses the serial queue channel).
    /// - If the job is **queued but not yet started**, a pre-cancelled token
    ///   is inserted so `process_scan` / `process_categorize` exit immediately
    ///   when they eventually dequeue the job.
    ///
    /// Returns `true` if the job was actively running (or already had a
    /// pre-cancelled token from a previous cancel call), and `false` if this
    /// is the **first** cancel for a genuinely-queued job.  The caller uses
    /// `false` as the signal to emit a `Cancelled` event immediately, because
    /// the worker won't emit it until the job is actually dequeued (after all
    /// preceding jobs complete).
    pub fn cancel_now(&self, job_key: &str) -> bool {
        if let Ok(mut map) = self.active_cancellations.lock() {
            if let Some(token) = map.get(job_key) {
                // Token already present: either a running job or a queued job
                // that was already cancelled.  cancel() is idempotent.
                token.cancel();
                // Returning true tells the caller "already handled — don't
                // emit a redundant Cancelled event".
                return true;
            }
            // No token in map → first cancel call for a genuinely-queued job.
            // Pre-register a cancelled token so process_scan exits immediately
            // on dequeue, and signal the caller to emit Cancelled right now.
            let token = CancellationToken::new();
            token.cancel();
            map.insert(job_key.to_string(), token);
            false // caller should emit Cancelled immediately
        } else {
            true // lock error — conservatively don't double-emit
        }
    }
}

// ── Background worker ─────────────────────────────────────────────────────────

struct JobWorker {
    app: AppHandle,
    cancellations: Arc<Mutex<HashMap<String, CancellationToken>>>,
}

impl JobWorker {
    async fn run(self, mut rx: mpsc::Receiver<Job>) {
        while let Some(job) = rx.recv().await {
            match job {
                Job::Cancel { job_key } => {
                    if let Ok(map) = self.cancellations.lock() {
                        if let Some(token) = map.get(&job_key) {
                            token.cancel();
                        }
                    }
                }
                Job::Scan {
                    job_key,
                    image_path,
                    receipt_id,
                    with_auto_cat,
                    categories,
                } => {
                    self.process_scan(job_key, image_path, receipt_id, with_auto_cat, categories)
                        .await;
                }
                Job::Categorize {
                    job_key,
                    receipt_id,
                    items,
                    categories,
                    data,
                } => {
                    self.process_categorize(job_key, receipt_id, items, categories, data)
                        .await;
                }
            }
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    fn emit(&self, job_key: &str, phase: JobPhase, seq: u32, run_id: u32) {
        events::emit_job_status(
            &self.app,
            &JobStatusPayload {
                job_key: job_key.to_string(),
                phase,
                run_id,
                record: None,
                error: None,
                seq,
            },
        );
    }

    fn emit_done(&self, job_key: &str, record: ReceiptScanRecord, seq: u32, run_id: u32) {
        events::emit_job_status(
            &self.app,
            &JobStatusPayload {
                job_key: job_key.to_string(),
                phase: JobPhase::Done,
                run_id,
                record: Some(record),
                error: None,
                seq,
            },
        );
    }

    fn emit_error(&self, job_key: &str, error: String, seq: u32, run_id: u32) {
        events::emit_job_status(
            &self.app,
            &JobStatusPayload {
                job_key: job_key.to_string(),
                phase: JobPhase::Error,
                run_id,
                record: None,
                error: Some(error),
                seq,
            },
        );
    }

    fn register_cancellation(&self, job_key: &str) -> CancellationToken {
        if let Ok(mut map) = self.cancellations.lock() {
            // Reuse an existing pre-cancelled token (inserted by `cancel_now` while job was queued).
            if let Some(existing) = map.get(job_key) {
                if existing.is_cancelled() {
                    return existing.clone();
                }
            }
            let token = CancellationToken::new();
            map.insert(job_key.to_string(), token.clone());
            return token;
        }
        CancellationToken::new()
    }

    fn unregister_cancellation(&self, job_key: &str) {
        if let Ok(mut map) = self.cancellations.lock() {
            map.remove(job_key);
        }
    }

    /// Derive a display name from the image path (matches JS `getReceiptFallbackName`).
    fn fallback_display_name(image_path: &str) -> String {
        let file_name = image_path
            .rsplit(&['/', '\\'][..])
            .next()
            .unwrap_or("");
        let without_ext = file_name
            .rfind('.')
            .map(|i| &file_name[..i])
            .unwrap_or(file_name);
        let cleaned = without_ext
            .replace(&['_', '-'][..], " ")
            .trim()
            .to_string();
        if cleaned.is_empty() {
            "Receipt".to_string()
        } else {
            cleaned
        }
    }

    // ── Scan pipeline ─────────────────────────────────────────────────────────

    async fn process_scan(
        &self,
        job_key: String,
        image_path: String,
        receipt_id: Option<i64>,
        with_auto_cat: bool,
        categories: Vec<String>,
    ) {
        let run_id = GLOBAL_RUN_ID.fetch_add(1, Ordering::Relaxed);
        let token = self.register_cancellation(&job_key);
        let mut seq: u32 = 0;

        // Job may have been cancelled while it was sitting in the queue.
        if token.is_cancelled() {
            seq += 1;
            self.emit(&job_key, JobPhase::Cancelled, seq, run_id);
            self.unregister_cancellation(&job_key);
            return;
        }

        // Phase: Scanning
        seq += 1;
        self.emit(&job_key, JobPhase::Scanning, seq, run_id);

        let scan_result = self
            .run_python_scan(&job_key, &image_path, &token, &mut seq)
            .await;

        // Check cancellation
        if token.is_cancelled() {
            seq += 1;
            self.emit(&job_key, JobPhase::Cancelled, seq, run_id);
            self.unregister_cancellation(&job_key);
            return;
        }

        let (data, processed_image_path) = match scan_result {
            Ok(result) => result,
            Err(err) => {
                seq += 1;
                self.emit_error(&job_key, err, seq, run_id);
                self.unregister_cancellation(&job_key);
                return;
            }
        };

        // Phase: Saving
        seq += 1;
        self.emit(&job_key, JobPhase::Saving, seq, run_id);

        let persisted_image_path = processed_image_path
            .as_deref()
            .unwrap_or(&image_path)
            .to_string();
        let display_name = Self::fallback_display_name(&image_path);

        let save_result = self
            .save_receipt(
                receipt_id,
                Some(persisted_image_path),
                processed_image_path.clone(),
                &data,
                &display_name,
            )
            .await;

        // Clean up staging image if processed path was created
        if processed_image_path.is_some() {
            if let Err(e) = image_ops::storage::delete_staging_image(&self.app, &image_path) {
                eprintln!("Warning: failed to clean staging image: {e}");
            }
        }

        let saved_record = match save_result {
            Ok(record) => record,
            Err(err) => {
                seq += 1;
                self.emit_error(&job_key, err.to_string(), seq, run_id);
                self.unregister_cancellation(&job_key);
                return;
            }
        };

        // If no auto-categorize, we're done.
        // Emit receipt:saved here only when NOT running auto-cat; when auto-cat
        // runs, the categorized (or on-failure, uncategorized) record is emitted
        // after categorization so the cache never sees an intermediate uncategorized copy.
        if !with_auto_cat || categories.is_empty() || saved_record.data.rows.is_empty() {
            let _ = self
                .app
                .emit(events::names::RECEIPT_SAVED, &saved_record);
            seq += 1;
            self.emit_done(&job_key, saved_record, seq, run_id);
            self.unregister_cancellation(&job_key);
            return;
        }

        // Check cancellation before categorize
        if token.is_cancelled() {
            seq += 1;
            self.emit(&job_key, JobPhase::Cancelled, seq, run_id);
            self.unregister_cancellation(&job_key);
            return;
        }

        // Phase: Categorizing
        seq += 1;
        self.emit(&job_key, JobPhase::Categorizing, seq, run_id);

        let items: Vec<String> = saved_record
            .data
            .rows
            .iter()
            .map(|r| r.name.clone())
            .collect();

        let cat_result = self
            .run_python_categorize(&items, &categories, &token)
            .await;

        if token.is_cancelled() {
            seq += 1;
            self.emit(&job_key, JobPhase::Cancelled, seq, run_id);
            self.unregister_cancellation(&job_key);
            return;
        }

        match cat_result {
            Ok(assigned_categories) => {
                // Merge categories into the receipt data
                let categorized_data = Self::apply_categories(&saved_record.data, &assigned_categories);

                // Update the DB with categorized data
                match self
                    .update_receipt(
                        saved_record.id,
                        saved_record.image_path.clone(),
                        saved_record.processed_image_path.clone(),
                        &categorized_data,
                    )
                    .await
                {
                    Ok(updated_record) => {
                        let _ = self
                            .app
                            .emit(events::names::RECEIPT_SAVED, &updated_record);
                        seq += 1;
                        self.emit_done(&job_key, updated_record, seq, run_id);
                    }
                    Err(err) => {
                        seq += 1;
                        self.emit_error(&job_key, err.to_string(), seq, run_id);
                    }
                }
            }
            Err(err) => {
                // Categorization failed but the scan+save succeeded.
                // Emit receipt:saved with the uncategorized record so the cache
                // is populated (the intermediate emit was suppressed above).
                // Then emit done rather than error so the user sees the scan result.
                eprintln!("Warning: categorization failed: {err}");
                let _ = self
                    .app
                    .emit(events::names::RECEIPT_SAVED, &saved_record);
                seq += 1;
                self.emit_done(&job_key, saved_record, seq, run_id);
            }
        }

        self.unregister_cancellation(&job_key);
    }

    // ── Categorize-only pipeline ──────────────────────────────────────────────

    async fn process_categorize(
        &self,
        job_key: String,
        receipt_id: i64,
        items: Vec<String>,
        categories: Vec<String>,
        data: ReceiptData,
    ) {
        let run_id = GLOBAL_RUN_ID.fetch_add(1, Ordering::Relaxed);
        let token = self.register_cancellation(&job_key);
        let mut seq: u32 = 0;

        // Job may have been cancelled while it was sitting in the queue.
        if token.is_cancelled() {
            seq += 1;
            self.emit(&job_key, JobPhase::Cancelled, seq, run_id);
            self.unregister_cancellation(&job_key);
            return;
        }

        seq += 1;
        self.emit(&job_key, JobPhase::Categorizing, seq, run_id);

        let cat_result = self
            .run_python_categorize(&items, &categories, &token)
            .await;

        if token.is_cancelled() {
            seq += 1;
            self.emit(&job_key, JobPhase::Cancelled, seq, run_id);
            self.unregister_cancellation(&job_key);
            return;
        }

        match cat_result {
            Ok(assigned_categories) => {
                // Fetch the current record only to get image paths — use the
                // caller-supplied `data` (not DB data) for apply_categories so
                // that user renames are reflected even if auto-save is still pending.
                let db_state = self.app.state::<DbState>();
                let pool = db_state.0.read().await;
                match crate::db::receipt::get_by_id(&pool, receipt_id).await {
                    Ok(existing) => {
                        let categorized_data =
                            Self::apply_categories(&data, &assigned_categories);
                        match self
                            .update_receipt(
                                receipt_id,
                                existing.image_path.clone(),
                                existing.processed_image_path.clone(),
                                &categorized_data,
                            )
                            .await
                        {
                            Ok(updated_record) => {
                                let _ = self
                                    .app
                                    .emit(events::names::RECEIPT_SAVED, &updated_record);
                                seq += 1;
                                self.emit_done(&job_key, updated_record, seq, run_id);
                            }
                            Err(err) => {
                                seq += 1;
                                self.emit_error(&job_key, err.to_string(), seq, run_id);
                            }
                        }
                    }
                    Err(err) => {
                        seq += 1;
                        self.emit_error(&job_key, err.to_string(), seq, run_id);
                    }
                }
            }
            Err(err) => {
                seq += 1;
                self.emit_error(&job_key, err, seq, run_id);
            }
        }

        self.unregister_cancellation(&job_key);
    }

    // ── Python process runners ────────────────────────────────────────────────

    async fn run_python_scan(
        &self,
        _job_key: &str,
        image_path: &str,
        token: &CancellationToken,
        _seq: &mut u32,
    ) -> Result<(ReceiptData, Option<String>), String> {
        use tauri_plugin_shell::process::CommandEvent;
        use tauri_plugin_shell::ShellExt;

        let script_path = self
            .app
            .path()
            .resource_dir()
            .map_err(|e| e.to_string())?
            .join("scan_receipt.py");

        let script_str = script_path
            .to_str()
            .ok_or_else(|| "Script path contains invalid UTF-8".to_string())?;

        let app_data_dir = self.app.path().app_data_dir().map_err(|e| e.to_string())?;
        let app_cache_dir = self.app.path().app_cache_dir().map_err(|e| e.to_string())?;
        let python_cmd = crate::python::resolve(&script_path, Some(&app_cache_dir));

        let processed_dir = app_data_dir.join(RECEIPT_SCANS_DIR);
        std::fs::create_dir_all(&processed_dir).map_err(|e| e.to_string())?;

        let timestamp_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_millis();
        let processed_image_path =
            processed_dir.join(format!("{RECEIPT_FILE_PREFIX}{timestamp_ms}.jpg"));
        let processed_image_str = processed_image_path
            .to_str()
            .ok_or_else(|| "Processed image path contains invalid UTF-8".to_string())?
            .to_string();

        let (mut rx, child) = self
            .app
            .shell()
            .command(&python_cmd)
            .args([script_str, image_path, &processed_image_str])
            .spawn()
            .map_err(|e| e.to_string())?;

        // Hold the child handle so we can kill it on cancellation.
        let child = Arc::new(Mutex::new(Some(child)));
        let child_cancel = child.clone();

        // Spawn a task that kills the child if the cancellation token fires.
        let token_clone = token.clone();
        let cancel_task = tauri::async_runtime::spawn(async move {
            token_clone.cancelled().await;
            if let Ok(mut guard) = child_cancel.lock() {
                if let Some(c) = guard.take() {
                    let _ = c.kill();
                }
            }
        });

        let mut stdout_bytes: Vec<u8> = Vec::new();
        let mut stderr_bytes: Vec<u8> = Vec::new();
        let mut exit_code: Option<i32> = None;

        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(bytes) => stdout_bytes.extend_from_slice(&bytes),
                CommandEvent::Stderr(bytes) => {
                    stderr_bytes.extend_from_slice(&bytes);
                    if let Ok(text) = std::str::from_utf8(&bytes) {
                        for raw_line in text.lines() {
                            let trimmed = raw_line.trim();
                            if trimmed.is_empty() {
                                continue;
                            }
                            eprintln!("{SCRIPT_LOG_TAG} {trimmed}");
                            if let Some(msg) = trimmed.strip_prefix(SCRIPT_PROGRESS_PREFIX) {
                                let _ = self.app.emit("scan-progress", msg.to_string());
                            }
                        }
                    }
                }
                CommandEvent::Terminated(payload) => {
                    exit_code = payload.code;
                    break;
                }
                _ => {}
            }
        }

        // Cancel the kill-watcher task (process already exited).
        cancel_task.abort();

        // Clear the child reference.
        if let Ok(mut guard) = child.lock() {
            *guard = None;
        }

        if token.is_cancelled() {
            return Err("Scan cancelled.".to_string());
        }

        // Process killed by signal
        if exit_code.is_none() {
            return Err("Scan cancelled.".to_string());
        }

        let stdout = String::from_utf8_lossy(&stdout_bytes);
        let stderr = String::from_utf8_lossy(&stderr_bytes);
        let success = exit_code == Some(0);

        if let Ok(data) = serde_json::from_str::<serde_json::Value>(stdout.trim()) {
            if let Some(err_msg) = data.get("error").and_then(|v| v.as_str()) {
                return Err(err_msg.to_string());
            }
            if success {
                let receipt_data: ReceiptData = serde_json::from_value(
                    data.get("data")
                        .cloned()
                        .unwrap_or_else(|| data.clone()),
                )
                .unwrap_or(ReceiptData { rows: Vec::new() });

                let processed_path = if processed_image_path.exists() {
                    Some(processed_image_str)
                } else {
                    None
                };

                return Ok((receipt_data, processed_path));
            }
        }

        if success {
            Err("Receipt scanner returned non-JSON success output".to_string())
        } else {
            Err(stderr.to_string())
        }
    }

    async fn run_python_categorize(
        &self,
        items: &[String],
        categories: &[String],
        token: &CancellationToken,
    ) -> Result<Vec<String>, String> {
        use tauri_plugin_shell::process::CommandEvent;
        use tauri_plugin_shell::ShellExt;

        if items.is_empty() {
            return Ok(Vec::new());
        }

        let script_path = self
            .app
            .path()
            .resource_dir()
            .map_err(|e| e.to_string())?
            .join("categorize_items.py");

        let script_str = script_path
            .to_str()
            .ok_or_else(|| "Script path contains invalid UTF-8".to_string())?;

        let app_cache_dir = self.app.path().app_cache_dir().map_err(|e| e.to_string())?;
        let python_cmd = crate::python::resolve(&script_path, Some(&app_cache_dir));

        let input_json =
            serde_json::json!({ "items": items, "categories": categories }).to_string();

        let (mut rx, child) = self
            .app
            .shell()
            .command(&python_cmd)
            .args([script_str, &input_json])
            .spawn()
            .map_err(|e| e.to_string())?;

        let child = Arc::new(Mutex::new(Some(child)));
        let child_cancel = child.clone();

        let token_clone = token.clone();
        let cancel_task = tauri::async_runtime::spawn(async move {
            token_clone.cancelled().await;
            if let Ok(mut guard) = child_cancel.lock() {
                if let Some(c) = guard.take() {
                    let _ = c.kill();
                }
            }
        });

        let mut stdout_bytes: Vec<u8> = Vec::new();
        let mut stderr_lines: Vec<String> = Vec::new();
        let mut exit_code: Option<i32> = None;

        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(chunk) => stdout_bytes.extend_from_slice(&chunk),
                CommandEvent::Stderr(chunk) => {
                    let line = String::from_utf8_lossy(&chunk).trim().to_string();
                    if !line.is_empty() {
                        eprintln!("[categorize_items.py] {line}");
                        stderr_lines.push(line);
                    }
                }
                CommandEvent::Terminated(status) => {
                    exit_code = status.code;
                    break;
                }
                _ => {}
            }
        }

        cancel_task.abort();

        if let Ok(mut guard) = child.lock() {
            *guard = None;
        }

        if token.is_cancelled() {
            return Err("Categorization cancelled.".to_string());
        }

        if exit_code.is_none() {
            return Err("Categorization cancelled.".to_string());
        }

        let stdout = String::from_utf8(stdout_bytes)
            .map_err(|e| format!("Invalid UTF-8 from categorize_items: {e}"))?;

        if exit_code != Some(0) && stdout.trim().is_empty() {
            let detail = stderr_lines.last().cloned().unwrap_or_default();
            return Err(format!(
                "Category inference failed: {}",
                if detail.is_empty() {
                    "unknown error"
                } else {
                    &detail
                }
            ));
        }

        Ok(crate::commands::receipt::parse_categorize_output(
            &stdout,
            items.len(),
        ))
    }

    // ── DB helpers ────────────────────────────────────────────────────────────

    async fn save_receipt(
        &self,
        receipt_id: Option<i64>,
        image_path: Option<String>,
        processed_image_path: Option<String>,
        data: &ReceiptData,
        display_name: &str,
    ) -> Result<ReceiptScanRecord, AppError> {
        let db_state = self.app.state::<DbState>();
        let pool = db_state.0.read().await;
        let image_path =
            crate::services::receipt::normalize_image_path(&self.app, image_path, None)?;

        if let Some(id) = receipt_id {
            let existing = crate::db::receipt::get_by_id(&pool, id).await?;
            crate::services::receipt::update_and_cleanup(
                &self.app,
                &pool,
                id,
                image_path,
                processed_image_path,
                data.clone(),
                &existing,
            )
            .await
        } else {
            crate::db::receipt::save(
                &pool,
                image_path,
                processed_image_path,
                data,
                Some(display_name.to_string()),
            )
            .await
        }
    }

    async fn update_receipt(
        &self,
        id: i64,
        image_path: Option<String>,
        processed_image_path: Option<String>,
        data: &ReceiptData,
    ) -> Result<ReceiptScanRecord, AppError> {
        let db_state = self.app.state::<DbState>();
        let pool = db_state.0.read().await;
        crate::db::receipt::update(&pool, id, image_path, processed_image_path, data).await
    }

    fn apply_categories(data: &ReceiptData, categories: &[String]) -> ReceiptData {
        // `categories` is 1-to-1 with `data.rows` by absolute index.
        // Empty-name rows always get no category (shown as "-- None --" in the UI)
        // regardless of what the LLM returned for that position.
        let rows: Vec<ReceiptRow> = data
            .rows
            .iter()
            .enumerate()
            .map(|(i, row)| ReceiptRow {
                name: row.name.clone(),
                price: row.price,
                category: if row.name.trim().is_empty() {
                    None
                } else {
                    categories.get(i).cloned().or_else(|| row.category.clone())
                },
            })
            .collect();
        ReceiptData { rows }
    }
}
