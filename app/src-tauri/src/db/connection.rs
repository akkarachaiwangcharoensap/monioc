//! Database connection managed-state type.
//!
//! `DbState` wraps a `sqlx::SqlitePool` inside a `tokio::sync::RwLock` so the
//! backup-restore command can replace the pool in-place without Tauri needing
//! to re-manage the state type (which would panic).
//!
//! Schema migrations are declared in `lib.rs` and executed by
//! `tauri-plugin-sql` at application startup.

use sqlx::SqlitePool;
use tauri::async_runtime::RwLock;

/// Tauri managed state wrapping the shared SQLite connection pool.
///
/// Most commands acquire a **read lock** (`state.0.read().await`) allowing
/// concurrent query execution.  The import-backup command acquires the
/// exclusive **write lock** to close the old pool and swap in a fresh one
/// connected to the restored database file.  This avoids the need to call
/// `app.manage()` a second time (which would panic in Tauri 2).
pub struct DbState(pub RwLock<SqlitePool>);
