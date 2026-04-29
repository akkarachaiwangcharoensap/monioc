/**
 * Domain factories for receipt rows.
 *
 * `makeRow()` is the canonical way to create a new ReceiptRow — it always
 * assigns a stable, unique `_id` so that React can key rows by identity.
 *
 * `hydrateIds()` backfills IDs onto rows that were persisted before the
 * _id field was introduced (backward compatibility).
 */

import { nanoid } from 'nanoid';
import type { ReceiptRow } from '../types';
import { NANOID_LENGTH } from '../constants';

export function makeRow(partial: Partial<Omit<ReceiptRow, '_id'>> = {}): ReceiptRow {
	return { _id: nanoid(NANOID_LENGTH), name: '', price: 0, ...partial };
}

export function hydrateIds(rows: ReceiptRow[]): ReceiptRow[] {
	return rows.map((r) => (r._id ? r : { ...r, _id: nanoid(NANOID_LENGTH) }));
}
