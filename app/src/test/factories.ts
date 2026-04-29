import { nanoid } from 'nanoid';
import type { ReceiptRow } from '../types';
import { NANOID_LENGTH } from '../constants';

/** Create a single ReceiptRow with stable _id and sensible defaults. */
export function row(overrides: Partial<ReceiptRow> = {}): ReceiptRow {
	return {
		_id: nanoid(NANOID_LENGTH),
		name: 'Test item',
		price: 1.99,
		category: undefined,
		...overrides,
	};
}

/** Create an array of n rows. */
export function rows(n: number, overrides: Partial<ReceiptRow> = {}): ReceiptRow[] {
	return Array.from({ length: n }, (_, i) => row({ name: `Item ${i + 1}`, ...overrides }));
}
