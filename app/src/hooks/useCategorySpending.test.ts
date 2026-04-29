/**
 * Tests for useCategorySpending and the Bug-2 fix.
 *
 * Bug-2 regression: statistics did not update when a user edited receipt data
 * in the spreadsheet, because applyEditableData only updated local state and
 * the global ReceiptCacheContext was only refreshed after the 500 ms debounce
 * + Tauri API call completed.
 *
 * Fix: applyEditableData now calls applyOptimistic({ ...cached, data: next })
 * immediately.  This causes useCategorySpending (pure useMemo on the records
 * array) to re-run synchronously, so statistics always reflect the latest
 * editable data.
 *
 * These tests verify the data-flow contract that makes the fix correct:
 * useCategorySpending is purely reactive to the records array, so any change
 * via applyOptimistic is immediately visible to statistics.
 */
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { useState } from 'react';
import { useCategorySpending } from './useCategorySpending';
import type { ReceiptScanRecord } from '../types/receipt';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeRecord(
	id: number,
	category: string,
	price: number,
	purchaseDate = '2026-06-15',
): ReceiptScanRecord {
	return {
		id,
		imagePath: null,
		processedImagePath: null,
		displayName: null,
		createdAt: `${purchaseDate} 10:00:00`,
		updatedAt: `${purchaseDate} 10:00:00`,
		purchaseDate,
		data: { rows: [{ name: 'Test item', price, category }] },
	};
}

const WIDE_START = new Date('2000-01-01');
const WIDE_END = new Date('2099-12-31');

// ── TC-STAT-1  Immediate reactivity of useCategorySpending ───────────────────

describe('useCategorySpending – immediate reactivity (Bug-2 regression)', () => {
	it('TC-STAT-1: reflects a category change as soon as the records array reference changes', () => {
		// Simulates applyOptimistic replacing the cached record with updated data.
		const initial: ReceiptScanRecord[] = [makeRecord(1, 'Vegetable', 10)];

		const { result, rerender } = renderHook(
			({ records }: { records: ReceiptScanRecord[] }) =>
				useCategorySpending(records, WIDE_START, WIDE_END),
			{ initialProps: { records: initial } },
		);

		expect(result.current.find((e) => e.category === 'Vegetable')?.amount).toBe(10);
		expect(result.current.find((e) => e.category === 'Meat')).toBeUndefined();

		// Simulate applyOptimistic: replace the record with updated category.
		const updated: ReceiptScanRecord[] = [makeRecord(1, 'Meat', 10)];
		rerender({ records: updated });

		expect(result.current.find((e) => e.category === 'Meat')?.amount).toBe(10);
		expect(result.current.find((e) => e.category === 'Vegetable')).toBeUndefined();
	});

	it('TC-STAT-2: reflects a price change immediately on record update', () => {
		const initial: ReceiptScanRecord[] = [makeRecord(1, 'Snacks', 5.0)];

		const { result, rerender } = renderHook(
			({ records }: { records: ReceiptScanRecord[] }) =>
				useCategorySpending(records, WIDE_START, WIDE_END),
			{ initialProps: { records: initial } },
		);

		expect(result.current.find((e) => e.category === 'Snacks')?.amount).toBe(5.0);

		// Simulate applyOptimistic with an edited price.
		const updated: ReceiptScanRecord[] = [makeRecord(1, 'Snacks', 8.5)];
		rerender({ records: updated });

		expect(result.current.find((e) => e.category === 'Snacks')?.amount).toBe(8.5);
	});

	it('TC-STAT-3: stale records still show old data (confirms the bug existed before fix)', () => {
		// If records are NOT updated (i.e., only editableData local state changes),
		// the hook should still return the old values.  This confirms why the fix
		// was necessary: local state changes alone do not propagate to statistics.
		const records: ReceiptScanRecord[] = [makeRecord(1, 'Vegetable', 10)];

		const { result, rerender } = renderHook(
			({ records: r }: { records: ReceiptScanRecord[] }) =>
				useCategorySpending(r, WIDE_START, WIDE_END),
			{ initialProps: { records } },
		);

		// Re-render with the SAME reference (no applyOptimistic called).
		rerender({ records });

		expect(result.current.find((e) => e.category === 'Vegetable')?.amount).toBe(10);
	});

	it('TC-STAT-4: useState-driven records update propagates instantly (models the fixed path)', () => {
		// Models the fixed applyEditableData path:
		// applyOptimistic → updates ReceiptCacheContext state →
		//   records reference changes → useCategorySpending re-runs
		const initial: ReceiptScanRecord[] = [makeRecord(1, 'Vegetable', 10)];

		const { result } = renderHook(() => {
			const [records, setRecords] = useState<ReceiptScanRecord[]>(initial);
			const spending = useCategorySpending(records, WIDE_START, WIDE_END);
			return { spending, setRecords };
		});

		expect(result.current.spending.find((e) => e.category === 'Vegetable')?.amount).toBe(10);

		// Simulate the optimistic update (category reassigned to Dairy & Eggs).
		act(() => {
			result.current.setRecords([makeRecord(1, 'Dairy & Eggs', 10)]);
		});

		expect(result.current.spending.find((e) => e.category === 'Dairy & Eggs')?.amount).toBe(10);
		expect(result.current.spending.find((e) => e.category === 'Vegetable')).toBeUndefined();
	});
});
