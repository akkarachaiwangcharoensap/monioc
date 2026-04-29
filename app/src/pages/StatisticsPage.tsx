/**
 * Statistics Dashboard
 *
 * Period-aware spending analytics: KPI strip, bar chart with average
 * reference line, and category breakdown — derived from scanned receipts.
 *
 * Gated: requires Paid tier or higher.
 */
import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import type React from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';
import { useReceiptCache } from '../context/ReceiptCacheContext';
import { formatMoney } from '../utils';
import { STORAGE_KEYS } from '../constants';
import PageLayout from '../components/ui/PageLayout';
import PageHeader from '../components/ui/PageHeader';
import StatCard from '../components/ui/StatCard';
import EmptyState from '../components/ui/EmptyState';
import Pagination from '../components/ui/Pagination';
import SearchInput from '../components/ui/SearchInput';
import GranularityToggle from '../components/ui/GranularityToggle';
import BarTooltip from '../components/charts/BarTooltip';
import type { BarTooltipProps } from '../components/charts/BarTooltip';
import {
    type Granularity, type BarData,
    effectiveDate, getPeriodRange, buildBarData, computeKPIs, buildDrillDownPath,
} from '../utils/statistics';
import { useCategorySpending } from '../hooks/useCategorySpending';
import { useTabContext } from '../context/TabContext';
import { FeatureGate } from '../components/FeatureGate';
import { useCategoriesContext as useCategories } from '../context/CategoriesContext';
import NavButton from '../components/ui/NavButton';

// ── sub-components ────────────────────────────────────────────────────────────

interface CtxMenu { x: number; y: number; receiptIds: number[]; label: string; }

// ── main page ─────────────────────────────────────────────────────────────────

const CATEGORY_PAGE_SIZE = 5;

