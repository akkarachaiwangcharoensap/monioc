import { useMemo, useState } from 'react';
import type React from 'react';
import { MOCK_RECEIPTS, getMockCategoryColor } from '../mock-data';
import { formatMoney } from '../../utils/priceFormatting';
import SpendingChart from '../../components/SpendingChart';
import type { ReceiptScanRecord } from '../../types/receipt';

type DateFilter = 'today' | 'lastWeek' | 'last2Weeks';

const FILTER_LABELS: { id: DateFilter; label: string }[] = [
	{ id: 'today', label: 'Today' },
	{ id: 'lastWeek', label: 'Last Week' },
	{ id: 'last2Weeks', label: 'Last 2 Weeks' },
];

function parseReceiptDate(raw: string): Date {
	return new Date(raw.includes('T') || raw.includes(' ') ? raw.replace(' ', 'T') : `${raw}T12:00:00`);
}

function getFilterRange(filter: DateFilter): [Date, Date] {
	const end = new Date();
	end.setHours(23, 59, 59, 999);
	const start = new Date();
	switch (filter) {
		case 'today':
			start.setHours(0, 0, 0, 0);
			break;
		case 'lastWeek':
			start.setDate(start.getDate() - 6);
			start.setHours(0, 0, 0, 0);
			break;
		case 'last2Weeks':
			start.setDate(start.getDate() - 13);
			start.setHours(0, 0, 0, 0);
			break;
	}
	return [start, end];
}

function computeChartItems(
	filter: DateFilter,
): Array<{ category: string; amount: number }> {
	const [start, end] = getFilterRange(filter);
	const totals: Record<string, number> = {};
	for (const receipt of MOCK_RECEIPTS) {
		const raw = receipt.purchaseDate ?? receipt.createdAt;
		const d = parseReceiptDate(raw);
		if (Number.isNaN(d.getTime()) || d < start || d > end) continue;
		for (const row of receipt.data.rows) {
			const cat = row.category ?? 'Uncategorized';
			totals[cat] = (totals[cat] ?? 0) + row.price;
		}
	}
	const items = Object.entries(totals)
		.map(([category, amount]) => ({ category, amount }))
		.sort((a, b) => b.amount - a.amount);
	if (items.length > 6) {
		const top6 = items.slice(0, 6);
		const otherAmount = items.slice(6).reduce((s, i) => s + i.amount, 0);
		if (otherAmount > 0) top6.push({ category: 'Other', amount: otherAmount });
		return top6;
	}
	return items;
}

interface Props {
	onOpenReceipt: (r: ReceiptScanRecord) => void;
	onNavigate: (page: string) => void;
}

