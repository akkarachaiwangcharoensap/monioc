/**
 * Receipt scanner data types.
 */

import type { CUSTOM_GROCERY_CATEGORIES } from '../constants';

export interface ReceiptRow {
	/** Stable opaque ID assigned at creation; hydrated from persisted data if absent. */
	_id?: string;
	name: string;
	price: number;
	category?: string;
}

export type GroceryCategory = (typeof CUSTOM_GROCERY_CATEGORIES)[number];

export interface ReceiptData {
	rows: ReceiptRow[];
}

export interface ReceiptScanRecord {
	id: number;
	displayName: string | null;
	imagePath: string | null;
	processedImagePath: string | null;
	data: ReceiptData;
	createdAt: string;
	updatedAt: string;
	purchaseDate: string | null;
}

export interface ScanReceiptResponse {
	data: ReceiptData;
	processedImagePath: string | null;
}

export type EditorTab = 'table' | 'json';
