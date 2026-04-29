import type { ReceiptScanRecord } from '../types';

export type Granularity = 'month' | 'week' | 'year';

export interface PeriodRange {
    start: Date;
    end: Date;
    label: string;
    prevStart: Date;
    prevEnd: Date;
    daysInPeriod: number;
}

export interface BarData {
    label: string;
    total: number;
    receipts: number;
    categories: Array<{ category: string; amount: number }>;
    /** Calendar date of the first day this bar represents. */
    periodStart: Date;
    /**
     * Only set when the parent granularity is 'month'.
     * The Monday that begins the ISO week containing this bucket's first day.
     */
    weekStart?: Date;
}

export function parseSqliteDate(raw: string): Date | null {
    // Date-only strings like 'YYYY-MM-DD' are parsed as UTC midnight by the
    // Date constructor, which shifts getDay()/getDate() to the previous
    // calendar day in Western timezones.  Append 'T12:00:00' to treat them
    // as local noon so the local date matches the intended calendar date.
    const normalized =
        raw.includes('T') || raw.includes(' ')
            ? raw.replace(' ', 'T')
            : `${raw}T12:00:00`;
    const d = new Date(normalized);
    return Number.isNaN(d.getTime()) ? null : d;
}

export function effectiveDate(r: ReceiptScanRecord): Date | null {
    return parseSqliteDate(r.purchaseDate ?? r.createdAt);
}

function isoWeekSunday(d: Date): Date {
    const sunday = new Date(d);
    sunday.setDate(d.getDate() - d.getDay()); // 0=Sun → no shift; 1=Mon → -1; etc.
    sunday.setHours(0, 0, 0, 0);
    return sunday;
}

function shortDate(d: Date): string {
    return d.toLocaleString('en-CA', { month: 'short', day: 'numeric' });
}

export function getPeriodRange(granularity: Granularity, offset: number): PeriodRange {
    const now = new Date();

    if (granularity === 'year') {
        const yr = now.getFullYear() + offset;
        const start = new Date(yr, 0, 1, 0, 0, 0, 0);
        const end = new Date(yr, 11, 31, 23, 59, 59, 999);
        const prevStart = new Date(yr - 1, 0, 1, 0, 0, 0, 0);
        const prevEnd = new Date(yr - 1, 11, 31, 23, 59, 59, 999);
        return { start, end, label: String(yr), prevStart, prevEnd, daysInPeriod: 365 };
    }

    if (granularity === 'month') {
        const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
        const start = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
        const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
        const prevD = new Date(d.getFullYear(), d.getMonth() - 1, 1);
        const prevStart = new Date(prevD.getFullYear(), prevD.getMonth(), 1, 0, 0, 0, 0);
        const prevEnd = new Date(prevD.getFullYear(), prevD.getMonth() + 1, 0, 23, 59, 59, 999);
        const label = start.toLocaleString('en-CA', { month: 'long', year: 'numeric' });
        return { start, end, label, prevStart, prevEnd, daysInPeriod: end.getDate() };
    }

    // week: Sun–Sat
    const day = now.getDay(); // 0=Sun, 1=Mon, …, 6=Sat
    const weekSunday = new Date(now);
    weekSunday.setDate(now.getDate() - day + offset * 7);
    weekSunday.setHours(0, 0, 0, 0);
    const weekSaturday = new Date(weekSunday);
    weekSaturday.setDate(weekSunday.getDate() + 6);
    weekSaturday.setHours(23, 59, 59, 999);
    const prevSunday = new Date(weekSunday);
    prevSunday.setDate(weekSunday.getDate() - 7);
    const prevSaturday = new Date(prevSunday);
    prevSaturday.setDate(prevSunday.getDate() + 6);
    prevSaturday.setHours(23, 59, 59, 999);
    return {
        start: weekSunday,
        end: weekSaturday,
        label: `${shortDate(weekSunday)} – ${shortDate(weekSaturday)}`,
        prevStart: prevSunday,
        prevEnd: prevSaturday,
        daysInPeriod: 7,
    };
}