export default function MockDashboardPage({ onOpenReceipt, onNavigate }: Props): React.ReactElement {
	const month = new Date().toLocaleString('en-CA', { month: 'long', year: 'numeric' });
	const [dateFilter, setDateFilter] = useState<DateFilter>('last2Weeks');

	const stats = useMemo(() => {
		const now = new Date();
		const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
		let monthTotal = 0;
		for (const r of MOCK_RECEIPTS) {
			const raw = r.purchaseDate ?? r.createdAt;
			const d = parseReceiptDate(raw);
			if (!Number.isNaN(d.getTime()) && d >= monthStart) {
				monthTotal += r.data.rows.reduce((s, row) => s + row.price, 0);
			}
		}
		return { monthTotal, totalReceipts: MOCK_RECEIPTS.length };
	}, []);

	const chartItems = useMemo(
		() => computeChartItems(dateFilter),
		[dateFilter],
	);

	const recentReceipts = useMemo(
		() =>
			[...MOCK_RECEIPTS]
				.sort((a, b) => {
					const da = parseReceiptDate(a.purchaseDate ?? a.createdAt).getTime();
					const db = parseReceiptDate(b.purchaseDate ?? b.createdAt).getTime();
					return db - da;
				})
				.slice(0, 5),
		[],
	);

	return (
		<div className="min-h-full bg-white">
			<div className="mx-auto max-w-4xl px-5 pt-5 pb-10 sm:px-8">
				{/* Header */}
				<div className="mb-5 flex flex-wrap items-start justify-between gap-3">
					<div>
						<p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 text-left">{month}</p>
						<h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900 text-left">Good afternoon</h1>
						<p className="mt-1 text-sm text-slate-500 text-left">Your grocery spending snapshot in one place.</p>
					</div>
					<button
						type="button"
						onClick={() => onNavigate('scanner')}
						className="inline-flex items-center gap-1.5 rounded-full bg-violet-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-violet-700"
					>
						<i className="fas fa-camera text-[10px]" aria-hidden="true" />
						Scan Receipt
					</button>
				</div>

				{/* Stats grid */}
				<div className="mb-5 grid grid-cols-2 gap-3">
					<div className="rounded-2xl border border-slate-100 bg-white p-4 flex flex-col justify-between">
						<p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 text-left">Spent this month</p>
						<p className="mt-1 text-xl font-bold tracking-tight text-slate-900 leading-none tabular-nums text-left">{formatMoney(stats.monthTotal)}</p>
					</div>
					<div className="rounded-2xl border border-slate-100 bg-white p-4 flex flex-col justify-between">
						<p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 text-left">Total receipts</p>
						<p className="mt-1 text-xl font-bold tracking-tight text-slate-900 leading-none tabular-nums text-left">{stats.totalReceipts}</p>
					</div>
				</div>

				{/* Main content */}
				<div className="grid gap-5 md:grid-cols-[1.1fr_0.9fr]">
					<div className="space-y-5">
						{/* Spending by Category */}
						<section>
							<div className="mb-2.5 flex items-center justify-between">
								<h2 className="text-sm font-semibold text-slate-700">Spending by Category</h2>
							</div>
							{/* Filter chips */}
							<div className="mb-3 rounded-xl border border-slate-100 bg-slate-50/60 p-2.5">
								<div className="flex items-center gap-1.5 flex-wrap">
									{FILTER_LABELS.map(({ id, label }) => (
										<button
											key={id}
											type="button"
											onClick={() => setDateFilter(id)}
											className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
												dateFilter === id
													? 'bg-violet-600 text-white'
													: 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'
											}`}
										>
											{label}
										</button>
									))}
								</div>

							</div>
							<div className="rounded-2xl border border-slate-200 bg-white p-4">
								{chartItems.length > 0 ? (
									<div style={{ outline: 'none' }} className="[&_*:focus]:outline-none [&_*:focus-visible]:outline-none">
										<SpendingChart items={chartItems} getCategoryColor={getMockCategoryColor} />
									</div>
								) : (
									<div className="flex flex-col items-center justify-center py-10 text-center">
										<i className="fas fa-chart-pie text-3xl text-slate-200 mb-2" aria-hidden="true" />
										<p className="text-xs text-slate-400">No spending recorded for this period.</p>
									</div>
								)}
							</div>
						</section>
					</div>

					{/* Recent Receipts */}
					<section>
						<div className="mb-3 flex items-center justify-between">
							<h2 className="text-sm font-semibold text-slate-700">Recent Receipts</h2>
							<button
								type="button"
								onClick={() => onNavigate('receipts')}
								className="text-xs font-medium text-violet-600 hover:text-violet-700 transition-colors"
							>
								View all <i className="fas fa-arrow-right text-[10px]" aria-hidden="true" />
							</button>
						</div>
						<div className="space-y-2">
							{recentReceipts.map((r) => {
								const total = r.data.rows.reduce((sum, row) => sum + row.price, 0);
								const itemCount = r.data.rows.length;
								const raw = r.purchaseDate ?? r.createdAt;
								const d = parseReceiptDate(raw);
								const dateLabel = Number.isNaN(d.getTime())
									? raw
									: d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', weekday: 'short' });

								return (
									<button
										key={r.id}
										type="button"
										onClick={() => onOpenReceipt(r)}
										className="w-full rounded-2xl border border-slate-200/90 bg-white p-3 transition-colors duration-150 hover:border-violet-300 hover:bg-violet-50/40 active:scale-[0.99] text-left"
									>
										<div className="flex items-start gap-3">
											<div className="h-10 w-10 rounded-xl border border-slate-200 bg-slate-100 flex items-center justify-center text-slate-300 flex-shrink-0">
												<i className="fas fa-image text-xs" aria-hidden="true" />
											</div>
											<div className="min-w-0 flex-1">
												<div className="flex items-start justify-between gap-2">
													<div className="min-w-0 flex-1">
														<p className="truncate text-xs font-semibold tracking-[-0.01em] text-slate-900">{r.displayName}</p>
														<p className="mt-0.5 text-[10px] text-slate-500">{dateLabel}</p>
													</div>
													<div className="flex items-center gap-1 flex-shrink-0">
														<p className="text-xs font-semibold tabular-nums text-slate-900">{formatMoney(total)}</p>
														<i className="fas fa-chevron-right text-[8px] text-slate-300" aria-hidden="true" />
													</div>
												</div>
												<div className="mt-1.5 flex items-center gap-1 overflow-hidden">
													<span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600">
														<i className="fas fa-list-ul text-[8px] text-slate-400" aria-hidden="true" />
														{itemCount} {itemCount === 1 ? 'item' : 'items'}
													</span>
												</div>
											</div>
										</div>
									</button>
								);
							})}
						</div>
					</section>
				</div>
			</div>
		</div>
	);
}
