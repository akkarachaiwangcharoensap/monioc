/**
 * Mock Receipts page for the landing demo.
 * Matches ReceiptsDashboardPage design; receipts are read-only (not clickable).
 */
import { useMemo, useState } from 'react';
import type React from 'react';
import { MOCK_RECEIPTS, getMockCategoryColor } from '../mock-data';
import { formatMoney } from '../../utils/priceFormatting';
import type { ReceiptScanRecord } from '../../types/receipt';

const PAGE_SIZE = 3;

type QuickRange = 'all' | 'lastWeek' | 'last2Weeks' | '1month' | '3months';

function getQuickRange(id: QuickRange): [Date | null, Date | null] {
	if (id === 'all') return [null, null];
	const now = new Date();
	const start = new Date(now);
	if (id === 'lastWeek') start.setDate(now.getDate() - 7);
	else if (id === 'last2Weeks') start.setDate(now.getDate() - 14);
	else if (id === '1month') start.setMonth(now.getMonth() - 1);
	else if (id === '3months') start.setMonth(now.getMonth() - 3);
	start.setHours(0, 0, 0, 0);
	return [start, now];
}

function formatDate(dateStr: string | null | undefined): string {
	if (!dateStr) return '—';
	try {
		const normalized = dateStr.replace(' ', 'T');
		const d = new Date(normalized.includes('T') ? normalized : `${normalized}T12:00:00`);
		if (!Number.isFinite(d.getTime())) return dateStr;
		return d.toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
	} catch {
		return dateStr;
	}
}

function receiptTotal(r: ReceiptScanRecord): number {
	return r.data.rows.reduce((s, row) => s + row.price, 0);
}

interface MockReceiptCardProps {
	record: ReceiptScanRecord;
}

