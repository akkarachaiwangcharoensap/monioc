import type React from 'react';
import ReceiptScannerPage from './ReceiptScannerPage';

/**
 * `/receipt-scanner/new` — fresh scan flow.
 *
 * Thin wrapper around ReceiptScannerPage. Tab memory is preserved across tab
 * switches (unmount/remount) and is only evicted when the tab is explicitly
 * closed (handled by TabContext.executeClose). Do NOT evict here — that would
 * wipe in-progress scan jobs every time the user switches away and back.
 */
export default function NewScanPage(): React.ReactElement {
	return <ReceiptScannerPage />;
}
