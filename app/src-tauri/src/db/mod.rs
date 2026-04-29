//! Database module: connection management and CRUD operations.
//!
//! Two databases are managed:
//!
//! - `receipts.sqlite3` — user data (receipts, categories). Schema migrations
//!   are declared in `lib.rs` and managed by `tauri-plugin-sql`.
//! - `grocery.sqlite3`  — read-only bundled Statistics Canada reference data.
//!   Opened via sqlx directly; never migrated (rebuilt from CSV during build).

pub mod category;
pub mod connection;
pub mod grocery;
pub mod image_library;
pub mod receipt;

pub use category::CategoryRecord;
pub use connection::DbState;
pub use grocery::GroceryDbState;
pub use image_library::ImageLibraryEntry;
pub use receipt::{ReceiptData, ReceiptRow, ReceiptScanRecord};
