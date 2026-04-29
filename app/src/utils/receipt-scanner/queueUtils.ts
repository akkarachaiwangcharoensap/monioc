/**
 * Pure utility functions for the receipt image queue.
 *
 * Extracted from useScanReceipt so they can be unit-tested without React.
 */

import { SUPPORTED_IMAGE_EXTENSIONS } from '../../constants';

/** Allowed image extensions for the receipt scanner queue. */
export const ALLOWED_IMAGE_EXTS = new Set<string>(SUPPORTED_IMAGE_EXTENSIONS);

/** Pending scan entry queued by useScanReceipt before OCR starts. */
export interface PendingScanQueueItem {
	basePath: string | null;
	scanSourcePath: string;
	persistedImagePath: string;
	scanId: number | null;
}


/**
 * Returns true if the file path has an allowed image extension.
 * Used for both the upload filter and Tauri drag-drop validation.
 */
export function isAllowedImagePath(filePath: string): boolean {
	const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
	return ALLOWED_IMAGE_EXTS.has(ext);
}

/**
 * Merges new paths into an existing queue, deduplicating existing entries.
 * Returns the merged queue and only the paths that were newly added.
 */
export function mergeQueue(
	current: string[],
	additions: string[],
): { queue: string[]; added: string[] } {
	const added = additions.filter((p) => !current.includes(p));
	return { queue: [...current, ...added], added };
}

/**
 * Resolves the active path for a queued image — returns the edited version
 * if one exists in the edits map, otherwise returns the original base path.
 */
export function resolveEditedPath(
	basePath: string,
	edits: Record<string, string>,
): string {
	return edits[basePath] ?? basePath;
}

/**
 * Returns a new edits map with the given base path removed.
 * Does not mutate the original object.
 */
export function removeEdit(
	edits: Record<string, string>,
	basePath: string,
): Record<string, string> {
	const next = { ...edits };
	delete next[basePath];
	return next;
}

/**
 * Returns true when a Tauri drag-enter event should activate the drop-zone UI.
 *
 * External OS file drops always include `paths`; internal HTML5 element drags
 * (e.g. dragging a thumbnail <img>) surface as Tauri drag events with an empty
 * paths array on WebKit/Tauri. Guarding on both non-empty and at least one
 * allowed image extension prevents the overlay from flashing on internal drags.
 */
export function shouldAcceptDragEnter(paths: string[]): boolean {
	return paths.length > 0 && paths.some(isAllowedImagePath);
}

/**
 * Returns a new scan queue with all entries for `basePath` removed.
 * Used when a queued image is removed before its OCR task starts.
 */
export function removePendingScansForBasePath(
	queue: PendingScanQueueItem[],
	basePath: string,
): PendingScanQueueItem[] {
	return queue.filter((item) => item.basePath !== basePath);
}

