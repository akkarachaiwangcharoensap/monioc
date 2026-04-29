//! Backup and restore Tauri commands.
//!
//! # GBAK archive format
//!
//! Header (9 bytes):
//!   [4]  magic  = b"GBAK"
//!   [1]  version = 0x01
//!   [4]  entry_count (u32 LE)
//!
//! Body (zstd-compressed, appended immediately after header):
//!   For each entry:
//!     [2]  name_len (u16 LE)
//!     [name_len]  name bytes (UTF-8, relative path inside app_data_dir)
//!     [8]  data_len (u64 LE)
//!     [data_len]  file bytes
//!
//! Path traversal is rejected at unpack time: names with ".." or starting
//! with "/" or "\" are silently discarded and cause an error.

use crate::db::connection::DbState;
use crate::error::AppError;
use crate::events::emit_data_restored;
use crate::image_ops::storage::{RECEIPT_SCANS_DIR, RECEIPT_STAGING_DIR};
use serde::Serialize;
use std::io::{Cursor, Read};
use tauri::Manager;

// ── Archive constants ─────────────────────────────────────────────────────────

const GBAK_MAGIC: &[u8; 4] = b"GBAK";
const GBAK_VERSION: u8 = 0x01;
const HEADER_LEN: usize = 9; // 4 magic + 1 version + 4 entry_count

// ── Public types ─────────────────────────────────────────────────────────────

/// Metadata returned after a backup export.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub path: String,
    pub size_bytes: u64,
    pub entry_count: u32,
}

// ── Archive helpers ───────────────────────────────────────────────────────────

#[derive(Debug)]
struct ArchiveEntry {
    name: String,
    data: Vec<u8>,
}

/// Serialize entries to a GBAK byte stream (header + zstd-compressed body).
fn pack(entries: &[ArchiveEntry]) -> Result<Vec<u8>, AppError> {
    // Build uncompressed body.
    let mut body: Vec<u8> = Vec::new();
    for e in entries {
        let name_bytes = e.name.as_bytes();
        let name_len = u16::try_from(name_bytes.len())
            .map_err(|_| AppError::Processing("Entry name too long".into()))?;
        body.extend_from_slice(&name_len.to_le_bytes());
        body.extend_from_slice(name_bytes);
        let data_len = e.data.len() as u64;
        body.extend_from_slice(&data_len.to_le_bytes());
        body.extend_from_slice(&e.data);
    }

    // Compress the body.
    let compressed = zstd::stream::encode_all(Cursor::new(&body), 6)
        .map_err(|e| AppError::Processing(e.to_string()))?;

    // Write 9-byte header.
    let entry_count = u32::try_from(entries.len())
        .map_err(|_| AppError::Processing("Too many entries".into()))?;
    let mut out = Vec::with_capacity(HEADER_LEN + compressed.len());
    out.extend_from_slice(GBAK_MAGIC);
    out.push(GBAK_VERSION);
    out.extend_from_slice(&entry_count.to_le_bytes());
    out.extend_from_slice(&compressed);

    Ok(out)
}

/// Deserialize a GBAK byte stream back into entries.
///
/// Returns an error for invalid magic, unsupported version, or path traversal.
fn unpack(data: &[u8]) -> Result<Vec<ArchiveEntry>, AppError> {
    if data.len() < HEADER_LEN {
        return Err(AppError::Processing(
            "Not a valid GBAK backup file (too short)".into(),
        ));
    }
    if &data[..4] != GBAK_MAGIC {
        return Err(AppError::Processing(
            "Not a valid GBAK backup file (bad magic)".into(),
        ));
    }
    if data[4] != GBAK_VERSION {
        return Err(AppError::Processing(format!(
            "Unsupported backup version: {}",
            data[4]
        )));
    }
    let header_bytes: [u8; 4] = data[5..9]
        .try_into()
        .map_err(|_| AppError::Processing("Invalid header: cannot read entry count".into()))?;
    let entry_count = u32::from_le_bytes(header_bytes) as usize;

    // Decompress body.
    let body = zstd::stream::decode_all(Cursor::new(&data[HEADER_LEN..]))
        .map_err(|e| AppError::Processing(format!("Decompression failed: {e}")))?;

    let mut cursor = Cursor::new(&body);
    let mut entries = Vec::with_capacity(entry_count);

    for _ in 0..entry_count {
        // Read name.
        let mut name_len_buf = [0u8; 2];
        cursor
            .read_exact(&mut name_len_buf)
            .map_err(|e| AppError::Processing(format!("Truncated entry: {e}")))?;
        let name_len = u16::from_le_bytes(name_len_buf) as usize;

        let mut name_bytes = vec![0u8; name_len];
        cursor
            .read_exact(&mut name_bytes)
            .map_err(|e| AppError::Processing(format!("Truncated name: {e}")))?;
        let name = String::from_utf8(name_bytes)
            .map_err(|_| AppError::Processing("Entry name is not valid UTF-8".into()))?;

        // Reject path traversal.
        if name.contains("..") || name.starts_with('/') || name.starts_with('\\') {
            return Err(AppError::Processing(format!(
                "Rejected unsafe entry name: {name}"
            )));
        }

        // Read data.
        let mut data_len_buf = [0u8; 8];
        cursor
            .read_exact(&mut data_len_buf)
            .map_err(|e| AppError::Processing(format!("Truncated data length: {e}")))?;
        let data_len = u64::from_le_bytes(data_len_buf) as usize;

        let mut data = vec![0u8; data_len];
        cursor
            .read_exact(&mut data)
            .map_err(|e| AppError::Processing(format!("Truncated data: {e}")))?;

        entries.push(ArchiveEntry { name, data });
    }

    Ok(entries)
}

