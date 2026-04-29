/**
 * In-process event payload types.
 */

import type { ReceiptData } from './receipt';

/** Detail payload for the in-process `receipt:scan-completed` custom event. */
export interface ReceiptScanCompletedDetail {
	receiptId: number;
	data: ReceiptData;
	imagePath: string | null;
	processedImagePath: string | null;
	purchaseDate: string | null;
	createdAt: string;
}
