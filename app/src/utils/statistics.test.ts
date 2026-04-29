import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ReceiptScanRecord } from '../types';
import {
    parseSqliteDate,
    effectiveDate,
    getPeriodRange,
    buildBarData,
    computeKPIs,
    formatPeriodDate,
} from './statistics';
import { row } from '../test/factories';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeRecord(
    overrides: Partial<ReceiptScanRecord> & { rows?: ReturnType<typeof row>[] } = {},
): ReceiptScanRecord {
    const { rows: rowItems = [row({ price: 10 })], ...rest } = overrides;
    return {
        id: 1,
        displayName: null,
        imagePath: null,
        processedImagePath: null,
        createdAt: '2025-06-15 12:00:00',
        updatedAt: '2025-06-15 12:00:00',
        purchaseDate: null,
        data: { rows: rowItems },
        ...rest,
    };
}

// ── parseSqliteDate ───────────────────────────────────────────────────────────

describe('parseSqliteDate', () => {
    it('parses a space-separated SQLite datetime string', () => {
        const d = parseSqliteDate('2025-06-15 10:30:00');
        expect(d).toBeInstanceOf(Date);
        expect(d?.getFullYear()).toBe(2025);
        expect(d?.getMonth()).toBe(5); // June = 5
        expect(d?.getDate()).toBe(15);
    });

    it('parses an ISO 8601 string (T-separator)', () => {
        const d = parseSqliteDate('2025-01-01T00:00:00');
        expect(d).toBeInstanceOf(Date);
        expect(d?.getFullYear()).toBe(2025);
    });

    it('parses a date-only string as local date (no UTC shift)', () => {
        // '2026-04-06' is a Monday.  Without the fix, new Date('2026-04-06')
        // would create UTC midnight, which becomes Sunday in Western timezones.
        const d = parseSqliteDate('2026-04-06');
        expect(d).toBeInstanceOf(Date);
        expect(d?.getFullYear()).toBe(2026);
        expect(d?.getMonth()).toBe(3); // April = 3
        expect(d?.getDate()).toBe(6);
        expect(d?.getDay()).toBe(1); // Monday
    });

    it('returns null for an invalid string', () => {
        expect(parseSqliteDate('not-a-date')).toBeNull();
        expect(parseSqliteDate('')).toBeNull();
    });
});

// ── effectiveDate ─────────────────────────────────────────────────────────────

describe('effectiveDate', () => {
    it('uses purchaseDate when present', () => {
        const r = makeRecord({ purchaseDate: '2025-03-10 08:00:00', createdAt: '2025-06-15 12:00:00' });
        const d = effectiveDate(r);
        expect(d?.getMonth()).toBe(2); // March = 2
    });

    it('falls back to createdAt when purchaseDate is null', () => {
        const r = makeRecord({ purchaseDate: null, createdAt: '2025-06-15 12:00:00' });
        const d = effectiveDate(r);
        expect(d?.getMonth()).toBe(5); // June = 5
    });
});

// ── getPeriodRange ────────────────────────────────────────────────────────────