// ── Tauri commands ────────────────────────────────────────────────────────────

/// Pack the database + receipt images into a compressed `.gbak` archive.
#[tauri::command]
pub async fn export_backup(
    app: tauri::AppHandle,
    state: tauri::State<'_, DbState>,
    dest_path: String,
) -> Result<BackupInfo, AppError> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Path(e.to_string()))?;

    let db_path = data_dir.join("receipts.sqlite3");

    // Checkpoint WAL so all committed data is in the main DB file.
    {
        let pool = state.0.read().await;
        sqlx::query("PRAGMA wal_checkpoint(TRUNCATE)")
            .execute(&*pool)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;
    }

    // Collect entries: database first, then images from both image directories.
    let mut entries: Vec<ArchiveEntry> = Vec::new();

    // 1. SQLite database.
    entries.push(ArchiveEntry {
        name: "receipts.sqlite3".into(),
        data: std::fs::read(&db_path)?,
    });

    // 2. Image directories.
    for dir_name in &[RECEIPT_STAGING_DIR, RECEIPT_SCANS_DIR] {
        let dir = data_dir.join(dir_name);
        if !dir.exists() {
            continue;
        }
        for entry in walkdir(&dir)? {
            let rel = entry
                .strip_prefix(&data_dir)
                .map_err(|_| AppError::Path("strip_prefix failed".into()))?
                .to_str()
                .ok_or_else(|| AppError::Path("Non-UTF-8 path".into()))?
                .to_string();
            // Normalize path separator to forward slash for portability.
            let rel = rel.replace('\\', "/");
            entries.push(ArchiveEntry {
                name: rel,
                data: std::fs::read(&entry)?,
            });
        }
    }

    let entry_count = entries.len() as u32;
    let packed = pack(&entries)?;

    std::fs::write(&dest_path, &packed)?;

    let size_bytes = packed.len() as u64;
    Ok(BackupInfo {
        path: dest_path,
        size_bytes,
        entry_count,
    })
}

/// Restore everything from a `.gbak` archive: database + receipt images.
///
/// SAFETY: This is destructive — the frontend must confirm before calling.
#[tauri::command]
pub async fn import_backup(
    app: tauri::AppHandle,
    state: tauri::State<'_, DbState>,
    source_path: String,
) -> Result<(), AppError> {
    if !std::path::Path::new(&source_path).exists() {
        return Err(AppError::Io(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "Backup file not found",
        )));
    }

    let raw = std::fs::read(&source_path)?;
    let entries = unpack(&raw)?;

    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Path(e.to_string()))?;

    let db_path = data_dir.join("receipts.sqlite3");

    // Acquire exclusive write lock — no other commands can access the pool.
    let mut pool = state.0.write().await;

    // Checkpoint before closing.
    sqlx::query("PRAGMA wal_checkpoint(TRUNCATE)")
        .execute(&*pool)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    // Close all connections.
    pool.close().await;

    // Remove WAL / SHM side-car files.
    let _ = std::fs::remove_file(db_path.with_extension("sqlite3-wal"));
    let _ = std::fs::remove_file(db_path.with_extension("sqlite3-shm"));

    // Clear existing image directories so stale images don't linger.
    for dir_name in &[RECEIPT_STAGING_DIR, RECEIPT_SCANS_DIR] {
        let dir = data_dir.join(dir_name);
        if dir.exists() {
            std::fs::remove_dir_all(&dir)?;
        }
    }

    // Write all archive entries to disk.
    for entry in &entries {
        let dest = data_dir.join(&entry.name);
        if let Some(parent) = dest.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(&dest, &entry.data)?;
    }

    // Re-open the pool pointing at the restored database.
    let url = format!("sqlite:{}", db_path.display());
    let new_pool = sqlx::SqlitePool::connect(&url)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    // Replace the pool in-place (write guard still held).
    *pool = new_pool;

    // Drop the write guard before emitting so listeners can acquire reads.
    drop(pool);
    emit_data_restored(&app);

    Ok(())
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/// Collect all regular files under `dir`, returning their absolute paths.
fn walkdir(dir: &std::path::Path) -> Result<Vec<std::path::PathBuf>, AppError> {
    let mut out = Vec::new();
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        let ft = entry.file_type()?;
        if ft.is_file() {
            out.push(path);
        } else if ft.is_dir() {
            out.extend(walkdir(&path)?);
        }
    }
    Ok(out)
}

