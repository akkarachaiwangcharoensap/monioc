//! General-purpose utilities.

/// Iteratively walk `path` and return `(file_count, total_bytes)`.
///
/// Uses an explicit stack instead of recursion to avoid stack-overflow on
/// directory trees that are unusually deep (e.g. deeply-nested cache dirs).
pub fn dir_stats(path: &std::path::Path) -> (usize, u64) {
    if !path.exists() {
        return (0, 0);
    }
    let mut stack: Vec<std::path::PathBuf> = vec![path.to_path_buf()];
    let mut count = 0usize;
    let mut size = 0u64;
    while let Some(dir) = stack.pop() {
        let Ok(rd) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in rd.flatten() {
            let p = entry.path();
            if p.is_dir() {
                stack.push(p);
            } else if p.is_file() {
                count += 1;
                size += entry.metadata().map(|m| m.len()).unwrap_or(0);
            }
        }
    }
    (count, size)
}

/// Per-directory size breakdown for the app data directory.
#[derive(Debug, Clone, Default)]
pub struct StorageBreakdown {
    /// Size of `receipts.sqlite3` plus any WAL/SHM journal files.
    pub db_bytes: u64,
    /// Size of all files under the `receipt-scans/` subdirectory.
    pub receipt_scans_bytes: u64,
    /// Size of all files under the `receipt-staging/` subdirectory.
    pub staging_bytes: u64,
    /// Size of all files under the `models/` subdirectory (downloaded AI models).
    pub models_bytes: u64,
    /// Everything else (configs, logs, etc.).
    pub other_bytes: u64,
    /// Grand total across all categories.
    pub total_bytes: u64,
    /// Total number of regular files.
    pub file_count: usize,
}

/// Walk `path` one level deep and categorize files into the known storage
/// buckets.  Subdirectories (`receipt-scans/`, `receipt-staging/`) are walked
/// fully to sum their contents.
pub fn dir_breakdown(path: &std::path::Path) -> StorageBreakdown {
    let mut bd = StorageBreakdown::default();
    if !path.exists() {
        return bd;
    }
    let Ok(rd) = std::fs::read_dir(path) else {
        return bd;
    };
    for entry in rd.flatten() {
        let p = entry.path();
        let name = p
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        let direct_size = entry.metadata().map(|m| m.len()).unwrap_or(0);

        if p.is_file() {
            bd.file_count += 1;
            bd.total_bytes += direct_size;
            if name.starts_with("receipts.sqlite3") {
                bd.db_bytes += direct_size;
            } else {
                bd.other_bytes += direct_size;
            }
        } else if p.is_dir() {
            let (sub_count, sub_size) = dir_stats(&p);
            bd.file_count += sub_count;
            bd.total_bytes += sub_size;
            if name == "receipt-scans" {
                bd.receipt_scans_bytes = sub_size;
            } else if name == "receipt-staging" {
                bd.staging_bytes = sub_size;
            } else if name == "models" {
                bd.models_bytes = sub_size;
            } else {
                bd.other_bytes += sub_size;
            }
        }
    }
    bd
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_dir_returns_zero() {
        let tmp = std::env::temp_dir().join("dir_stats_empty_test");
        std::fs::create_dir_all(&tmp).unwrap();
        let (count, size) = dir_stats(&tmp);
        assert_eq!(count, 0);
        assert_eq!(size, 0);
        std::fs::remove_dir_all(&tmp).ok();
    }

    #[test]
    fn nonexistent_path_returns_zero() {
        let (count, size) = dir_stats(std::path::Path::new("/definitely/does/not/exist/12345"));
        assert_eq!(count, 0);
        assert_eq!(size, 0);
    }

    #[test]
    fn single_file_returns_correct_stats() {
        let tmp = std::env::temp_dir().join("dir_stats_single_test");
        std::fs::create_dir_all(&tmp).unwrap();
        let file = tmp.join("test.txt");
        std::fs::write(&file, b"hello world").unwrap();
        let (count, size) = dir_stats(&tmp);
        assert_eq!(count, 1);
        assert_eq!(size, 11);
        std::fs::remove_dir_all(&tmp).ok();
    }
}
