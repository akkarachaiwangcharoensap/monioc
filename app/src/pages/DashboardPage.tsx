import { useState, useMemo, useCallback } from 'react';
import type React from 'react';
import { useNavigate } from 'react-router-dom';
import TabLink from '../components/ui/TabLink';
import PageHeader from '../components/ui/PageHeader';
import StatCard from '../components/ui/StatCard';
import EmptyState from '../components/ui/EmptyState';
import { useTabContext } from '../context/TabContext';
import { useReceiptCache } from '../context/ReceiptCacheContext';
import { formatMoney, effectiveDate } from '../utils';
import { getReceiptDisplayName } from '../utils/receipt-scanner/receiptSession';
import SpendingPieChart from '../components/SpendingPieChart';
import DateRangeFilter, { type DateRangeValue, type QuickRange, getQuickRangeDates } from '../components/receipts/DateRangeFilter';
import MinimalReceiptCard from '../components/receipts/MinimalReceiptCard';
import { useCategorySpending } from '../hooks/useCategorySpending';
import { ROUTES, STORAGE_KEYS } from '../constants';
import { useCategoriesContext as useCategories } from '../context/CategoriesContext';
const DASHBOARD_DATE_RANGES: { id: QuickRange; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'today', label: 'Today' },
    { id: 'lastWeek', label: 'Last Week' },
    { id: 'thisMonth', label: 'This Month' },
    { id: 'custom', label: 'Custom' },
];

const VALID_DASHBOARD_RANGES = new Set<QuickRange>(['all', 'today', 'lastWeek', 'thisMonth', 'custom']);

function loadSavedQuickRange(): QuickRange {
    const stored = localStorage.getItem(STORAGE_KEYS.DASHBOARD_CHART_RANGE) as QuickRange | null;
    return stored && VALID_DASHBOARD_RANGES.has(stored) ? stored : 'thisMonth';
}

function getGreeting(): string {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
}