// ── Unit tests ────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn make_entry(name: &str, data: &[u8]) -> ArchiveEntry {
        ArchiveEntry {
            name: name.into(),
            data: data.to_vec(),
        }
    }

    // ── Roundtrip tests ───────────────────────────────────────────────────────

    #[test]
    fn roundtrip_single_entry() {
        let entries = vec![make_entry("receipts.sqlite3", b"SQLite format 3\0payload")];
        let packed = pack(&entries).unwrap();
        let unpacked = unpack(&packed).unwrap();
        assert_eq!(unpacked.len(), 1);
        assert_eq!(unpacked[0].name, "receipts.sqlite3");
        assert_eq!(unpacked[0].data, b"SQLite format 3\0payload");
    }

    #[test]
    fn roundtrip_multiple_entries() {
        let entries = vec![
            make_entry("receipts.sqlite3", b"db data"),
            make_entry("receipt-scans/img1.jpg", b"\xff\xd8\xff"),
            make_entry("receipt-staging/tmp.png", b"\x89PNG\r\n"),
        ];
        let packed = pack(&entries).unwrap();
        let unpacked = unpack(&packed).unwrap();
        assert_eq!(unpacked.len(), 3);
        assert_eq!(unpacked[1].name, "receipt-scans/img1.jpg");
        assert_eq!(unpacked[2].data, b"\x89PNG\r\n");
    }

    #[test]
    fn roundtrip_empty_archive() {
        let packed = pack(&[]).unwrap();
        let unpacked = unpack(&packed).unwrap();
        assert!(unpacked.is_empty());
    }

    #[test]
    fn roundtrip_binary_data() {
        let data: Vec<u8> = (0u8..=255).collect();
        let entries = vec![make_entry("binary.bin", &data)];
        let packed = pack(&entries).unwrap();
        let unpacked = unpack(&packed).unwrap();
        assert_eq!(unpacked[0].data, data);
    }

    #[test]
    fn roundtrip_unicode_name() {
        let entries = vec![make_entry("scans/café_résumé.jpg", b"img")];
        let packed = pack(&entries).unwrap();
        let unpacked = unpack(&packed).unwrap();
        assert_eq!(unpacked[0].name, "scans/café_résumé.jpg");
    }

    // ── Header validation ─────────────────────────────────────────────────────

    #[test]
    fn reject_wrong_magic() {
        let mut data = vec![0u8; 20];
        data[..4].copy_from_slice(b"NOTG");
        let err = unpack(&data).unwrap_err();
        assert!(err.to_string().contains("bad magic"));
    }

    #[test]
    fn reject_wrong_version() {
        let mut entries = vec![make_entry("a", b"b")];
        let mut packed = pack(&mut entries).unwrap();
        packed[4] = 0x99; // clobber version byte
        let err = unpack(&packed).unwrap_err();
        assert!(err.to_string().contains("Unsupported backup version"));
    }

    #[test]
    fn reject_too_short() {
        let err = unpack(&[0u8; 5]).unwrap_err();
        assert!(err.to_string().contains("too short"));
    }

    #[test]
    fn reject_empty_slice() {
        let err = unpack(&[]).unwrap_err();
        assert!(err.to_string().contains("too short"));
    }

    // ── Security: path traversal ──────────────────────────────────────────────

    #[test]
    fn reject_dotdot_traversal() {
        let entries = vec![make_entry("../../etc/passwd", b"root:x")];
        let packed = pack(&entries).unwrap();
        let err = unpack(&packed).unwrap_err();
        assert!(err.to_string().contains("unsafe entry name"));
    }

    #[test]
    fn reject_absolute_unix_path() {
        let entries = vec![make_entry("/etc/passwd", b"root:x")];
        let packed = pack(&entries).unwrap();
        let err = unpack(&packed).unwrap_err();
        assert!(err.to_string().contains("unsafe entry name"));
    }

    #[test]
    fn reject_absolute_windows_path() {
        let entries = vec![make_entry("\\Windows\\system32\\cmd.exe", b"MZ")];
        let packed = pack(&entries).unwrap();
        let err = unpack(&packed).unwrap_err();
        assert!(err.to_string().contains("unsafe entry name"));
    }

    // ── Compression effectiveness ─────────────────────────────────────────────

    #[test]
    fn compressed_size_smaller_for_repetitive_data() {
        let data = vec![0u8; 10_000];
        let entries = vec![make_entry("zeros.bin", &data)];
        let packed = pack(&entries).unwrap();
        // Compressed + header should be much smaller than raw data.
        assert!(packed.len() < data.len() / 2);
    }

    // ── Header layout ─────────────────────────────────────────────────────────

    #[test]
    fn header_magic_and_version_bytes() {
        let packed = pack(&[]).unwrap();
        assert_eq!(&packed[..4], b"GBAK");
        assert_eq!(packed[4], 0x01);
    }

    #[test]
    fn header_entry_count_correct() {
        let entries = vec![
            make_entry("a", b"1"),
            make_entry("b", b"2"),
            make_entry("c", b"3"),
        ];
        let packed = pack(&entries).unwrap();
        let count = u32::from_le_bytes(packed[5..9].try_into().unwrap());
        assert_eq!(count, 3);
    }
}