function MockReceiptCard({ record }: MockReceiptCardProps): React.ReactElement {
	const total = receiptTotal(record);
	const rowCount = record.data.rows.length;
	const topCategories = Object.entries(
		record.data.rows.reduce<Record<string, number>>((acc, row) => {
			const cat = row.category?.trim() || 'Uncategorized';
			acc[cat] = (acc[cat] ?? 0) + row.price;
			return acc;
		}, {}),
	)
		.sort((a, b) => b[1] - a[1])
		.slice(0, 3);

	return (
		<div className="group relative rounded-3xl border border-slate-200 p-4 bg-white select-none">
			<div className="flex items-start gap-4">
				{/* Thumbnail placeholder */}
				<div className="w-16 h-20 sm:w-20 sm:h-24 rounded-2xl border border-slate-200 bg-slate-100 flex items-center justify-center text-slate-300 flex-shrink-0">
					<i className="fas fa-image" aria-hidden="true" />
				</div>

				{/* Content */}
				<div className="flex-1 min-w-0">
					<div className="flex items-start justify-between gap-2">
						<div className="min-w-0">
							<p className="text-[15px] font-semibold tracking-[-0.01em] text-slate-900 truncate">
								{record.displayName ?? 'Receipt'}
							</p>
							<p className="mt-1 text-[12px] text-slate-500 text-left">
								{record.purchaseDate ? (
									<>
										<i className="fas fa-calendar-alt text-[10px] mr-1 text-slate-400" aria-hidden="true" />
										{formatDate(record.purchaseDate)}
									</>
								) : (
									<span className="text-slate-400 italic text-[11px]">No purchase date</span>
								)}
							</p>
							<p className="mt-0.5 text-[11px] text-slate-400 text-left">
								<i className="fas fa-clock text-[10px] mr-1" aria-hidden="true" />
								Scanned {formatDate(record.createdAt)}
							</p>
						</div>
						<p className="text-[15px] font-semibold tabular-nums text-slate-900 shrink-0">
							{formatMoney(total)}
						</p>
					</div>

					{/* Badges */}
					<div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
						<span className="inline-flex items-center gap-1 rounded-full bg-white border border-slate-200 px-2 py-1 text-slate-600">
							<i className="fas fa-list-ul text-[10px] text-slate-400" aria-hidden="true" />
							{rowCount} item{rowCount === 1 ? '' : 's'}
						</span>
					</div>

					{/* Top categories */}
					<div className="mt-2 flex flex-wrap gap-1.5">
						{topCategories.map(([category]) => (
							<span
								key={category}
								className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600"
							>
								<span
									className="h-2 w-2 rounded-full flex-shrink-0"
									style={{ backgroundColor: getMockCategoryColor(category) }}
									aria-hidden="true"
								/>
								<span className="truncate max-w-[8rem]">{category}</span>
							</span>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}

interface Props {
	onOpenReceipt?: (r: ReceiptScanRecord) => void;
	onNavigate: (page: string) => void;
}

export default function MockReceiptsListPage({ onNavigate }: Props): React.ReactElement {
	const [query, setQuery] = useState('');
	const [quickRange, setQuickRange] = useState<QuickRange>('all');
	const [sortField, setSortField] = useState<'purchased' | 'scanned'>('scanned');
	const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
	const [page, setPage] = useState(1);

	const filteredAndSorted = useMemo(() => {
		const q = query.trim().toLowerCase();
		const [rangeStart, rangeEnd] = getQuickRange(quickRange);
		const filtered = MOCK_RECEIPTS.filter((r) => {
			if (q) {
				const name = (r.displayName ?? '').toLowerCase();
				if (!name.includes(q) && !r.data.rows.some((row) => row.name.toLowerCase().includes(q))) return false;
			}
			if (rangeStart !== null && r.purchaseDate) {
				const d = new Date(r.purchaseDate + 'T12:00:00');
				if (d < rangeStart || (rangeEnd !== null && d > rangeEnd)) return false;
			}
			return true;
		});
		filtered.sort((a, b) => {
			const ms = (r: ReceiptScanRecord) => {
				const raw = sortField === 'scanned' ? r.createdAt : (r.purchaseDate ?? r.createdAt);
				const d = new Date(raw.replace(' ', 'T'));
				return Number.isFinite(d.getTime()) ? d.getTime() : 0;
			};
			return sortDir === 'asc' ? ms(a) - ms(b) : ms(b) - ms(a);
		});
		return filtered;
	}, [query, quickRange, sortField, sortDir]);

	const totalPages = Math.max(1, Math.ceil(filteredAndSorted.length / PAGE_SIZE));
	const clampedPage = Math.min(page, totalPages);

	const pageItems = useMemo(
		() => filteredAndSorted.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE),
		[clampedPage, filteredAndSorted],
	);

	return (
		<div className="min-h-screen bg-white">
			<main className="mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-8 max-w-4xl">

				{/* ── Page header ────────────────────────────────────── */}
				<div className="flex flex-wrap items-start justify-between gap-4 mb-8">
					<div>
						<div className="flex items-center gap-3 mb-1">
							<div className="inline-flex items-center justify-center w-10 h-10 bg-violet-100 rounded-xl flex-shrink-0">
								<i className="fas fa-receipt text-lg text-violet-600" aria-hidden="true" />
							</div>
							<h1 className="text-2xl font-semibold text-slate-900 tracking-tight">
								Receipts
							</h1>
						</div>
						<p className="text-slate-500 text-sm mt-1">
							Browse and manage your scanned receipts.
						</p>
					</div>
					<div className="flex items-center gap-2 flex-shrink-0">
						<button
							type="button"
							className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border border-slate-300 text-slate-700"
						>
							<i className="fas fa-list-check text-[11px]" aria-hidden="true" />
							Select
						</button>
						<button
							type="button"
							className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border border-slate-300 text-slate-700"
						>
							<i className="fas fa-file-lines text-[11px]" aria-hidden="true" />
							Editor
						</button>
						<button
							type="button"
							onClick={() => onNavigate('scanner')}
							className="inline-flex items-center gap-1 px-4 py-2 rounded-full bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 transition-colors cursor-pointer"
						>
							<i className="fas fa-plus" aria-hidden="true" />
							Add New
						</button>
					</div>
				</div>

				{/* ── Filters panel ────────────────────────────────────── */}
				<div className="rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-4 mb-5 space-y-3">
					{/* Search */}
					<div className="relative">
						<i className="fas fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[12px] pointer-events-none" aria-hidden="true" />
						<input
							type="text"
							value={query}
							onChange={(e) => { setQuery(e.target.value); setPage(1); }}
							placeholder="Search by name or item…"
							className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent transition"
							aria-label="Search receipts"
						/>
					</div>

					{/* Purchase date filter */}
					<div className="flex flex-wrap items-start gap-x-2 gap-y-1">
						<div className="flex items-center gap-1.5 flex-shrink-0 mt-2">
							<i className="fas fa-calendar-alt text-slate-400 text-xs" aria-hidden="true" />
							<span className="text-xs text-slate-400 font-medium">Purchase date</span>
						</div>
						<div className="flex flex-wrap gap-1.5 mt-1">
							{([
								['all', 'All'],
								['lastWeek', 'Last Week'],
								['last2Weeks', 'Last 2 Weeks'],
								['1month', '1 Month'],
								['3months', '3 Months'],
							] as const).map(([id, label]) => (
								<button
									key={id}
									type="button"
									onClick={() => { setQuickRange(id); setPage(1); }}
									className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${quickRange === id
										? 'bg-violet-600 text-white'
										: 'bg-slate-100 text-slate-500 hover:bg-slate-200'
									}`}
								>
									{label}
								</button>
							))}
						</div>
					</div>

					{/* Sort controls */}
					<div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
						<div className="flex items-center gap-1.5 flex-shrink-0">
							<i className="fas fa-arrow-up-wide-short text-slate-400 text-xs" aria-hidden="true" />
							<span className="text-xs text-slate-400 font-medium">Sort by</span>
						</div>
						<div className="flex gap-1.5" role="radiogroup" aria-label="Sort order">
							{(['purchased', 'scanned'] as const).map((field) => (
								<button
									key={field}
									type="button"
									role="radio"
									aria-checked={sortField === field}
									onClick={() => {
										if (sortField === field) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
										else { setSortField(field); setSortDir('desc'); }
									}}
									className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${sortField === field
										? 'bg-violet-600 text-white'
										: 'bg-slate-100 text-slate-500 hover:bg-slate-200'
									}`}
								>
									{field === 'purchased' ? 'Purchased' : 'Scanned'}
									{sortField === field && (
										<i className={`fas fa-arrow-${sortDir === 'desc' ? 'down' : 'up'} text-[9px]`} aria-hidden="true" />
									)}
								</button>
							))}
						</div>
					</div>

					<div className="flex items-center justify-between pt-1 border-t border-slate-200">
						<span className="text-xs text-slate-500">
							{filteredAndSorted.length}{' '}
							{filteredAndSorted.length === 1 ? 'result' : 'results'}
							{query && <span className="ml-1 text-slate-400">(filtered)</span>}
						</span>
						{totalPages > 1 && (
							<span className="text-xs text-slate-400 tabular-nums">
								Page {clampedPage} of {totalPages}
							</span>
						)}
					</div>
				</div>

				{/* ── Receipt list ─────────────────────────────────────── */}
				{filteredAndSorted.length === 0 ? (
					<div className="flex flex-col items-center justify-center py-20 text-center">
						<div className="w-16 h-16 mb-4 rounded-full bg-slate-100 flex items-center justify-center">
							<i className="fas fa-receipt text-2xl text-slate-300" aria-hidden="true" />
						</div>
						<p className="text-slate-500 font-medium">No matching receipts found.</p>
						{query && <p className="text-slate-400 text-sm mt-1">Try adjusting or clearing the search.</p>}
					</div>
				) : (
					<>
						<div className="space-y-3">
							{pageItems.map((record) => (
								<MockReceiptCard key={record.id} record={record} />
							))}
						</div>

						{/* Pagination */}
						{totalPages > 1 && (
							<div className="mt-6 flex items-center justify-between text-sm text-slate-600">
								<span className="text-xs text-slate-500">
									{(clampedPage - 1) * PAGE_SIZE + 1}–{Math.min(clampedPage * PAGE_SIZE, filteredAndSorted.length)} of {filteredAndSorted.length}
								</span>
								<div className="flex items-center gap-1">
									<button
										type="button"
										disabled={clampedPage <= 1}
										onClick={() => setPage((p) => Math.max(1, p - 1))}
										className="h-8 w-8 rounded-lg border border-slate-200 flex items-center justify-center disabled:opacity-30 hover:bg-slate-50 transition-colors cursor-pointer disabled:cursor-default"
									>
										<i className="fas fa-chevron-left text-[10px]" aria-hidden="true" />
									</button>
									{Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
										const pg = i + 1;
										return (
											<button
												key={pg}
												type="button"
												onClick={() => setPage(pg)}
												className={`h-8 w-8 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${clampedPage === pg
													? 'bg-violet-600 text-white border-violet-600'
													: 'border-slate-200 text-slate-600 hover:bg-slate-50'
												}`}
											>
												{pg}
											</button>
										);
									})}
									<button
										type="button"
										disabled={clampedPage >= totalPages}
										onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
										className="h-8 w-8 rounded-lg border border-slate-200 flex items-center justify-center disabled:opacity-30 hover:bg-slate-50 transition-colors cursor-pointer disabled:cursor-default"
									>
										<i className="fas fa-chevron-right text-[10px]" aria-hidden="true" />
									</button>
								</div>
							</div>
						)}
					</>
				)}
			</main>
		</div>
	);
}
