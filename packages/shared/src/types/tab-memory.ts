/**
 * Per-tab receipt scanner state types.
 * Managed by TabMemoryContext.
 */

import type { ReceiptData } from './receipt';

/** Per-image scan result stored in tab memory. Survives tab switches. */
export interface TabMemoryScanResult {
	result: ReceiptData;
	editableData: ReceiptData;
	scanId: number;
	persistedSignature: string;
	imagePath: string | null;
	processedImagePath: string | null;
	purchaseDate?: string | null;
	/** Creation timestamp of the receipt record — used as a purchase-date fallback when purchaseDate is null. */
	createdAt?: string | null;
	errorMsg?: string;
}

/** Per-tab in-memory receipt scanner state. Managed by TabMemoryContext. */
export interface TabMemory {
	imageQueue: string[];
	queueEdits: Record<string, string>;
	queueScanResults: Record<string, TabMemoryScanResult>;
	/** Maps imagePath → jobKey. Used to look up job status. */
	jobKeys: Record<string, string>;
	/**
	 * Error messages for scan/categorize jobs, keyed by basePath.
	 * Set by TabMemoryContext when a job reaches error/cancelled.
	 * Cleared by useScanReceipt.scan() when retrying.
	 */
	queueErrors?: Record<string, string>;
	selectedScanId: number | null;
	activeBasePath: string | null;
	/**
	 * Ordered list of receipt IDs loaded in the editor workspace.
	 * Only used by the /receipts/editor tab.
	 * @deprecated Use `workspaceItems` instead. Kept during dual-write migration.
	 */
	loadedReceiptIds?: number[];
	/**
	 * The receipt ID currently selected/active in the editor workspace.
	 * Only used by the /receipts/editor tab.
	 * @deprecated Use `activeWorkspaceKey` instead. Kept during dual-write migration.
	 */
	activeReceiptId?: number | null;
	/**
	 * Set of base image paths currently awaiting cancel confirmation from the
	 * backend.  While a path is in this set the scan button is disabled and
	 * the cancel button is hidden, preventing a new scan from racing the
	 * in-flight cancel request.  Removed when the Cancelled event arrives.
	 */
	cancellingPaths?: Set<string>;
	/**
	 * Receipt scan IDs that completed scanning in this session. Used by the
	 * scanner tab to restore the "All Done" CTA after a tab switch/remount.
	 * Populated by TabMemoryContext when a scan job reaches the `done` phase.
	 * Cleared when the user opens the completed receipts in the editor.
	 * Only relevant for the scanner tab (tabs with `loadedReceiptIds` set are
	 * treated as editor tabs and this field is left untouched).
	 * @deprecated Will be removed after upload-first migration.
	 */
	completedScanIds?: number[];

	// ── Upload-first workspace fields (dual-write) ──────────────────────

	/**
	 * Ordered workspace items for the editor tab.  Each entry is keyed by
	 * a stable string (receipt ID stringified for saved receipts, image path
	 * for unsaved uploads) and carries payload needed by the editor.
	 */
	workspaceItems?: WorkspaceItem[];
	/**
	 * Key of the currently active workspace item.  Corresponds to a
	 * `WorkspaceItem.key`.
	 */
	activeWorkspaceKey?: string | null;
	/**
	 * Set of receipt scan IDs that this tab has already registered in its
	 * workspace.  Prevents duplicate insertion when the same scan-done event
	 * is processed multiple times (e.g. after a tab switch/remount).
	 */
	registeredScanIds?: Set<number>;
	/**
	 * Flag set when the user clears the workspace.  Used by the editor to
	 * short-circuit hydration logic that would otherwise re-populate the
	 * workspace from route params.
	 */
	workspaceCleared?: boolean;
	/**
	 * Stable mapping from receipt ID → the basePath (imageQueue tracking key)
	 * that was registered when the receipt was first added to the editor queue
	 * via initFromRecord.  This key is intentionally NOT updated when a Re-Scan
	 * replaces the DB record's imagePath (TS1 → TS2 → TS3…), so all subsequent
	 * jobKeys / queueScanResults lookups continue to use the original stable key.
	 * Cleared per-entry in removeReceiptFromWorkspace; cleared entirely when the
	 * workspace is emptied.
	 */
	receiptBasePathMap?: Record<number, string>;
}

/**
 * A single item in the editor workspace.  Can represent either a saved
 * receipt (from a scan) or an unsaved image upload awaiting scanning.
 */
export interface WorkspaceItem {
	/**
	 * Stable identifier: receipt ID (stringified) for saved receipts,
	 * or image file path for unsaved uploads.
	 */
	key: string;
	/** Receipt scan ID if this item has been saved; undefined for unsaved uploads. */
	scanId?: number;
	/** Image file path (original upload path or receipt image path). */
	imagePath?: string;
	/** Label shown in the workspace chip/tab. */
	label?: string;
}
