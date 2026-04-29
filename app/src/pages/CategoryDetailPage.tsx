/**
 * Category Detail Page
 *
 * Shows all purchases in a specific spending category with a monthly trend
 * chart, individual line items, and the receipts they appeared on.
 */
import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import type React from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Cell,
} from 'recharts';
import type { ReceiptScanRecord, ReceiptRow } from '../types';
import { useReceiptCache } from '../context/ReceiptCacheContext';
import { formatMoney, effectiveDate, buildBarData, buildDrillDownPath, getPeriodRange, type Granularity, type BarData } from '../utils';
import { getReceiptDisplayName } from '../utils/receipt-scanner/receiptSession';
import { ROUTES, STORAGE_KEYS } from '../constants';
import { useTabContext } from '../context/TabContext';
import { FeatureGate } from '../components/FeatureGate';
import Pagination from '../components/ui/Pagination';
import NavButton from '../components/ui/NavButton';
import SearchInput from '../components/ui/SearchInput';
import GranularityToggle from '../components/ui/GranularityToggle';


// ── helpers ───────────────────────────────────────────────────────────────────

interface CtxMenu { x: number; y: number; receiptIds: number[]; label: string; }

interface CustomTooltipProps {
    active?: boolean;
    payload?: Array<{ value: number }>;
    label?: string;
}
function BarTooltip({ active, payload, label }: CustomTooltipProps): React.ReactElement | null {
    if (!active || !payload?.length) return null;
    return (
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-lg text-xs">
            <p className="font-semibold text-slate-700">{label}</p>
            <p className="text-slate-600 mt-0.5">{formatMoney(payload[0].value)}</p>
        </div>
    );
}

/** A single purchase line item with the receipt it came from. */
interface PurchaseEntry {
    row: ReceiptRow;
    receipt: ReceiptScanRecord;
    date: Date;
}

type ActiveSorts = {
    sortBy: 'date' | 'price' | 'name';
    date: 'date-desc' | 'date-asc';
    price: 'price-desc' | 'price-asc';
    nameAsc: boolean;
};

