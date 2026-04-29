/**
 * Category Custom Detail Page
 *
 * Shows purchases in a specific category for an arbitrary date range
 * (passed via `from` / `to` query params). No bar chart, no granularity
 * toggle, and no period navigation — just KPIs, a date badge, and a
 * sortable/searchable purchase list.
 */
import { useState, useMemo } from 'react';
import type React from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import type { ReceiptScanRecord, ReceiptRow } from '../types';
import { useReceiptCache } from '../context/ReceiptCacheContext';
import { formatMoney, effectiveDate } from '../utils';
import { getReceiptDisplayName } from '../utils/receipt-scanner/receiptSession';
import { ROUTES } from '../constants';
import { useTabContext } from '../context/TabContext';
import { FeatureGate } from '../components/FeatureGate';
import Pagination from '../components/ui/Pagination';
import NavButton from '../components/ui/NavButton';
import SearchInput from '../components/ui/SearchInput';

// ── helpers ───────────────────────────────────────────────────────────────────

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

const PURCHASES_PAGE_SIZE = 10;

const dateFmt = new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });

export default function CategoryCustomDetailPage(): React.ReactElement {
    const { category } = useParams<{ category: string }>();
    const categoryName = category ? decodeURIComponent(category) : '';

    const { receipts: records, isInitialLoading: isLoading } = useReceiptCache();
    const { openReceiptEditorTab } = useTabContext();

    const [searchParams] = useSearchParams();

    const dateRange = useMemo(() => {
        const fromParam = searchParams.get('from');
        const toParam = searchParams.get('to');
        if (!fromParam || !toParam) return null;
        const start = new Date(Number(fromParam));
        const end = new Date(Number(toParam));
        if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return null;
        return { start, end };
    }, [searchParams]);

    const dateLabel = useMemo(() => {
        if (!dateRange) return '';
        const startStr = dateFmt.format(dateRange.start);
        const endStr = dateFmt.format(dateRange.end);
        // Same calendar day check
        if (
            dateRange.start.getFullYear() === dateRange.end.getFullYear() &&
            dateRange.start.getMonth() === dateRange.end.getMonth() &&
            dateRange.start.getDate() === dateRange.end.getDate()
        ) {
            return startStr;
        }
        return `${startStr} – ${endStr}`;
    }, [dateRange]);

    const isSameDay = useMemo(() => {
        if (!dateRange) return false;
        return (
            dateRange.start.getFullYear() === dateRange.end.getFullYear() &&
            dateRange.start.getMonth() === dateRange.end.getMonth() &&
            dateRange.start.getDate() === dateRange.end.getDate()
        );
    }, [dateRange]);

    const [activeSorts, setActiveSorts] = useState<ActiveSorts>({
        sortBy: 'date',
        date: 'date-desc',
        price: 'price-desc',
        nameAsc: false,
    });
    const [searchQuery, setSearchQuery] = useState('');
    const [purchasePage, setPurchasePage] = useState(1);

    // ── collect all purchases in this category within the date range ────
    const purchases = useMemo((): PurchaseEntry[] => {
        if (!dateRange) return [];
        const result: PurchaseEntry[] = [];
        const endOfDay = new Date(dateRange.end);
        endOfDay.setHours(23, 59, 59, 999);

        for (const r of records) {
            const d = effectiveDate(r);
            if (!d) continue;
            if (d < dateRange.start || d > endOfDay) continue;
            for (const row of r.data.rows) {
                const cat = (row.category?.trim() || 'Uncategorized');
                if (cat !== categoryName || row.price <= 0) continue;
                result.push({ row, receipt: r, date: d });
            }
        }
        return result.sort((a, b) => b.date.getTime() - a.date.getTime());
    }, [records, categoryName, dateRange]);

    const sortedPurchases = useMemo(() => {
        const items = [...purchases];
        return items.sort((a, b) => {
            if (activeSorts.sortBy === 'date') {
                return activeSorts.date === 'date-desc'
                    ? b.date.getTime() - a.date.getTime()
                    : a.date.getTime() - b.date.getTime();
            }
            if (activeSorts.sortBy === 'price') {
                return activeSorts.price === 'price-desc'
                    ? b.row.price - a.row.price
                    : a.row.price - b.row.price;
            }
            const cmp = a.row.name.localeCompare(b.row.name);
            return activeSorts.nameAsc ? cmp : -cmp;
        });
    }, [purchases, activeSorts]);

    const filteredPurchases = useMemo(() => {
        if (!searchQuery.trim()) return sortedPurchases;
        const q = searchQuery.toLowerCase();
        return sortedPurchases.filter((p) => p.row.name.toLowerCase().includes(q));
    }, [sortedPurchases, searchQuery]);

    const totalPurchasePages = Math.max(1, Math.ceil(filteredPurchases.length / PURCHASES_PAGE_SIZE));
    const purchasePageClamped = Math.min(purchasePage, totalPurchasePages);
    const pagedPurchases = useMemo(() => {
        const start = (purchasePageClamped - 1) * PURCHASES_PAGE_SIZE;
        return filteredPurchases.slice(start, start + PURCHASES_PAGE_SIZE);
    }, [filteredPurchases, purchasePageClamped]);

    // ── KPIs ──────────────────────────────────────────────────────────
    const totalSpend = useMemo(
        () => purchases.reduce((s, p) => s + p.row.price, 0),
        [purchases],
    );
    const itemCount = purchases.length;
    const receiptCount = useMemo(
        () => new Set(purchases.map((p) => p.receipt.id)).size,
        [purchases],
    );

    if (isLoading) {
        return (
            <div className="min-h-screen bg-white">
                <div className="mx-auto max-w-4xl px-5 pt-8 pb-14 sm:px-8">
                    <div className="animate-pulse space-y-4">
                        <div className="h-4 w-32 rounded bg-slate-200" />
                        <div className="h-8 w-64 rounded bg-slate-200" />
                        <div className="grid grid-cols-3 gap-3">
                            {[0, 1, 2].map((i) => (
                                <div key={i} className="h-24 rounded-2xl bg-slate-100" />
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (!categoryName || !dateRange) {
        return (
            <div className="min-h-screen bg-white">
                <div className="mx-auto max-w-4xl px-5 pt-8 pb-14 sm:px-8 text-center">
                    <i className="fas fa-exclamation-triangle text-3xl text-slate-200 mb-3 block" aria-hidden="true" />
                    <p className="text-sm text-slate-500">Invalid category or date range.</p>
                </div>
            </div>
        );
    }

    return (
        <>
            <FeatureGate feature="statisticsPage">
                <div className="min-h-screen bg-white">
                    <div className="mx-auto max-w-4xl px-5 pt-8 pb-14 sm:px-8">

                        {/* ── Breadcrumb ────────────────────────────────────── */}
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
                        <div className="mb-8">
                            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Category</p>
                            <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">{categoryName}</h1>
                            <p className="mt-1 text-sm text-slate-500">
                                {purchases.length} purchase{purchases.length !== 1 ? 's' : ''}{' '}
                                {isSameDay ? `on ${dateLabel}` : `from ${dateLabel}`}
                            </p>
                        </div>

                        {/* ── Date range badge ──────────────────────────────── */}
                        <div className="mb-6">
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-700">
                                <i className="fas fa-calendar-alt text-[10px]" aria-hidden="true" />
                                {dateLabel}
                            </span>
                        </div>

                        {/* ── KPI strip ─────────────────────────────────────── */}
                        <div className="mb-6 grid grid-cols-3 gap-3">
                            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                                <div className="flex items-start gap-3">
                                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-violet-50 text-violet-600">
                                        <i className="fas fa-wallet text-sm" aria-hidden="true" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Period Spend</p>
                                        <p className="mt-0.5 text-2xl font-bold tracking-tight text-slate-900 leading-none tabular-nums">
                                            {formatMoney(totalSpend)}
                                        </p>
                                    </div>
                                </div>
                            </div>
                            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm flex flex-col justify-center">
                                <p className="text-xl font-bold tracking-tight text-slate-900 tabular-nums leading-none">{itemCount}</p>
                                <p className="mt-1.5 text-xs font-medium text-slate-400">
                                    item{itemCount !== 1 ? 's' : ''}
                                </p>
                            </div>
                            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm flex flex-col justify-center">
                                <p className="text-xl font-bold tracking-tight text-slate-900 tabular-nums leading-none">{receiptCount}</p>
                                <p className="mt-1.5 text-xs font-medium text-slate-400">
                                    receipt{receiptCount !== 1 ? 's' : ''}
                                </p>
                            </div>
                        </div>

                        {/* ── Purchases list ────────────────────────────────── */}
                        {purchases.length === 0 ? (
                            <div className="rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center">
                                <i className="fas fa-inbox mb-3 block text-3xl text-slate-200" aria-hidden="true" />
                                <p className="text-sm font-medium text-slate-600">No purchases found in this date range</p>
                            </div>
                        ) : (
                            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
                                    <div>
                                        <h2 className="text-sm font-semibold text-slate-800">Purchases — {dateLabel}</h2>
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
                                            {searchQuery ? `No items match "${searchQuery}"` : 'No purchases in this date range'}
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
                        )}
                    </div>
                </div>
            </FeatureGate>
        </>
    );
}