export default function StatisticsPage(): React.ReactElement {
    const { receipts: records, isInitialLoading: isLoading } = useReceiptCache();
    const { getCategoryColor } = useCategories();
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
    const [categoryPage, setCategoryPage] = useState(1);
    const [sortField, setSortField] = useState<'amount' | 'items' | 'category'>('amount');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
    const [categorySearch, setCategorySearch] = useState('');

    const handleGranularity = useCallback((g: Granularity) => {
        setGranularity(g);
        setPeriodOffset(0);
        localStorage.setItem(STORAGE_KEYS.STATISTICS_GRANULARITY, g);
        localStorage.setItem(STORAGE_KEYS.STATISTICS_PERIOD_OFFSET, '0');
    }, []);

    const period = useMemo(() => getPeriodRange(granularity, periodOffset), [granularity, periodOffset]);
    const prevPeriod = useMemo(() => getPeriodRange(granularity, periodOffset - 1), [granularity, periodOffset]);
    const nextPeriod = useMemo(() => getPeriodRange(granularity, periodOffset + 1), [granularity, periodOffset]);

    const kpis = useMemo(() => computeKPIs(records, period), [records, period]);

    const barData = useMemo(
        () => buildBarData(records, period, granularity),
        [records, period, granularity],
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

    const rawCategorySpending = useCategorySpending(records, period.start, period.end, effectiveDate);

    const categoryData = useMemo(
        () => rawCategorySpending.map((c) => ({ ...c, color: getCategoryColor(c.category) })),
        [rawCategorySpending, getCategoryColor],
    );

    const sortedCategoryData = useMemo(() => {
        const items = [...categoryData];
        return items.sort((a, b) => {
            let cmp: number;
            if (sortField === 'amount') cmp = a.amount - b.amount;
            else if (sortField === 'items') cmp = a.items - b.items;
            else cmp = a.category.localeCompare(b.category);
            return sortDir === 'desc' ? -cmp : cmp;
        });
    }, [categoryData, sortField, sortDir]);

    const totalSpend = categoryData.reduce((s, c) => s + c.amount, 0);

    const filteredCategoryData = useMemo(() => {
        const q = categorySearch.trim().toLowerCase();
        return q ? sortedCategoryData.filter((c) => c.category.toLowerCase().includes(q)) : sortedCategoryData;
    }, [sortedCategoryData, categorySearch]);

    const totalCategoryPages = Math.max(1, Math.ceil(filteredCategoryData.length / CATEGORY_PAGE_SIZE));
    const categoryPageClamped = Math.min(categoryPage, totalCategoryPages);
    const pagedCategoryData = useMemo(() => {
        const start = (categoryPageClamped - 1) * CATEGORY_PAGE_SIZE;
        return filteredCategoryData.slice(start, start + CATEGORY_PAGE_SIZE);
    }, [filteredCategoryData, categoryPageClamped]);

    useEffect(() => {
        setCategoryPage(1);
    }, [granularity, periodOffset, categorySearch]);

    useEffect(() => {
        localStorage.setItem(STORAGE_KEYS.STATISTICS_PERIOD_OFFSET, String(periodOffset));
    }, [periodOffset]);

    useEffect(() => {
        if (categoryPage > totalCategoryPages) {
            setCategoryPage(totalCategoryPages);
        }
    }, [categoryPage, totalCategoryPages]);

    const renderTooltip = useCallback(
        (props: BarTooltipProps) => <BarTooltip {...props} getCategoryColor={getCategoryColor} />,
        [getCategoryColor],
    );

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
                // The bar's periodStart is already the Sunday of a Sun–Sat week
                // (buildBarData now produces Sun-aligned buckets for the month
                // granularity).  Compute the offset from the current week.
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
                    return (
                        d != null &&
                        d.getFullYear() === barDate.getFullYear() &&
                        d.getMonth() === barDate.getMonth() &&
                        d.getDate() === barDate.getDate()
                    );
                });
                if (dayRecords.length === 0) return;
                openReceiptEditorTab(dayRecords.map((r) => r.id));
            }
        },
        [granularity, records, handleGranularity, setPeriodOffset, openReceiptEditorTab],
    );

    useEffect(() => {
        if (!ctxMenu) return;
        const dismiss = () => setCtxMenu(null);
        window.addEventListener('click', dismiss);
        return () => window.removeEventListener('click', dismiss);
    }, [ctxMenu]);

    if (isLoading) {
        return (
            <PageLayout>
                <div className="flex items-center justify-center min-h-[60vh]">
                    <div className="w-6 h-6 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
                </div>
            </PageLayout>
        );
    }

    if (records.length === 0) {
        return (
            <PageLayout>
                <EmptyState
                    icon="fa-chart-line"
                    message="No data yet"
                    subMessage="Scan your first grocery receipt to unlock spending statistics and trends."
                />
            </PageLayout>
        );
    }

    const deltaSign = kpis.delta !== null && kpis.delta >= 0 ? '+' : '';
    const deltaColor =
        kpis.delta === null
            ? 'text-slate-400'
            : kpis.delta > 0
                ? 'text-rose-500'
                : 'text-emerald-500';
    const deltaIcon = kpis.delta === null ? null : kpis.delta > 0 ? 'fas fa-arrow-up' : 'fas fa-arrow-down';

    return (
        <>
            <FeatureGate feature="statisticsPage">
                <PageLayout>

                        {/* ── Header ─────────────────────────────────────────── */}
                        <PageHeader
                            tagline="Analytics"
                            title="Statistics"
                            actions={
                                <GranularityToggle
                                    value={granularity}
                                    onChange={(v) => handleGranularity(v as Granularity)}
                                />
                            }
                        />

                        {/* ── Period navigation ──────────────────────────────── */}
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

                        {/* ── KPI cards ─────────────────────────────────────── */}
                        <div className="mb-6 grid grid-cols-2 gap-3">
                            <StatCard
                                value={formatMoney(kpis.periodTotal)}
                                label="Period Spend"
                                icon="fas fa-wallet"
                                iconBg="bg-violet-50"
                                iconColor="text-violet-600"
                                wide
                                delta={
                                    kpis.delta !== null ? (
                                        <p className={`text-xs font-medium flex items-center gap-1 ${deltaColor}`}>
                                            {deltaIcon && <i className={`${deltaIcon} text-[9px]`} aria-hidden="true" />}
                                            {granularity === 'week'
                                                ? (() => {
                                                    const abs = kpis.periodTotal - kpis.prevTotal;
                                                    return <>{abs >= 0 ? '+' : ''}{formatMoney(Math.abs(abs))} vs {prevPeriod.label}</>;
                                                })()
                                                : <>{deltaSign}{kpis.delta.toFixed(1)}% vs {prevPeriod.label}</>
                                            }
                                        </p>
                                    ) : (
                                        <p className="text-xs text-slate-400">No prior period data</p>
                                    )
                                }
                            />
                            <StatCard
                                value={String(kpis.periodReceipts)}
                                label="Receipts"
                                delta={<p className="text-[11px] text-slate-400">this period</p>}
                            />
                        </div>

                        {/* ── Period bar chart ───────────────────────────────── */}
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
                                    const result = buildDrillDownPath(granularity, idx, barData, period, records);
                                    if (!result) return;
                                    setCtxMenu({ x: e.clientX, y: e.clientY, ...result });
                                }}
                            >
                                <ResponsiveContainer width="100%" height={320}>
                                    <BarChart data={barData} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                        <XAxis
                                            dataKey="label"
                                            tick={{ fontSize: 11, fill: '#94a3b8' }}
                                            axisLine={false}
                                            tickLine={false}
                                        />
                                        <YAxis
                                            tickFormatter={(v: number) => `$${v}`}
                                            tick={{ fontSize: 11, fill: '#94a3b8' }}
                                            axisLine={false}
                                            tickLine={false}
                                            width={52}
                                        />
                                        <Tooltip content={renderTooltip} cursor={{ fill: '#f8fafc' }} />
                                        {barAvg > 0 && (
                                            <ReferenceLine
                                                y={barAvg}
                                                stroke="#a78bfa"
                                                strokeDasharray="4 3"
                                                strokeWidth={1.5}
                                                label={{
                                                    value: `avg ${formatMoney(barAvg)}`,
                                                    fill: '#a78bfa',
                                                    fontSize: 10,
                                                    position: 'insideTopRight',
                                                }}
                                            />
                                        )}
                                        <Bar
                                            dataKey="total"
                                            radius={[6, 6, 0, 0]}
                                            maxBarSize={48}
                                            minPointSize={8}
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

                        {/* ── Spending by category ──────────────────────────── */}
                        {categoryData.length > 0 && (
                            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                                <div className="mb-3 flex items-center justify-between gap-3">
                                    <h2 className="text-sm font-semibold text-slate-800">Spending by Category</h2>
                                    <SearchInput
                                        value={categorySearch}
                                        onChange={setCategorySearch}
                                        placeholder="Search"
                                        ariaLabel="Search categories"
                                        className="max-w-[180px]"
                                    />
                                </div>
                                <div className="mb-3 flex items-center gap-1 flex-wrap">
                                    {(['amount', 'items', 'category'] as const).map((field) => (
                                        <button
                                            key={field}
                                            type="button"
                                            onClick={() => {
                                                if (sortField === field) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
                                                else { setSortField(field); setSortDir('desc'); }
                                            }}
                                            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${sortField === field
                                                ? 'bg-violet-600 text-white'
                                                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                                }`}
                                        >
                                            {field === 'amount' ? 'Amount' : field === 'items' ? 'Items' : 'Name'}
                                            {sortField === field && (
                                                <i className={`fas fa-arrow-${sortDir === 'desc' ? 'down' : 'up'} text-[9px]`} aria-hidden="true" />
                                            )}
                                        </button>
                                    ))}
                                </div>
                                <div className="space-y-2.5">
                                    {pagedCategoryData.map((cat) => {
                                        const pct = totalSpend > 0 ? (cat.amount / totalSpend) * 100 : 0;
                                        return (
                                            <NavButton
                                                key={cat.category}
                                                to={`/statistics/category/${encodeURIComponent(cat.category)}`}
                                                className="w-full text-left group"
                                                aria-label={`View details for ${cat.category}`}
                                            >
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="flex items-center gap-1.5 text-[12px] font-medium text-slate-700 group-hover:text-violet-700 transition-colors">
                                                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                                                        {cat.category}
                                                        <i className="fas fa-chevron-right text-[8px] opacity-0 group-hover:opacity-60 transition-opacity ml-0.5" aria-hidden="true" />
                                                    </span>
                                                    <span className="text-[12px] font-semibold text-slate-800">{formatMoney(cat.amount)}</span>
                                                </div>
                                                <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                                                    <div
                                                        className="h-full rounded-full transition-all duration-500"
                                                        style={{ width: `${pct}%`, backgroundColor: cat.color }}
                                                    />
                                                </div>
                                                <p className="mt-0.5 text-[10px] text-slate-400">
                                                    {pct.toFixed(1)}% · {cat.items} item{cat.items !== 1 ? 's' : ''}
                                                </p>
                                            </NavButton>
                                        );
                                    })}
                                    {filteredCategoryData.length === 0 && categorySearch.trim() && (
                                        <p className="py-4 text-center text-xs text-slate-400">No categories match "{categorySearch}"</p>
                                    )}
                                </div>
                                <Pagination
                                    currentPage={categoryPageClamped}
                                    totalPages={totalCategoryPages}
                                    onPageChange={setCategoryPage}
                                    totalItems={filteredCategoryData.length}
                                    pageSize={CATEGORY_PAGE_SIZE}
                                />
                            </section>
                        )}

                </PageLayout>
            </FeatureGate>

            {/* ── Right-click context menu portal ───────────────────────── */}
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