export default function CategoryDetailPage(): React.ReactElement {
    const { category } = useParams<{ category: string }>();
    const categoryName = category ? decodeURIComponent(category) : '';

    const { receipts: records, isInitialLoading: isLoading } = useReceiptCache();
    const [activeSorts, setActiveSorts] = useState<ActiveSorts>({
        sortBy: 'date',
        date: 'date-desc',
        price: 'price-desc',
        nameAsc: false,
    });
    const [searchQuery, setSearchQuery] = useState('');
    const [purchasePage, setPurchasePage] = useState(1);

    const { openReceiptEditorTab } = useTabContext();
    const hoveredIndexRef = useRef<number>(-1);
    const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);

    const [granularity, setGranularity] = useState<Granularity>(() => {
        const stored = localStorage.getItem(STORAGE_KEYS.STATISTICS_GRANULARITY);
        return (stored === 'year' || stored === 'month' || stored === 'week') ? stored : 'year';
    });
    const [periodOffset, setPeriodOffset] = useState(() => {
        const stored = localStorage.getItem(STORAGE_KEYS.STATISTICS_PERIOD_OFFSET);
        const parsed = Number(stored);
        return Number.isFinite(parsed) ? parsed : 0;
    });

    const [searchParams] = useSearchParams();
    const customRange = useMemo(() => {
        const fromParam = searchParams.get('from');
        const toParam = searchParams.get('to');
        if (!fromParam || !toParam) return null;
        const start = new Date(Number(fromParam));
        const end = new Date(Number(toParam));
        if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return null;
        const fmt = new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
        return { start, end, label: `${fmt.format(start)} – ${fmt.format(end)}` };
    }, [searchParams]);

    // ── period helpers (declared first so purchases can reference `period`) ───
    const handleGranularity = useCallback((g: Granularity) => {
        setGranularity(g);
        setPeriodOffset(0);
        localStorage.setItem(STORAGE_KEYS.STATISTICS_GRANULARITY, g);
        localStorage.setItem(STORAGE_KEYS.STATISTICS_PERIOD_OFFSET, '0');
    }, []);

    const period = useMemo(() => getPeriodRange(granularity, periodOffset), [granularity, periodOffset]);
    const prevPeriod = useMemo(() => getPeriodRange(granularity, periodOffset - 1), [granularity, periodOffset]);
    const nextPeriod = useMemo(() => getPeriodRange(granularity, periodOffset + 1), [granularity, periodOffset]);

    // ── collect all purchases in this category ─────────────────────────────
    const purchases = useMemo((): PurchaseEntry[] => {
        const result: PurchaseEntry[] = [];
        for (const r of records) {
            const d = effectiveDate(r);
            if (!d) continue;
            for (const row of r.data.rows) {
                const cat = row.category?.trim() || 'Uncategorized';
                if (cat !== categoryName) continue;
                if (row.price <= 0) continue;
                result.push({ row, receipt: r, date: d });
            }
        }
        return result.sort((a, b) => b.date.getTime() - a.date.getTime());
    }, [records, categoryName]);

    const sortedPurchases = useMemo(() => {
        const items = [...purchases];
        return items.sort((a, b) => {
            const compareDate = activeSorts.date === 'date-desc'
                ? b.date.getTime() - a.date.getTime()
                : a.date.getTime() - b.date.getTime();
            const comparePrice = activeSorts.price === 'price-desc'
                ? b.row.price - a.row.price
                : a.row.price - b.row.price;
            const compareName = activeSorts.nameAsc
                ? a.row.name.localeCompare(b.row.name)
                : b.row.name.localeCompare(a.row.name);

            if (activeSorts.sortBy === 'name') {
                return compareName || compareDate || comparePrice;
            }
            if (activeSorts.sortBy === 'price') {
                return comparePrice || compareDate || compareName;
            }
            return compareDate || comparePrice || compareName;
        });
    }, [purchases, activeSorts]);

    const rangeSortedPurchases = useMemo(() => {
        if (customRange) return sortedPurchases.filter((p) => p.date >= customRange.start && p.date <= customRange.end);
        return sortedPurchases.filter((p) => p.date >= period.start && p.date <= period.end);
    }, [sortedPurchases, customRange, period]);

    const filteredPurchases = useMemo(() => {
        if (!searchQuery.trim()) return rangeSortedPurchases;
        const q = searchQuery.toLowerCase();
        return rangeSortedPurchases.filter((p) => p.row.name.toLowerCase().includes(q));
    }, [rangeSortedPurchases, searchQuery]);

    const PURCHASES_PAGE_SIZE = 10;
    const totalPurchasePages = Math.max(1, Math.ceil(filteredPurchases.length / PURCHASES_PAGE_SIZE));
    const purchasePageClamped = Math.min(purchasePage, totalPurchasePages);
    const pagedPurchases = useMemo(() => {
        const start = (purchasePageClamped - 1) * PURCHASES_PAGE_SIZE;
        return filteredPurchases.slice(start, start + PURCHASES_PAGE_SIZE);
    }, [filteredPurchases, purchasePageClamped]);

    // Bar chart data — category-filtered records
    const categoryFilteredRecords = useMemo(() => records.map((r) => ({
        ...r,
        data: {
            ...r.data,
            rows: r.data.rows.filter(
                (row) => (row.category?.trim() || 'Uncategorized') === categoryName && row.price > 0,
            ),
        },
    })), [records, categoryName]);

    const barData = useMemo(
        () => buildBarData(categoryFilteredRecords, period, granularity),
        [categoryFilteredRecords, period, granularity],
    );

    const barAvg = useMemo(() => {
        const nonZero = barData.filter((b) => b.total > 0);
        return nonZero.length > 0 ? nonZero.reduce((s, b) => s + b.total, 0) / nonZero.length : 0;
    }, [barData]);

    const currentBarIndex = useMemo(() => {
        if (periodOffset !== 0) return -1;
        const now = new Date();
        if (granularity === 'year') return now.getMonth();
        if (granularity === 'month') {
            // Buckets are Sun–Sat aligned; find the one containing today.
            for (let i = 0; i < barData.length; i++) {
                const bucketStart = barData[i].periodStart;
                const bucketEnd = new Date(bucketStart);
                bucketEnd.setDate(bucketStart.getDate() + 6);
                bucketEnd.setHours(23, 59, 59, 999);
                if (now >= bucketStart && now <= bucketEnd) return i;
            }
            return -1;
        }
        const dow = now.getDay();
        return dow; // 0=Sun → bar[0], …, 6=Sat → bar[6]
    }, [granularity, periodOffset, barData]);

    // Purchases in current period (for KPIs and item list)
    const periodPurchases = useMemo(
        () => purchases.filter((p) => p.date >= period.start && p.date <= period.end),
        [purchases, period],
    );

    // When a custom date range was passed from the dashboard, use it for KPIs
    // and the purchases list so the displayed totals match the dashboard.
    const displayPurchases = useMemo(() => {
        if (customRange) {
            return purchases.filter((p) => p.date >= customRange.start && p.date <= customRange.end);
        }
        return periodPurchases;
    }, [purchases, customRange, periodPurchases]);

    const periodTotal = useMemo(
        () => displayPurchases.reduce((s, p) => s + p.row.price, 0),
        [displayPurchases],
    );

    const periodReceiptCount = useMemo(
        () => new Set(displayPurchases.map((p) => p.receipt.id)).size,
        [displayPurchases],
    );

    const prevPeriodTotal = useMemo(() => {
        if (customRange) return 0;
        return purchases
            .filter((p) => p.date >= prevPeriod.start && p.date <= prevPeriod.end)
            .reduce((s, p) => s + p.row.price, 0);
    }, [purchases, customRange, prevPeriod]);

    const delta = customRange ? null : (prevPeriodTotal > 0 ? ((periodTotal - prevPeriodTotal) / prevPeriodTotal) * 100 : null);
    const deltaSign = delta !== null && delta >= 0 ? '+' : '';
    const deltaColor = delta === null ? 'text-slate-400' : delta > 0 ? 'text-rose-500' : 'text-emerald-500';
    const deltaIcon = delta === null ? null : delta > 0 ? 'fas fa-arrow-up' : 'fas fa-arrow-down';

    const handleBarClick = useCallback(
        (data: BarData, _index: number) => {
            if (data.receipts === 0) return;

            if (granularity === 'year') {
                // Use periodStart directly — avoids any index/position mismatch
                const today = new Date();
                const newOffset =
                    (data.periodStart.getFullYear() * 12 + data.periodStart.getMonth()) -
                    (today.getFullYear() * 12 + today.getMonth());
                handleGranularity('month');
                setPeriodOffset(newOffset);
                window.scrollTo({ top: 0, behavior: 'smooth' });

            } else if (granularity === 'month') {
                // The bar's periodStart is already the Sunday of a Sun–Sat week.
                const targetSunday = new Date(data.periodStart);
                targetSunday.setHours(0, 0, 0, 0);
                const currentWeekStart = getPeriodRange('week', 0).start;
                const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
                const newOffset = Math.round(
                    (targetSunday.getTime() - currentWeekStart.getTime()) / MS_PER_WEEK,
                );
                handleGranularity('week');
                setPeriodOffset(newOffset);
                window.scrollTo({ top: 0, behavior: 'smooth' });

            } else if (granularity === 'week') {
                // Use the bar's own periodStart to be consistent with buildBarData
                const barDate = data.periodStart;
                const dayRecords = records.filter((r) => {
                    const d = effectiveDate(r);
                    if (!d) return false;
                    const matchesDay =
                        d.getFullYear() === barDate.getFullYear() &&
                        d.getMonth() === barDate.getMonth() &&
                        d.getDate() === barDate.getDate();
                    if (!matchesDay) return false;
                    return r.data.rows.some(
                        (row) => (row.category?.trim() || 'Uncategorized') === categoryName && row.price > 0,
                    );
                });
                if (dayRecords.length === 0) return;
                openReceiptEditorTab(dayRecords.map((r) => r.id));
            }
        },
        [granularity, records, categoryName, handleGranularity, setPeriodOffset, openReceiptEditorTab],
    );

    useEffect(() => {
        if (!ctxMenu) return;
        const dismiss = () => setCtxMenu(null);
        window.addEventListener('click', dismiss);
        return () => window.removeEventListener('click', dismiss);
    }, [ctxMenu]);

    useEffect(() => { setPurchasePage(1); }, [granularity, periodOffset]);
    useEffect(() => { setPurchasePage(1); }, [customRange]);

    useEffect(() => {
        localStorage.setItem(STORAGE_KEYS.STATISTICS_PERIOD_OFFSET, String(periodOffset));
    }, [periodOffset]);

    if (isLoading) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (!categoryName) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <p className="text-slate-400">Category not found.</p>
            </div>
        );
    }

    return (
        <>
            <FeatureGate feature="statisticsPage">
                <div className="min-h-screen bg-white">
                    <div className="mx-auto max-w-4xl px-5 pt-8 pb-14 sm:px-8">

                        {/* ── Breadcrumb / back ──────────────────────────────── */}
                        <div className="mb-6 flex items-center gap-2 text-sm text-slate-400">
                            <NavButton
                                to={ROUTES.STATISTICS}
                                className="flex items-center gap-1.5 hover:text-slate-700 transition-colors"
                            >
                                <i className="fas fa-chart-line text-xs" aria-hidden="true" />
                                Statistics
                            </NavButton>
                            <i className="fas fa-chevron-right text-[10px]" aria-hidden="true" />
                            <span className="font-medium text-slate-700">{categoryName}</span>
                        </div>

                        {/* ── Header ────────────────────────────────────────── */}
                        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Category</p>
                                <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">{categoryName}</h1>
                                <p className="mt-1 text-sm text-slate-500">
                                    {displayPurchases.length} purchase{displayPurchases.length !== 1 ? 's' : ''} in {customRange ? customRange.label : period.label}
                                </p>
                            </div>
                            <GranularityToggle value={granularity} onChange={handleGranularity} className="self-start" />
                        </div>

                        {customRange && (
                            <div className="mb-4 flex items-center gap-2">
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-700">
                                    <i className="fas fa-calendar-alt text-[10px]" aria-hidden="true" />
                                    {customRange.label}
                                </span>
                                <NavButton
                                    to={`/statistics/category/${encodeURIComponent(categoryName)}`}
                                    className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
                                >
                                    Clear filter
                                </NavButton>
                            </div>
                        )}

                        <div className="mb-6 flex items-center justify-between">
                            <button
                                type="button"
                                onClick={() => setPeriodOffset((o) => o - 1)}
                                className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 transition-colors text-xs font-medium"
                                aria-label={`Go to ${prevPeriod.label}`}
                            >
                                <i className="fas fa-chevron-left text-[10px]" aria-hidden="true" />
                                {prevPeriod.label}
                            </button>
                            <span className="text-sm font-semibold text-slate-700">{period.label}</span>
                            <button
                                type="button"
                                onClick={() => setPeriodOffset((o) => o + 1)}
                                disabled={periodOffset >= 0}
                                className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-xs font-medium"
                                aria-label={`Go to ${nextPeriod.label}`}
                            >
                                {nextPeriod.label}
                                <i className="fas fa-chevron-right text-[10px]" aria-hidden="true" />
                            </button>
                        </div>

                        <div className="mb-6 grid grid-cols-2 gap-3">
                            <div className="col-span-2 sm:col-span-1 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm flex items-start gap-4">
                                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-violet-50 text-violet-600">
                                    <i className="fas fa-wallet text-sm" aria-hidden="true" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Period Spend</p>
                                    <p className="mt-0.5 text-2xl font-bold tracking-tight text-slate-900 leading-none tabular-nums">
                                        {formatMoney(periodTotal)}
                                    </p>
                                    {delta !== null ? (
                                        <p className={`mt-1 text-xs font-medium flex items-center gap-1 ${deltaColor}`}>
                                            {deltaIcon && <i className={`${deltaIcon} text-[9px]`} aria-hidden="true" />}
                                            {granularity === 'week'
                                                ? (() => {
                                                    const abs = periodTotal - prevPeriodTotal;
                                                    return <>{abs >= 0 ? '+' : ''}{formatMoney(Math.abs(abs))} vs {prevPeriod.label}</>;
                                                })()
                                                : <>{deltaSign}{delta.toFixed(1)}% vs {prevPeriod.label}</>
                                            }
                                        </p>
                                    ) : (
                                        <p className="mt-1 text-xs text-slate-400">No spending in {prevPeriod.label}</p>
                                    )}
                                </div>
                            </div>
                            <div className="grid grid-cols-2 col-span-2 sm:col-span-1 gap-3">
                                <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm flex flex-col justify-center">
                                    <p className="text-xl font-bold tracking-tight text-slate-900 tabular-nums leading-none">{periodPurchases.length}</p>
                                    <p className="mt-1.5 text-xs font-medium text-slate-400">Items</p>
                                </div>
                                <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm flex flex-col justify-center">
                                    <p className="text-xl font-bold tracking-tight text-slate-900 tabular-nums leading-none">{periodReceiptCount}</p>
                                    <p className="mt-1.5 text-xs font-medium text-slate-400">Receipts</p>
                                </div>
                            </div>
                        </div>

                        {purchases.length === 0 ? (
                            <div className="rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center">
                                <i className="fas fa-tag mb-3 block text-3xl text-slate-200" aria-hidden="true" />
                                <p className="text-sm font-medium text-slate-600">No purchases in this category yet</p>
                            </div>
                        ) : (
                            <>
                                <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                                    <div className="mb-4 flex items-baseline justify-between">
                                        <div>
                                            <h2 className="text-sm font-semibold text-slate-800">Spending — {period.label}</h2>
                                            {barAvg > 0 && (
                                                <p className="mt-0.5 text-xs text-slate-400">avg {formatMoney(barAvg)}</p>
                                            )}
                                        </div>
                                    </div>
                                    <div
                                        style={{ cursor: 'pointer' }}
                                        onMouseDown={(e) => e.preventDefault()}
                                        onContextMenu={(e) => {
                                            e.preventDefault();
                                            const idx = hoveredIndexRef.current;
                                            if (idx === -1) return;
                                            const result = buildDrillDownPath(granularity, idx, barData, period, records, categoryName);
                                            if (!result) return;
                                            setCtxMenu({ x: e.clientX, y: e.clientY, ...result });
                                        }}
                                    >
                                        <ResponsiveContainer width="100%" height={220}>
                                            <BarChart data={barData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                                <XAxis
                                                    dataKey="label"
                                                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                                                    axisLine={false}
                                                    tickLine={false}
                                                />
                                                <YAxis
                                                    tickFormatter={(v: number) => `$${v}`}
                                                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                                                    axisLine={false}
                                                    tickLine={false}
                                                    width={48}
                                                />
                                                <Tooltip content={<BarTooltip />} cursor={{ fill: '#f8fafc' }} />
                                                <Bar
                                                    dataKey="total"
                                                    radius={[5, 5, 0, 0]}
                                                    maxBarSize={40}
                                                    onClick={(data, index) => handleBarClick(data as unknown as BarData, index)}
                                                    cursor="pointer"
                                                    onMouseEnter={(_, index) => { hoveredIndexRef.current = index; }}
                                                    onMouseLeave={() => { hoveredIndexRef.current = -1; }}
                                                >
                                                    {barData.map((entry, i) => (
                                                        <Cell
                                                            key={entry.label}
                                                            fill={
                                                                i === currentBarIndex
                                                                    ? '#7c3aed'
                                                                    : entry.total > 0
                                                                        ? '#a78bfa'
                                                                        : '#f1f5f9'
                                                            }
                                                        />
                                                    ))}
                                                </Bar>
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </section>

                                <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                                    <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
                                        <div>
                                            <h2 className="text-sm font-semibold text-slate-800">{customRange ? `Purchases — ${customRange.label}` : `Purchases in ${period.label}`}</h2>
                                            <p className="text-xs text-slate-400 mt-0.5">
                                                {filteredPurchases.length} item{filteredPurchases.length !== 1 ? 's' : ''}
                                                {searchQuery ? ` matching "${searchQuery}"` : ''}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <SearchInput
                                            value={searchQuery}
                                            onChange={(value) => { setSearchQuery(value); setPurchasePage(1); }}
                                            placeholder="Search items…"
                                            ariaLabel="Search items"
                                            className="w-36"
                                        />
                                            <button
                                                type="button"
                                                onClick={() => setActiveSorts((prev) => ({
                                                    ...prev,
                                                    sortBy: 'date',
                                                    date: prev.date === 'date-desc' ? 'date-asc' : 'date-desc',
                                                }))}
                                                className="px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors bg-violet-600 text-white"
                                            >
                                                {activeSorts.date === 'date-desc' ? 'Newest' : 'Oldest'}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setActiveSorts((prev) => ({
                                                    ...prev,
                                                    sortBy: 'price',
                                                    price: prev.price === 'price-desc' ? 'price-asc' : 'price-desc',
                                                }))}
                                                className="px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors bg-violet-600 text-white"
                                            >
                                                {activeSorts.price === 'price-desc' ? 'Price ↓' : 'Price ↑'}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setActiveSorts((prev) => ({
                                                    ...prev,
                                                    sortBy: 'name',
                                                    nameAsc: !prev.nameAsc,
                                                }))}
                                                className="px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors bg-violet-600 text-white"
                                            >
                                                {activeSorts.nameAsc ? 'Name A-Z' : 'Name Z-A'}
                                            </button>
                                        </div>
                                    </div>
                                    {filteredPurchases.length === 0 ? (
                                        <div className="px-6 py-10 text-center">
                                            <i className="fas fa-inbox mb-2 block text-2xl text-slate-200" aria-hidden="true" />
                                            <p className="text-sm text-slate-400">
                                                {searchQuery ? `No items match "${searchQuery}"` : `No purchases in ${customRange ? customRange.label : period.label}`}
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="divide-y divide-slate-50">
                                            {pagedPurchases.map((p, i) => {
                                                const name = getReceiptDisplayName(p.receipt.displayName, p.receipt.imagePath);
                                                const dateStr = p.date.toLocaleDateString('en-CA', {
                                                    month: 'short',
                                                    day: 'numeric',
                                                    year: 'numeric',
                                                });
                                                return (
                                                    <button
                                                        type="button"
                                                        key={`${p.receipt.id}-${p.row._id ?? i}`}
                                                        onClick={() => openReceiptEditorTab(p.receipt.id)}
                                                        className="w-full text-left flex items-center justify-between gap-4 px-6 py-3.5 hover:bg-slate-50 transition-colors group"
                                                    >
                                                        <div className="flex items-center gap-3 min-w-0">
                                                            <div className="w-8 h-8 rounded-xl bg-violet-50 flex items-center justify-center flex-shrink-0">
                                                                <i className="fas fa-tag text-[11px] text-violet-400" aria-hidden="true" />
                                                            </div>
                                                            <div className="min-w-0">
                                                                <p className="text-[13px] font-medium text-slate-800 truncate capitalize">{p.row.name}</p>
                                                                <p className="text-[11px] text-slate-400 truncate">{name} · {dateStr}</p>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-2 flex-shrink-0">
                                                            <span className="text-[13px] font-semibold text-slate-900 tabular-nums">{formatMoney(p.row.price)}</span>
                                                            <i className="fas fa-chevron-right text-[9px] text-slate-300 group-hover:text-slate-500 transition-colors" aria-hidden="true" />
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                    <div className="px-6 pb-4">
                                        <Pagination
                                            currentPage={purchasePageClamped}
                                            totalPages={totalPurchasePages}
                                            onPageChange={setPurchasePage}
                                            totalItems={filteredPurchases.length}
                                            pageSize={PURCHASES_PAGE_SIZE}
                                        />
                                    </div>
                                </section>
                            </>
                        )}
                    </div>
                </div>
            </FeatureGate>

            {/* ── Right-click context menu portal ───────────────────── */}
            {ctxMenu && createPortal(
                <div
                    style={{ position: 'fixed', top: ctxMenu.y, left: ctxMenu.x, zIndex: 9999 }}
                    className="rounded-xl border border-slate-200 bg-white shadow-lg py-1 min-w-[180px]"
                    onClick={(e) => e.stopPropagation()}
                >
                    <button
                        type="button"
                        className="w-full text-left px-4 py-2 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                        onClick={() => {
                            openReceiptEditorTab(ctxMenu.receiptIds);
                            setCtxMenu(null);
                        }}
                    >
                        <i className="fas fa-external-link-alt text-[10px] text-slate-400" aria-hidden="true" />
                        Open in new tab
                    </button>
                </div>,
                document.body,
            )}
        </>
    );
}