describe('getPeriodRange', () => {
    const FIXED_NOW = new Date(2025, 5, 15); // June 15, 2025 (Sunday)

    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(FIXED_NOW);
    });
    afterEach(() => vi.useRealTimers());

    it('month offset 0 → current month start/end', () => {
        const p = getPeriodRange('month', 0);
        expect(p.start).toEqual(new Date(2025, 5, 1, 0, 0, 0, 0));
        expect(p.end).toEqual(new Date(2025, 5, 30, 23, 59, 59, 999));
        expect(p.daysInPeriod).toBe(30);
        expect(p.label).toMatch(/June 2025/i);
    });

    it('month offset -1 → previous month', () => {
        const p = getPeriodRange('month', -1);
        expect(p.start).toEqual(new Date(2025, 4, 1, 0, 0, 0, 0));
        expect(p.end).toEqual(new Date(2025, 4, 31, 23, 59, 59, 999));
    });

    it('year offset 0 → current year Jan–Dec', () => {
        const p = getPeriodRange('year', 0);
        expect(p.start).toEqual(new Date(2025, 0, 1, 0, 0, 0, 0));
        expect(p.end).toEqual(new Date(2025, 11, 31, 23, 59, 59, 999));
        expect(p.label).toBe('2025');
    });

    it('year offset -1 → prior year', () => {
        const p = getPeriodRange('year', -1);
        expect(p.start.getFullYear()).toBe(2024);
    });

    it('week offset 0 → Sun–Sat week containing today (Sunday → starts today)', () => {
        // June 15, 2025 is a Sunday: Sun–Sat week is Jun 15 (Sun) – Jun 21 (Sat)
        const p = getPeriodRange('week', 0);
        expect(p.start).toEqual(new Date(2025, 5, 15, 0, 0, 0, 0));
        expect(p.end).toEqual(new Date(2025, 5, 21, 23, 59, 59, 999));
        expect(p.daysInPeriod).toBe(7);
    });

    it('week offset 0 → label is a Sun–Sat date-range string', () => {
        // June 15, 2025 is Sunday; week is Jun 15 (Sun) – Jun 21 (Sat)
        const p = getPeriodRange('week', 0);
        expect(p.label).toBe('Jun 15 – Jun 21');
    });

    it('week offset -1 → label is the previous week date range', () => {
        // Previous week: Jun 8 (Sun) – Jun 14 (Sat)
        const p = getPeriodRange('week', -1);
        expect(p.label).toBe('Jun 8 – Jun 14');
    });

    it('year offset -1 → label is the prior year as a string', () => {
        const p = getPeriodRange('year', -1);
        expect(p.label).toBe('2024');
    });

    it('month offset -1 → label is the prior month', () => {
        const p = getPeriodRange('month', -1);
        expect(p.label).toMatch(/May 2025/i);
    });
});

// ── buildBarData ──────────────────────────────────────────────────────────────

describe('buildBarData', () => {
    const FIXED_NOW = new Date(2025, 5, 15);
    beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(FIXED_NOW); });
    afterEach(() => vi.useRealTimers());

    it('year granularity → 12 monthly buckets', () => {
        const range = getPeriodRange('year', 0);
        const bars = buildBarData([], range, 'year');
        expect(bars).toHaveLength(12);
        expect(bars[0].label).toBe('Jan');
        expect(bars[11].label).toBe('Dec');
    });

    it('year granularity → correct bucket aggregation', () => {
        const range = getPeriodRange('year', 0);
        const records = [
            makeRecord({ purchaseDate: '2025-01-10 10:00:00', data: { rows: [row({ price: 20 })] } }),
            makeRecord({ id: 2, purchaseDate: '2025-01-20 10:00:00', data: { rows: [row({ price: 30 })] } }),
            makeRecord({ id: 3, purchaseDate: '2025-06-05 10:00:00', data: { rows: [row({ price: 15 })] } }),
        ];
        const bars = buildBarData(records, range, 'year');
        expect(bars[0].total).toBeCloseTo(50); // Jan
        expect(bars[5].total).toBeCloseTo(15); // Jun
        expect(bars[0].receipts).toBe(2);
    });

    it('month granularity → 4 or 5 weekly buckets', () => {
        const range = getPeriodRange('month', 0); // June has 30 days → 5 buckets
        const bars = buildBarData([], range, 'month');
        expect(bars.length).toBeGreaterThanOrEqual(4);
        expect(bars[0].label).toBe('Jun 1 – Jun 7');
    });

    it('month granularity → assigns day 1–7 to first range, day 8–14 to second range', () => {
        const range = getPeriodRange('month', 0);
        const records = [
            makeRecord({ purchaseDate: '2025-06-03 10:00:00', data: { rows: [row({ price: 10 })] } }),
            makeRecord({ id: 2, purchaseDate: '2025-06-10 10:00:00', data: { rows: [row({ price: 20 })] } }),
        ];
        const bars = buildBarData(records, range, 'month');
        expect(bars[0].total).toBeCloseTo(10); // Jun 1 – Jun 7
        expect(bars[1].total).toBeCloseTo(20); // Jun 8 – Jun 14
    });

    it('week granularity → 7 daily buckets Sun–Sat', () => {
        const range = getPeriodRange('week', 0);
        const bars = buildBarData([], range, 'week');
        expect(bars).toHaveLength(7);
        expect(bars[0].label).toBe('Sun');
        expect(bars[6].label).toBe('Sat');
    });

    it('week granularity → correct daily bucket assignment', () => {
        const range = getPeriodRange('week', 0); // Jun 15 (Sun) – Jun 21 (Sat)
        const records = [
            makeRecord({ purchaseDate: '2025-06-15 10:00:00', data: { rows: [row({ price: 5 })] } }), // Sun
            makeRecord({ id: 2, purchaseDate: '2025-06-21 10:00:00', data: { rows: [row({ price: 8 })] } }), // Sat
        ];
        const bars = buildBarData(records, range, 'week');
        expect(bars[0].total).toBeCloseTo(5);  // Sun
        expect(bars[6].total).toBeCloseTo(8);  // Sat
    });

    it('week granularity → date-only purchaseDate lands in correct day bucket', () => {
        // April 5, 2026 is Sunday, April 11 is Saturday
        vi.setSystemTime(new Date(2026, 3, 6)); // April 6, 2026 (Monday)
        const range = getPeriodRange('week', 0);

        // Date-only string: 2026-04-06 is a Monday → should land in Mon bucket
        const records = [
            makeRecord({
                purchaseDate: '2026-04-06',
                data: { rows: [row({ price: 42 })] },
            }),
        ];
        const bars = buildBarData(records, range, 'week');
        expect(bars[1].label).toBe('Mon');
        expect(bars[1].total).toBeCloseTo(42); // Mon bucket, not Sun
        expect(bars[0].total).toBe(0);          // Sun should be empty
    });
});

