/**
 * File/byte size formatting utilities.
 */

import { BYTES_PER_KB, BYTES_PER_MB, BYTES_PER_GB } from '../constants';

/**
 * Format a byte count as a human-readable string (B / KB / MB / GB).
 */
export function formatBytes(bytes: number): string {
    if (bytes < BYTES_PER_KB) return `${bytes} B`;
    if (bytes < BYTES_PER_MB) return `${(bytes / BYTES_PER_KB).toFixed(1)} KB`;
    if (bytes < BYTES_PER_GB) return `${(bytes / BYTES_PER_MB).toFixed(2)} MB`;
    return `${(bytes / BYTES_PER_GB).toFixed(2)} GB`;
}
