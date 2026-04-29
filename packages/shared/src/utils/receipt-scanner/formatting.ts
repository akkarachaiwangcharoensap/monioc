/**
 * String-formatting utilities for the receipt scanner UI.
 *
 * All functions are pure and have no Tauri/React dependencies.
 */

/**
 * Returns the filename from an absolute or relative path (cross-platform).
 */
export function fileNameFromPath(path: string): string {
	const normalized = path.replace(/\\/g, '/');
	const lastSlash = normalized.lastIndexOf('/');
	return lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized;
}

/**
 * Strip internal Tauri/Rust error-type prefixes and, for multi-line Python
 * tracebacks, extract the last meaningful error line so the user sees a
 * concise, actionable message instead of a raw stack trace.
 */
export function cleanScanError(raw: string): string {
	// Quick exit for known cancellation messages.
	if (/cancelled|canceled/i.test(raw)) return 'Scan cancelled.';

	const stripped = raw
		.replace(/^(Processing|I\/O|Database|Path)\s+error:\s*/i, '')
		.trim();

	// Filter out noisy Python internals (warnings.warn, tqdm, logging lines)
	// so the user only sees actionable error messages.
	const lines = stripped
		.split('\n')
		.map((l) => l.trim())
		.filter(Boolean)
		.filter((l) => !/^warnings\.warn\b|^\d+%\||^\s*from\s|^Traceback|^\s*File "/i.test(l));

	if (lines.length === 0) return 'Scan failed. Please try again.';

	if (lines.length > 1) {
		const lastErr = [...lines].reverse().find((l) =>
			/^(Error|Exception|RuntimeError|ModuleNotFoundError|ValueError|TypeError|OSError):/i.test(l) ||
			/\berror\b|\bfailed\b|\bnot found\b/i.test(l),
		);
		return lastErr ?? lines[lines.length - 1];
	}
	return lines[0];
}
