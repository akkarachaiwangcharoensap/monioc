/**
 * Utilities for parsing and interpreting scan-progress event payloads
 * emitted by the Rust OCR backend during a receipt scan.
 *
 * Kept in a standalone module so it can be imported by both the context
 * provider and unit tests without pulling in any React dependencies.
 */

/**
 * Parse a "Step X/Y — ..." backend progress message into a 0–100 percentage.
 *
 * Examples:
 *   "Step 1/3 — Recognizing text in image" → 33
 *   "Step 2/3 — Post-processing"            → 66
 *   "Step 3/3 — Structuring data"           → 100
 *   "Done."                                 → 100
 *   "Downloading model: 1.2/4.5 GB (27%)"   → null  (download, not a step msg)
 *   ""                                      → null
 *
 * @returns 0–100 integer, or null if the message doesn't match.
 */
export function parseStepProgress(msg: string): number | null {
	const m = msg.match(/Step\s+(\d+)\/(\d+)/i);
	if (m) return Math.round((+m[1] / +m[2]) * 100);
	if (/\bDone\b/.test(msg)) return 100;
	return null;
}
