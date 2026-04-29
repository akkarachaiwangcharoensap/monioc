/**
 * Mock Statistics page for the landing demo.
 * Uses actual statistics utilities with MOCK_RECEIPTS data.
 * Supports year/month/week granularity, period navigation, and bar click drill-down.
 */
import { useState, useMemo, useCallback, useEffect } from 'react';
import type React from 'react';
import {
	BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
	ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';
import { MOCK_RECEIPTS, getMockCategoryColor, MOCK_DATA_START_YEAR } from '../mock-data';
import {
	buildBarData, computeKPIs, getPeriodRange, effectiveDate,
	type Granularity, type BarData,
} from '../../utils/statistics';
import MockStatsCard from '../components/ui/MockStatsCard';
import Pagination from '../../components/ui/Pagination';
import SearchInput from '../../components/ui/SearchInput';
import GranularityToggle from '../../components/ui/GranularityToggle';
import { formatMoney } from '../../utils/priceFormatting';
import BarTooltip from '../../components/charts/BarTooltip';
import type { BarTooltipProps } from '../../components/charts/BarTooltip';

const CATEGORY_PAGE_SIZE = 5;

interface MockStatisticsPreviewProps {
	style?: React.CSSProperties;
}

function MockStatisticsContent(): React.ReactElement {
	const [granularity, setGranularity] = useState<Granularity>('year');
	const [periodOffset, setPeriodOffset] = useState(0);
	const [categoryPage, setCategoryPage] = useState(1);
	const [sortField, setSortField] = useState<'amount' | 'items' | 'category'>('amount');
	const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
	const [categorySearch, setCategorySearch] = useState('');

	const period = useMemo(() => getPeriodRange(granularity, periodOffset), [granularity, periodOffset]);
	const prevPeriod = useMemo(() => getPeriodRange(granularity, periodOffset - 1), [granularity, periodOffset]);
	const nextPeriod = useMemo(() => getPeriodRange(granularity, periodOffset + 1), [granularity, periodOffset]);

	const kpis = useMemo(() => computeKPIs(MOCK_RECEIPTS, period), [period]);
	const barData = useMemo(() => buildBarData(MOCK_RECEIPTS, period, granularity), [period, granularity]);

	const barAvg = useMemo(() => {
		const nonZero = barData.filter((b) => b.total > 0);
		return nonZero.length > 0 ? nonZero.reduce((s, b) => s + b.total, 0) / nonZero.length : 0;
	}, [barData]);

	const currentBarIndex = useMemo(() => {
		if (periodOffset !== 0) return -1;
		const now = new Date();
		if (granularity === 'year') return now.getMonth();
		if (granularity === 'month') {
			for (let i = 0; i < barData.length; i++) {
				const bucketStart = barData[i].periodStart;
				const bucketEnd = new Date(bucketStart);
				bucketEnd.setDate(bucketStart.getDate() + 6);
				bucketEnd.setHours(23, 59, 59, 999);
				if (now >= bucketStart && now <= bucketEnd) return i;
			}
			return -1;
		}
		return now.getDay();
	}, [granularity, periodOffset, barData]);

	// Category data directly from records within period
	const categoryData = useMemo(() => {
		const totals: Record<string, number> = {};
		const itemCounts: Record<string, number> = {};
		for (const r of MOCK_RECEIPTS) {
			const d = effectiveDate(r);
			if (!d || d < period.start || d > period.end) continue;
			for (const row of r.data.rows) {
				if (row.price <= 0) continue;
				const cat = row.category?.trim() || 'Uncategorized';
				totals[cat] = (totals[cat] ?? 0) + row.price;
				itemCounts[cat] = (itemCounts[cat] ?? 0) + 1;
			}
		}
		return Object.entries(totals)
			.map(([category, amount]) => ({ category, amount, items: itemCounts[category] ?? 0 }))
			.sort((a, b) => b.amount - a.amount);
	}, [period]);

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

	useEffect(() => { setCategoryPage(1); }, [granularity, periodOffset, categorySearch]);

	// Limit back-navigation to MOCK_DATA_START_YEAR
	const canGoBack = useMemo(() => {
		return prevPeriod.start.getFullYear() >= MOCK_DATA_START_YEAR;
	}, [prevPeriod]);

	const handleGranularity = useCallback((g: Granularity) => {
		setGranularity(g);
		setPeriodOffset(0);
	}, []);

	const handleBarClick = useCallback((data: BarData) => {
		if (data.receipts === 0) return;
		if (granularity === 'year') {
			const today = new Date();
			const newOffset =
				(data.periodStart.getFullYear() * 12 + data.periodStart.getMonth()) -
				(today.getFullYear() * 12 + today.getMonth());
			handleGranularity('month');
			setPeriodOffset(newOffset);
		} else if (granularity === 'month') {
			const targetSunday = new Date(data.periodStart);
			targetSunday.setHours(0, 0, 0, 0);
			const currentWeekStart = getPeriodRange('week', 0).start;
			const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
			const newOffset = Math.round(
				(targetSunday.getTime() - currentWeekStart.getTime()) / MS_PER_WEEK,
			);
			handleGranularity('week');
			setPeriodOffset(newOffset);
		}
		// week: no further drill-down in the demo
	}, [granularity, handleGranularity]);

	const renderTooltip = useCallback((props: BarTooltipProps) => (
		<BarTooltip {...props} getCategoryColor={getMockCategoryColor} />
	), []);

	return (
		<div className="min-h-full bg-white">
			<main className="mx-auto px-2 sm:px-0">

				{/* ── Page header ───────────────────────────────── */}
				<div className="mb-4 flex flex-wrap items-start justify-between gap-4">
					<div>
						<p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 text-left">Analytics</p>
						<h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900 text-left">Statistics</h1>
					</div>
					{/* Granularity switcher */}
					<GranularityToggle value={granularity} onChange={handleGranularity} />
				</div>

				{/* ── Period navigation ─────────────────────────── */}
				<div className="mb-6 flex items-center justify-between">
					<button
						type="button"
						disabled={!canGoBack}
						onClick={() => setPeriodOffset((o) => o - 1)}
						className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 transition-colors text-xs font-medium disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
						aria-label={`Go to ${prevPeriod.label}`}
					>
						<i className="fas fa-chevron-left text-[10px]" aria-hidden="true" />
						{prevPeriod.label}
					</button>
					<span className="text-sm font-semibold text-slate-700">{period.label}</span>
					<button
						type="button"
						disabled={periodOffset >= 0}
						onClick={() => setPeriodOffset((o) => o + 1)}
						className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 transition-colors text-xs font-medium disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
						aria-label={`Go to ${nextPeriod.label}`}
					>
						{nextPeriod.label}
						<i className="fas fa-chevron-right text-[10px]" aria-hidden="true" />
					</button>
				</div>

				{/* ── KPI cards ─────────────────────────────────── */}
				<div className="mb-6 grid grid-cols-2 gap-3">
					<MockStatsCard
						value={formatMoney(kpis.periodTotal)}
						label="Period Spend"
						icon="fas fa-wallet"
						iconBg="bg-violet-50"
						iconColor="text-violet-600"
						wide
						delta={
							kpis.delta !== null ? (
								<p className={`text-xs font-medium flex items-center gap-1 ${kpis.delta <= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
									<i className={`fas fa-arrow-${kpis.delta <= 0 ? 'down' : 'up'} text-[9px]`} aria-hidden="true" />
									{Math.abs(kpis.delta).toFixed(1)}% vs previous
								</p>
							) : (
								<p className="text-xs text-slate-400">No prior period data</p>
							)
						}
					/>
					<MockStatsCard
						value={String(kpis.periodReceipts)}
						label="Receipts"
						delta={<p className="text-[11px] text-slate-400">this period</p>}
					/>
				</div>
				{/* ── Bar chart ─────────────────────────────────── */}
				<section className="mb-6 rounded-2xl border border-slate-200 bg-white p-6">
					<div className="mb-4 flex items-baseline justify-between">
						<div>
							<h2 className="text-sm font-semibold text-slate-800">Spending — {period.label}</h2>
							{barAvg > 0 && (
								<p className="mt-0.5 text-xs text-slate-400 text-left">avg {formatMoney(barAvg)}</p>
							)}
						</div>
					</div>
					{/* Prevent blue focus ring on Recharts SVG and bar rectangles when clicking */}
					<div style={{ outline: 'none' }} className="[&_*:focus]:outline-none [&_*:focus-visible]:outline-none">
						<ResponsiveContainer width="100%" height={260}>
							<BarChart
								data={barData}
								margin={{ top: 8, right: 4, left: 0, bottom: 0 }}
							>
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
									minPointSize={barData.some((b) => b.total > 0) ? 0 : 4}
									cursor={granularity !== 'week' ? 'pointer' : 'default'}
									onClick={(data) => handleBarClick(data as unknown as BarData)}
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

				{/* ── Category breakdown ────────────────────────── */}
				<section className="rounded-2xl border border-slate-200 bg-white p-6">
					<div className="mb-3 flex items-center justify-between gap-3">
						<h2 className="text-sm font-semibold text-slate-800">Spending by Category</h2>
						<SearchInput
							value={categorySearch}
							onChange={setCategorySearch}
							placeholder="Search"
							ariaLabel="Search categories"
							className="flex-1 max-w-[180px]"
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
							const color = getMockCategoryColor(cat.category);
							return (
								<button
									key={cat.category}
									type="button"
									className="group w-full text-left rounded-2xl bg-white transition-all active:scale-[0.99]"
								>
									<div className="flex items-center justify-between mb-1">
										<span className="flex items-center gap-1.5 text-[12px] font-medium text-slate-700 group-hover:text-violet-700 transition-colors">
											<span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
											{cat.category}
											<i className="fas fa-chevron-right text-[8px] opacity-0 group-hover:opacity-60 transition-opacity ml-0.5" aria-hidden="true" />
										</span>
										<span className="text-[12px] font-semibold text-slate-800">{formatMoney(cat.amount)}</span>
									</div>
									<div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
										<div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
									</div>
									<p className="mt-0.5 text-[10px] text-slate-400">
										{pct.toFixed(1)}% · {cat.items} item{cat.items !== 1 ? 's' : ''}
									</p>
								</button>
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

			</main>
		</div>
	);
}
export function MockStatisticsPreview({ style }: MockStatisticsPreviewProps): React.ReactElement {
	return (
		<div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden" style={style}>
			<div className="mx-auto px-4 sm:px-6 pt-8 pb-10">
				<MockStatisticsContent />
			</div>
		</div>
	);
}

export default function MockStatisticsPage(): React.ReactElement {
	return (
		<div className="min-h-full bg-white">
			<main className="mx-auto px-4 sm:px-6 pt-8 pb-10">
				<MockStatisticsContent />
			</main>
		</div>
	);
}