export function buildBarData(
    records: ReceiptScanRecord[],
    range: PeriodRange,
    granularity: Granularity,
): BarData[] {
    if (granularity === 'year') {
        const yr = range.start.getFullYear();
        const buckets = Array.from({ length: 12 }, (_, m) => ({
            label: new Date(yr, m, 1).toLocaleString('en-CA', { month: 'short' }),
            total: 0,
            receipts: 0,
            catTotals: {} as Record<string, number>,
        }));
        for (const r of records) {
            const d = effectiveDate(r);
            if (!d || d < range.start || d > range.end) continue;
            const m = d.getMonth();
            buckets[m].receipts += 1;
            for (const row of r.data.rows) {
                buckets[m].total += row.price;
                if (row.price > 0) {
                    const cat = row.category?.trim() || 'Uncategorized';
                    buckets[m].catTotals[cat] = (buckets[m].catTotals[cat] ?? 0) + row.price;
                }
            }
        }
        return buckets.map(({ label, total, receipts, catTotals }, m) => ({
            label,
            total,
            receipts,
            categories: Object.entries(catTotals)
                .map(([category, amount]) => ({ category, amount }))
                .sort((a, b) => b.amount - a.amount),
            periodStart: new Date(range.start.getFullYear(), m, 1, 0, 0, 0, 0),
        }));
    }

    if (granularity === 'month') {
        // Build Sun–Sat aligned week buckets that cover the entire month.
        // Each bucket's periodStart is the Sunday of that week (may precede the
        // 1st of the month).  Receipts are still only counted when they fall
        // within the month's calendar range (range.start → range.end).
        const monthStart = range.start; // 1st of month, 00:00:00
        const monthEnd = range.end;     // last day of month, 23:59:59
        const firstSunday = isoWeekSunday(monthStart);

        interface WeekBucket {
            sunday: Date;
            saturday: Date;
            label: string;
            total: number;
            receipts: number;
            catTotals: Record<string, number>;
        }
        const buckets: WeekBucket[] = [];
        const cursor = new Date(firstSunday);
        while (cursor <= monthEnd) {
            const sunday = new Date(cursor);
            const saturday = new Date(sunday);
            saturday.setDate(sunday.getDate() + 6);
            saturday.setHours(23, 59, 59, 999);
            // Label shows the visible range clipped to the month boundaries
            const labelStart = sunday < monthStart ? monthStart : sunday;
            const labelEnd = saturday > monthEnd ? monthEnd : saturday;
            buckets.push({
                sunday,
                saturday,
                label: `${shortDate(labelStart)} – ${shortDate(labelEnd)}`,
                total: 0,
                receipts: 0,
                catTotals: {},
            });
            cursor.setDate(cursor.getDate() + 7);
        }

        for (const r of records) {
            const d = effectiveDate(r);
            if (!d || d < monthStart || d > monthEnd) continue;
            // Find the bucket whose Sun–Sat range contains this date
            for (const bucket of buckets) {
                if (d >= bucket.sunday && d <= bucket.saturday) {
                    bucket.receipts += 1;
                    for (const row of r.data.rows) {
                        bucket.total += row.price;
                        if (row.price > 0) {
                            const cat = row.category?.trim() || 'Uncategorized';
                            bucket.catTotals[cat] = (bucket.catTotals[cat] ?? 0) + row.price;
                        }
                    }
                    break;
                }
            }
        }

        return buckets.map(({ label, total, receipts, catTotals, sunday }) => ({
            label,
            total,
            receipts,
            categories: Object.entries(catTotals)
                .map(([category, amount]) => ({ category, amount }))
                .sort((a, b) => b.amount - a.amount),
            periodStart: sunday,
            weekStart: sunday,
        }));
    }

    // week: 7 daily bars Sun–Sat
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const buckets = days.map((label, i) => {
        const dayDate = new Date(range.start);
        dayDate.setDate(range.start.getDate() + i);
        dayDate.setHours(0, 0, 0, 0);
        return { label, total: 0, receipts: 0, catTotals: {} as Record<string, number>, periodStart: dayDate };
    });
    for (const r of records) {
        const d = effectiveDate(r);
        if (!d || d < range.start || d > range.end) continue;
        const dow = d.getDay(); // 0=Sun → idx 0, …, 6=Sat → idx 6
        const idx = dow;
        buckets[idx].receipts += 1;
        for (const row of r.data.rows) {
            buckets[idx].total += row.price;
            if (row.price > 0) {
                const cat = row.category?.trim() || 'Uncategorized';
                buckets[idx].catTotals[cat] = (buckets[idx].catTotals[cat] ?? 0) + row.price;
            }
        }
    }
    return buckets.map(({ label, total, receipts, catTotals, periodStart }) => ({
        label,
        total,
        receipts,
        categories: Object.entries(catTotals)
            .map(([category, amount]) => ({ category, amount }))
            .sort((a, b) => b.amount - a.amount),
        periodStart,
    }));
}

