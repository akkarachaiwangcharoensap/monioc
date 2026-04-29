/**
 * Pure data-transformation utilities for receipt scanning and editing.
 *
 * All functions are side-effect free and suitable for use in both the
 * frontend (React) and in unit tests without any Tauri dependency.
 */

import type { ReceiptData, ReceiptRow } from '../../types';

/** A two-column string matrix: [[name, priceStr], ...] */
export type SpreadsheetMatrix = string[][];

// ── Serialisation ─────────────────────────────────────────────────────────────

/**
 * Produces a stable string signature for change-detection.
 * Two ReceiptData values with identical rows produce the same signature.
 *
 * `_id` is intentionally excluded: it is a frontend-only stable key
 * (backfilled by hydrateIds/makeRow) that is never persisted to or returned
 * by the server.  Including it would make "client data" and "server-round-
 * tripped data" always appear different, causing spurious setRows() calls
 * that remount every row component and reset the scroll position.
 */
export function receiptDataSignature(data: ReceiptData): string {
	return JSON.stringify(data.rows.map(({ _id, ...rest }) => rest));
}

/** Serialise receipt data to a human-readable JSON string for the editor. */
export function toEditableJson(data: ReceiptData): string {
	return JSON.stringify(data, null, 2);
}

/**
 * Parse and validate user-edited JSON back into ReceiptData.
 * Throws a descriptive Error when the input is invalid.
 */
export function parseEditableJson(input: string): ReceiptData {
	const parsed = JSON.parse(input) as ReceiptData;

	if (!parsed || !Array.isArray(parsed.rows)) {
		throw new Error('JSON must contain rows array.');
	}

	return {
		rows: parsed.rows.map((it) => ({
			name: String(it.name ?? '').trim(),
			price: Number(it.price),
			...(it.category ? { category: String(it.category) } : {}),
		})),
	};
}

// ── Spreadsheet conversions ───────────────────────────────────────────────────

/**
 * Convert ReceiptData into a two-column string matrix for the spreadsheet.
 * Non-finite prices (NaN, Infinity) are normalised to "0.00".
 */
export function receiptToMatrix(data: ReceiptData): SpreadsheetMatrix {
	return data.rows.map((row) => [
		row.name,
		Number.isFinite(row.price) ? row.price.toFixed(2) : '0.00',
	]);
}

/**
 * Convert a two-column string matrix back to ReceiptData.
 * Silently trims trailing blank rows (empty name + zero price) to avoid
 * persisting stale rows left by keyboard navigation.
 */
export function matrixToReceipt(matrix: SpreadsheetMatrix): ReceiptData {
	const rows = matrix.map((row) => ({
		name: String(row[0] ?? '').trim(),
		price: parseFloat(String(row[1] ?? '0')) || 0,
	}));

	while (rows.length > 0) {
		const last = rows[rows.length - 1];
		if (last.name.trim() !== '' || last.price !== 0) break;
		rows.pop();
	}

	return { rows };
}

// ── Clipboard ─────────────────────────────────────────────────────────────────

/**
 * Build tab-separated clipboard text for a rectangular cell selection.
 *
 * @param rows    Source receipt rows.
 * @param r0      First selected row index (inclusive).
 * @param r1      Last selected row index (inclusive).
 * @param c0      First selected column index (inclusive, 0=name, 1=category, 2=price).
 * @param c1      Last selected column index (inclusive).
 * @returns       Newline-separated, tab-delimited clipboard string.
 */
export function selectionToClipboardText(
	rows: ReceiptRow[],
	r0: number,
	r1: number,
	c0: number,
	c1: number,
): string {
	const lines: string[] = [];
	for (let r = r0; r <= r1; r++) {
		if (!rows[r]) continue;
		const cells: string[] = [];
		for (let c = c0; c <= c1; c++) {
			cells.push(
				c === 0
					? rows[r].name
					: c === 1
						? rows[r].category ?? ''
						: rows[r].price > 0
							? rows[r].price.toFixed(2)
							: '',
			);
		}
		lines.push(cells.join('\t'));
	}
	return lines.join('\n');
}

// ── Size estimation ──────────────────────────────────────────────────────────

/**
 * Estimate the UTF-8 byte size of serialised ReceiptData.
 * Useful for display in storage-info UIs.
 */
export function estimateReceiptDataSizeBytes(data: ReceiptData): number {
	const json = JSON.stringify(data);
	return new TextEncoder().encode(json).length;
}

// ── CSV export ────────────────────────────────────────────────────────────────

/**
 * Serialise receipt rows to RFC 4180 CSV with a UTF-8 BOM header.
 * Values containing commas, double-quotes, or newlines are quoted and escaped.
 */
export function rowsToCsv(rows: ReceiptRow[]): string {
	const escape = (v: string): string =>
		/[,"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;

	return [
		'\uFEFFName,Price',
		...rows.map(
			(r) =>
				`${escape(r.name)},${Number.isFinite(r.price) ? r.price.toFixed(2) : '0.00'}`,
		),
	].join('\n');
}