// ── computeKPIs ───────────────────────────────────────────────────────────────

describe('computeKPIs', () => {
    const FIXED_NOW = new Date(2025, 5, 15);
    beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(FIXED_NOW); });
    afterEach(() => vi.useRealTimers());

    it('sums periodTotal and counts periodReceipts', () => {
        const range = getPeriodRange('month', 0);
        const records = [
            makeRecord({ purchaseDate: '2025-06-01 10:00:00', data: { rows: [row({ price: 40 }), row({ price: 10 })] } }),
            makeRecord({ id: 2, purchaseDate: '2025-06-20 10:00:00', data: { rows: [row({ price: 25 })] } }),
        ];
        const kpis = computeKPIs(records, range);
        expect(kpis.periodTotal).toBeCloseTo(75);
        expect(kpis.periodReceipts).toBe(2);
    });

    it('excludes records outside the period', () => {
        const range = getPeriodRange('month', 0);
        const records = [
            makeRecord({ purchaseDate: '2025-05-15 10:00:00', data: { rows: [row({ price: 99 })] } }), // May
        ];
        const kpis = computeKPIs(records, range);
        expect(kpis.periodTotal).toBe(0);
        expect(kpis.periodReceipts).toBe(0);
    });

    it('computes delta percentage vs previous period', () => {
        const range = getPeriodRange('month', 0); // Jun; prev = May
        const records = [
            makeRecord({ purchaseDate: '2025-05-10 10:00:00', data: { rows: [row({ price: 100 })] } }), // prev
            makeRecord({ id: 2, purchaseDate: '2025-06-10 10:00:00', data: { rows: [row({ price: 150 })] } }), // current
        ];
        const kpis = computeKPIs(records, range);
        expect(kpis.delta).toBeCloseTo(50); // +50%
    });

    it('returns null delta when previous period is zero', () => {
        const range = getPeriodRange('month', 0);
        const records = [
            makeRecord({ purchaseDate: '2025-06-10 10:00:00', data: { rows: [row({ price: 50 })] } }),
        ];
        const kpis = computeKPIs(records, range);
        expect(kpis.delta).toBeNull();
    });

    it('computes dailyAvg as total / daysInPeriod', () => {
        const range = getPeriodRange('month', 0); // 30 days in June
        const records = [
            makeRecord({ purchaseDate: '2025-06-10 10:00:00', data: { rows: [row({ price: 60 })] } }),
        ];
        const kpis = computeKPIs(records, range);
        expect(kpis.dailyAvg).toBeCloseTo(60 / 30);
    });
});

describe('formatPeriodDate', () => {
    it('formats a mid-year date as YYYY-MM-DD', () => {
        const d = new Date(2025, 5, 9); // June 9, 2025
        expect(formatPeriodDate(d)).toBe('2025-06-09');
    });

    it('zero-pads single-digit month and day', () => {
        const d = new Date(2025, 0, 5); // Jan 5, 2025
        expect(formatPeriodDate(d)).toBe('2025-01-05');
    });

    it('handles December correctly', () => {
        const d = new Date(2024, 11, 31); // Dec 31, 2024
        expect(formatPeriodDate(d)).toBe('2024-12-31');
    });
});
