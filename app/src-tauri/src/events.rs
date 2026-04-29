//! Tauri event name constants and payload types for all application events,
//! plus helper functions that emit them from an `AppHandle`.

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use crate::db::receipt::ReceiptScanRecord;

// ── Event name constants ──────────────────────────────────────────────────────

pub mod names {
    /// A receipt was created or updated in the database.
    pub const RECEIPT_SAVED: &str = "receipt:saved";
    /// A receipt was permanently deleted from the database.
    pub const RECEIPT_DELETED: &str = "receipt:deleted";
}

/// Consolidated job lifecycle event name.
pub const EVENT_JOB_STATUS: &str = "job:status";
/// Category list changed (add, rename, delete, reorder, replace).
pub const EVENT_CATEGORY_CHANGED: &str = "category:changed";
/// Entire database was replaced (backup restore).
pub const EVENT_DATA_RESTORED: &str = "data:restored";

// ── Job lifecycle types ───────────────────────────────────────────────────────

/// Current phase of a job in the serial queue.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum JobPhase {
    Queued,
    Scanning,
    Saving,
    Categorizing,
    Done,
    Error,
    Cancelled,
}

/// Canonical event payload covering all job lifecycle transitions.
///
/// Emitted as `job:status`. The frontend derives all scan/categorize UI state
/// from these events — no polling or command-based status queries.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobStatusPayload {
    /// Stable job identifier. For existing receipts this is the DB id as a
    /// string; for new scans it is the source image path. On `Done` the
    /// `record` field carries the saved id so the frontend can remap.
    pub job_key: String,

    pub phase: JobPhase,

    /// Monotonically-increasing run identifier within this job key.
    /// Incremented each time a new execution of the same job key starts in
    /// the worker. The initial `Queued` event emitted from the command handler
    /// (before the worker starts) uses `run_id = 0`, so any `run_id >= 1`
    /// from the worker always supersedes it.
    pub run_id: u32,

    /// Set when phase == Done. The full saved record so the frontend can
    /// update its cache without an additional IPC round-trip.
    pub record: Option<ReceiptScanRecord>,

    /// Set when phase == Error.
    pub error: Option<String>,

    /// Monotonically-increasing sequence number within this job run.
    /// Lets the frontend discard out-of-order events within the same run.
    pub seq: u32,
}

// ── Legacy payload types (kept for non-job events) ────────────────────────────

/// Payload for `receipt:deleted`.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReceiptDeletedEvent {
    pub id: i64,
}

// ── Emit helpers ──────────────────────────────────────────────────────────────

/// Emit a `job:status` event with the given payload.
pub fn emit_job_status(handle: &AppHandle, payload: &JobStatusPayload) {
    let _ = handle.emit(EVENT_JOB_STATUS, payload);
}

/// Emit a `category:changed` event so the frontend can refresh its category list.
pub fn emit_category_changed(handle: &AppHandle) {
    let _ = handle.emit(EVENT_CATEGORY_CHANGED, ());
}

/// Emit a `data:restored` event after a backup import so the frontend reloads all caches.
pub fn emit_data_restored(handle: &AppHandle) {
    let _ = handle.emit(EVENT_DATA_RESTORED, ());
}
