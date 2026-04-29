import { useMemo } from 'react';
import type { ReceiptScanRecord } from '../types';
import { parseSqliteDate } from '../utils';

export interface CategorySpend {
	category: string;
	amount: number;
	items: number;
}

/**
 * Computes per-category spending totals from receipt records within a date range.
 *
 * Used by both DashboardPage (with a chart date range) and
 * StatisticsPage (with a period range), eliminating duplicated logic.
 */
export function useCategorySpending(
	records: readonly ReceiptScanRecord[],
	rangeStart: Date | null,
	rangeEnd: Date | null,
	/** Custom date extractor — defaults to parseSqliteDate(r.createdAt) */
	getDate?: (r: ReceiptScanRecord) => Date | null,
): CategorySpend[] {
	return useMemo(() => {
		const extractDate = getDate ?? ((r: ReceiptScanRecord) => parseSqliteDate(r.createdAt));
		const totals: Record<string, number> = {};
		const counts: Record<string, number> = {};

		for (const r of records) {
			const d = extractDate(r);
			if (!d) continue;
			if (rangeStart && d < rangeStart) continue;
			if (rangeEnd) {
				const endOfDay = new Date(rangeEnd);
				endOfDay.setHours(23, 59, 59, 999);
				if (d > endOfDay) continue;
			}
			for (const row of r.data.rows) {
				if (row.price <= 0) continue;
				const cat = row.category?.trim() || 'Uncategorized';
				totals[cat] = (totals[cat] ?? 0) + row.price;
				counts[cat] = (counts[cat] ?? 0) + 1;
			}
		}

		return Object.entries(totals)
			.map(([category, amount]) => ({
				category,
				amount,
				items: counts[category] ?? 0,
			}))
			.sort((a, b) => b.amount - a.amount);
	}, [records, rangeStart, rangeEnd, getDate]);
}
