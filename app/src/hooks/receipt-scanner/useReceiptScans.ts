/**
 * useReceiptScans — thin adapter over ReceiptCacheContext.
 *
 * All data fetching and real-time updates are handled by ReceiptCacheContext.
 * This hook exists solely as a stable API so existing call sites compile
 * without changes.
 */

import type { ReceiptScanRecord } from '../../types';
import { useReceiptCache } from '../../context/ReceiptCacheContext';

export interface UseReceiptScansResult {
	/** Ordered list of all saved receipt scans (newest first). */
	savedScans: ReceiptScanRecord[];
	/** True while the initial list fetch is in-flight. */
	isListLoading: boolean;
	/** No-op: the cache is kept up-to-date by Tauri events. */
	loadSavedScans: () => Promise<void>;
}

export function useReceiptScans(): UseReceiptScansResult {
	const { receipts, isInitialLoading } = useReceiptCache();
	return {
		savedScans: receipts,
		isListLoading: isInitialLoading,
		loadSavedScans: () => Promise.resolve(),
	};
}