/**
 * Builds the drill-down URL for a bar click.
 * Returns null for year/month granularities (state-only drill, no stable URL)
 * or when the bar is empty / has no matching day records.
 */
export function buildDrillDownPath(
    granularity: Granularity,
    barIndex: number,
    barData: BarData[],
    period: PeriodRange,
    records: ReceiptScanRecord[],
    categoryName?: string,
): { receiptIds: number[]; label: string } | null {
    const data = barData[barIndex];
    if (!data || data.total === 0) return null;

    // Year and month drill-downs change ephemeral state — no stable URL
    if (granularity === 'year' || granularity === 'month') return null;

    if (granularity === 'week') {
        const clickedDate = new Date(period.start);
        clickedDate.setDate(period.start.getDate() + barIndex);
        clickedDate.setHours(0, 0, 0, 0);

        let dayRecords = records.filter((r) => {
            const d = effectiveDate(r);
            return (
                d != null &&
                d.getFullYear() === clickedDate.getFullYear() &&
                d.getMonth() === clickedDate.getMonth() &&
                d.getDate() === clickedDate.getDate()
            );
        });

        if (categoryName) {
            dayRecords = dayRecords.filter((r) =>
                r.data.rows.some(
                    (row) => (row.category?.trim() || 'Uncategorized') === categoryName && row.price > 0,
                ),
            );
        }

        if (dayRecords.length === 0) return null;
        const label = `Receipt — ${clickedDate.toLocaleDateString('en-CA', {
            month: 'short', day: 'numeric', year: 'numeric',
        })}`;
        return { receiptIds: dayRecords.map((r) => r.id), label };
    }

    return null;
}

/** Formats a Date as YYYY-MM-DD for use in URL query params. */
export function formatPeriodDate(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function computeKPIs(records: ReceiptScanRecord[], range: PeriodRange) {
    let periodTotal = 0;
    let periodReceipts = 0;
    let prevTotal = 0;
    for (const r of records) {
        const d = effectiveDate(r);
        if (!d) continue;
        const rTotal = r.data.rows.reduce((s, row) => s + row.price, 0);
        if (d >= range.start && d <= range.end) {
            periodTotal += rTotal;
            periodReceipts += 1;
        }
        if (d >= range.prevStart && d <= range.prevEnd) {
            prevTotal += rTotal;
        }
    }
    const delta = prevTotal > 0 ? ((periodTotal - prevTotal) / prevTotal) * 100 : null;
    const dailyAvg = range.daysInPeriod > 0 ? periodTotal / range.daysInPeriod : 0;
    return { periodTotal, periodReceipts, prevTotal, delta, dailyAvg };
}
