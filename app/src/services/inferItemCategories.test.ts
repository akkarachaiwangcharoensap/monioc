/**
 * Unit tests — inferItemCategories Bug 2 regression.
 *
 * Bug 2: The Tauri command `infer_item_categories` was called without a `data`
 * payload.  On the Rust side, `process_categorize` then fetched the receipt
 * from the DB (potentially stale) and used that data for `apply_categories`,
 * discarding any unsaved renames the user had made in the editor.
 *
 * The fix: TypeScript now passes `data: editableData` in the payload so Rust
 * operates on the **current** frontend data, not the stale DB snapshot.
 *
 * These tests verify:
 *  1. The Tauri invoke for `infer_item_categories` includes a `data` field.
 *  2. The `data.rows` reflect the current item names (e.g. "POTATO CHIP",
 *     not the original "HST Tax" that may still be in the DB).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReceiptData } from '../types/receipt';

// ── Mock Tauri invoke before importing the module under test ────────────────

// vi.mock is hoisted — use vi.hoisted so mockInvoke is available inside the factory.
const mockInvoke = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({ invoke: mockInvoke }));

// Late import so the mock is in place
import { TauriApi } from './api';

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** Current (post-rename) editableData — what the user sees in the editor. */
const CURRENT_DATA: ReceiptData = {
	rows: [
		{ name: 'POTATO CHIP', price: 1.99 },
		{ name: 'Organic Milk', price: 4.49 },
	],
};

/** Stale DB data — what would have been used before the fix. */
const STALE_DB_DATA: ReceiptData = {
	rows: [
		{ name: 'HST Tax', price: 1.99 },
		{ name: 'Organic Milk', price: 4.49 },
	],
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TauriApi.inferItemCategories — Bug 2 regression', () => {
	beforeEach(() => {
		mockInvoke.mockReset();
		mockInvoke.mockResolvedValue('job-key-42');
	});

	// TC-C1: The invoke payload MUST contain a data field (the fix)
	it('TC-C1: passes data field to the Tauri invoke call', async () => {
		await TauriApi.inferItemCategories({
			receiptId: 1,
			items: ['POTATO CHIP', 'Organic Milk'],
			categories: ['Snacks', 'Dairy'],
			data: CURRENT_DATA,
		});

		expect(mockInvoke).toHaveBeenCalledOnce();
		const [, payload] = mockInvoke.mock.calls[0];
		expect(payload).toHaveProperty('data');
	});

	// TC-C2: The data field contains the current (renamed) item names
	it('TC-C2: data field reflects current editableData rows (renamed items)', async () => {
		await TauriApi.inferItemCategories({
			receiptId: 1,
			items: ['POTATO CHIP', 'Organic Milk'],
			categories: ['Snacks', 'Dairy'],
			data: CURRENT_DATA,
		});

		const [, payload] = mockInvoke.mock.calls[0];
		expect(payload.data.rows[0].name).toBe('POTATO CHIP');
	});

	// TC-C3: The data field does NOT contain stale DB row names
	it('TC-C3: data field is not the stale DB snapshot', async () => {
		await TauriApi.inferItemCategories({
			receiptId: 1,
			items: ['POTATO CHIP', 'Organic Milk'],
			categories: ['Snacks', 'Dairy'],
			data: CURRENT_DATA,
		});

		const [, payload] = mockInvoke.mock.calls[0];
		expect(payload.data).not.toEqual(STALE_DB_DATA);
		expect(payload.data.rows[0].name).not.toBe('HST Tax');
	});

	// TC-C4: The items array also reflects current (renamed) names
	it('TC-C4: items array reflects current item names', async () => {
		await TauriApi.inferItemCategories({
			receiptId: 1,
			items: ['POTATO CHIP', 'Organic Milk'],
			categories: ['Snacks', 'Dairy'],
			data: CURRENT_DATA,
		});

		const [, payload] = mockInvoke.mock.calls[0];
		expect(payload.items).toEqual(['POTATO CHIP', 'Organic Milk']);
		expect(payload.items).not.toContain('HST Tax');
	});

	// TC-C5: data and items are consistent (same names)
	it('TC-C5: data.rows names match the items array', async () => {
		const items = CURRENT_DATA.rows.map((r) => r.name);

		await TauriApi.inferItemCategories({
			receiptId: 1,
			items,
			categories: ['Snacks', 'Dairy'],
			data: CURRENT_DATA,
		});

		const [, payload] = mockInvoke.mock.calls[0];
		const rowNames = payload.data.rows.map((r: { name: string }) => r.name);
		expect(rowNames).toEqual(payload.items);
	});

	// TC-C6: returns the job key from the backend
	it('TC-C6: returns the job key returned by invoke', async () => {
		const jobKey = await TauriApi.inferItemCategories({
			receiptId: 5,
			items: ['Apple'],
			categories: ['Produce'],
			data: { rows: [{ name: 'Apple', price: 1.0 }] },
		});

		expect(jobKey).toBe('job-key-42');
	});
});