export default function DashboardPage(): React.ReactElement {
    const navigate = useNavigate();
    const { replaceCurrentTab, openReceiptEditorTab } = useTabContext();
    const { receipts: records, isInitialLoading: isLoading } = useReceiptCache();
    const { getCategoryColor } = useCategories();
    const [chartQuickRange, setChartQuickRange] = useState<QuickRange>(loadSavedQuickRange);
    const [chartDateRange, setChartDateRange] = useState<DateRangeValue>(() =>
        getQuickRangeDates(loadSavedQuickRange()),
    );

    const handleQuickRangeChange = useCallback((range: QuickRange) => {
        setChartQuickRange(range);
        localStorage.setItem(STORAGE_KEYS.DASHBOARD_CHART_RANGE, range);
    }, []);

    const stats = useMemo(() => {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        let monthTotal = 0;
        for (const r of records) {
            const total = r.data.rows.reduce((s, row) => s + (row.price > 0 ? row.price : 0), 0);
            const d = effectiveDate(r);
            if (d && d >= monthStart) {
                monthTotal += total;
            }
        }
        return {
            monthTotal,
            totalReceipts: records.length,
        };
    }, [records]);

    const recentReceipts = useMemo(() =>
        [...records]
            .sort((a, b) => {
                const aMs = Date.parse(a.createdAt);
                const bMs = Date.parse(b.createdAt);
                return (Number.isFinite(bMs) ? bMs : 0) - (Number.isFinite(aMs) ? aMs : 0);
            })
            .slice(0, 5),
        [records],
    );

    const categoryEntries = useCategorySpending(records, chartDateRange[0], chartDateRange[1], effectiveDate);

    const categoryChartData = useMemo(() => {
        if (categoryEntries.length === 0) return null;

        // Show all categories. The native "Other" category is kept in its
        // sorted position so the total matches the stat card.
        const items = categoryEntries.filter(e => e.amount > 0);
        const total = items.reduce((s, e) => s + e.amount, 0);
        return { items, total };
    }, [categoryEntries]);

    const month = new Date().toLocaleString('en-CA', { month: 'long', year: 'numeric' });

    return (
        <div className="min-h-screen bg-white">
            <div className="mx-auto max-w-4xl px-5 pt-8 pb-12 sm:px-8">
                {/* ── Header ─────────────────────────────────── */}
                <PageHeader
                    tagline={month}
                    title={getGreeting()}
                    subtitle="Your grocery spending snapshot in one place."
                    actions={
                        <TabLink
                            to={ROUTES.RECEIPT_SCANNER}
                            className="inline-flex items-center gap-2 rounded-full bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-700"
                        >
                            <i className="fas fa-camera" aria-hidden="true" />
                            Scan Receipt
                        </TabLink>
                    }
                />

                {/* ── Stats grid ─────────────────────────────── */}
                {isLoading ? (
                    <div className="mb-8 grid grid-cols-2 gap-3">
                        {[0, 1].map((i) => (
                            <div key={i} className="h-24 rounded-2xl border border-slate-100 bg-slate-50 animate-pulse" />
                        ))}
                    </div>
                ) : records.length === 0 ? (
                    <div className="mb-8">
                        <EmptyState
                            icon="fa-receipt"
                            message="No receipts yet"
                            subMessage="Scan your first grocery receipt to unlock trends and insights."
                        />
                    </div>
                ) : (
                    <div className="mb-8 grid grid-cols-2 gap-3">
                        <StatCard value={formatMoney(stats.monthTotal)} label="Spent this month" />
                        <StatCard value={String(stats.totalReceipts)} label="Total receipts" />
                    </div>
                )}

                {/* ── Main content ───────────────────────────── */}
                <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                    <div className="space-y-6">
                        {!isLoading && records.length > 0 && (
                            <section>
                                <div className="mb-3 flex items-center justify-between">
                                    <h2 className="text-sm font-semibold text-slate-700">Spending by Category</h2>
                                </div>

                                <div className="mb-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                                    <DateRangeFilter
                                        onChange={setChartDateRange}
                                        quickRanges={DASHBOARD_DATE_RANGES}
                                        defaultQuickRange={chartQuickRange}
                                        onQuickRangeChange={handleQuickRangeChange}
                                    />
                                </div>

                                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                    <SpendingPieChart
                                        items={categoryChartData?.items ?? []}
                                        getCategoryColor={getCategoryColor}
                                        totalAmount={categoryChartData?.total ?? 0}
                                        onCategoryClick={(cat) => {
                                            // Always navigate to the category detail page. The quick range
                                            // maps to a granularity so the Statistics page opens at the
                                            // right zoom level.
                                            if (chartQuickRange === 'all') {
                                                localStorage.setItem(STORAGE_KEYS.STATISTICS_GRANULARITY, 'year');
                                                localStorage.setItem(STORAGE_KEYS.STATISTICS_PERIOD_OFFSET, '0');
                                                const path = `/statistics/category/${encodeURIComponent(cat)}`;
                                                const handled = replaceCurrentTab(path);
                                                if (!handled) void navigate(path);
                                            } else if (chartQuickRange === 'thisMonth') {
                                                localStorage.setItem(STORAGE_KEYS.STATISTICS_GRANULARITY, 'month');
                                                localStorage.setItem(STORAGE_KEYS.STATISTICS_PERIOD_OFFSET, '0');
                                                const path = `/statistics/category/${encodeURIComponent(cat)}`;
                                                const handled = replaceCurrentTab(path);
                                                if (!handled) void navigate(path);
                                            } else if (chartQuickRange === 'lastWeek') {
                                                localStorage.setItem(STORAGE_KEYS.STATISTICS_GRANULARITY, 'week');
                                                localStorage.setItem(STORAGE_KEYS.STATISTICS_PERIOD_OFFSET, '0');
                                                const path = `/statistics/category/${encodeURIComponent(cat)}`;
                                                const handled = replaceCurrentTab(path);
                                                if (!handled) void navigate(path);
                                            } else {
                                                // 'today' or 'custom' — navigate to custom detail page
                                                const from = chartDateRange[0]?.getTime();
                                                const to = chartDateRange[1]?.getTime();
                                                const params = from != null && to != null ? `?from=${from}&to=${to}` : '';
                                                const path = `/statistics/category/${encodeURIComponent(cat)}/custom${params}`;
                                                const handled = replaceCurrentTab(path);
                                                if (!handled) void navigate(path);
                                            }
                                        }}
                                    />
                                </div>
                            </section>
                        )}

                    </div>

                    <section>
                        <div className="mb-4 flex items-center justify-between">
                            <h2 className="text-sm font-semibold text-slate-700">Recent Receipts</h2>
                            <TabLink to={ROUTES.RECEIPTS} className="text-xs font-medium text-violet-600 transition-colors hover:text-violet-700">
                                View all <i className="fas fa-arrow-right text-[10px]" aria-hidden="true" />
                            </TabLink>
                        </div>
                        {recentReceipts.length > 0 ? (
                            <div className="space-y-2.5">
                                {recentReceipts.map((r) => {
                                    const name = getReceiptDisplayName(r.displayName, r.imagePath);
                                    return (
                                        <MinimalReceiptCard
                                            key={r.id}
                                            record={r}
                                            displayName={name}
                                            tabLabel={name}
                                            onClick={() => openReceiptEditorTab(r.id)}
                                        />
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-8 text-center">
                                <p className="text-sm text-slate-500">No recent receipts yet</p>
                            </div>
                        )}
                    </section>
                </div>
            </div>
        </div>
    );
}
