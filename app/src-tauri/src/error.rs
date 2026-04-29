//! Application-level error types.
//!
//! Defines `AppError`, the main error type used throughout the application.
//! Serializes to `{ "kind": "<Variant>", "message": "<display>" }` so the
//! frontend can pattern-match on the variant and display the human-readable message.

use thiserror::Error;

/// Unified error type for all application errors.
///
/// Returns as `{ "kind": "...", "message": "..." }` over Tauri IPC so that
/// frontend code can distinguish error categories without string-parsing.
#[derive(Debug, Error)]
pub enum AppError {
    /// I/O error (file not found, permission denied, etc.)
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    /// JSON serialization or deserialization error
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    /// General data processing or business logic error
    #[error("Processing error: {0}")]
    Processing(String),

    /// Path resolution or invalid UTF-8 error
    #[error("Path error: {0}")]
    Path(String),

    /// SQLite or persistence error
    #[error("Database error: {0}")]
    Database(String),

    /// Requested entity was not found
    #[error("Not found: {0}")]
    NotFound(String),

    /// Image processing error (thumbnail generation, decoding, etc.)
    #[error("Image error: {0}")]
    Image(String),
}

// Required by Tauri so that `Result<T, AppError>` can be returned from commands.
impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let kind = match self {
            AppError::Io(_) => "Io",
            AppError::Json(_) => "Json",
            AppError::Processing(_) => "Processing",
            AppError::Path(_) => "Path",
            AppError::Database(_) => "Database",
            AppError::NotFound(_) => "NotFound",
            AppError::Image(_) => "Image",
        };
        let mut s = serializer.serialize_struct("AppError", 2)?;
        s.serialize_field("kind", kind)?;
        s.serialize_field("message", &self.to_string())?;
        s.end()
    }
}
