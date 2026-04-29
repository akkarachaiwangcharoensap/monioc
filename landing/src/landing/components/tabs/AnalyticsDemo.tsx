import { useState, useMemo } from 'react';
import type React from 'react';
import {
	BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
	ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';
import { MOCK_RECEIPTS, MOCK_CATEGORY_TOTALS } from '../../mock-data';
import {
	type Granularity, type BarData,
	getPeriodRange, buildBarData, computeKPIs,
} from '../../../utils/statistics';
import { formatMoney } from '../../../utils';
import BarTooltip from '../../../components/charts/BarTooltip';
import type { BarTooltipProps } from '../../../components/charts/BarTooltip';
import GranularityToggle from '../../../components/ui/GranularityToggle';

function getCategoryColor(name: string): string {
	return MOCK_CATEGORY_TOTALS.find((c) => c.category === name)?.color ?? '#94a3b8';
}

export default function AnalyticsDemo(): React.ReactElement {
	const [granularity, setGranularity] = useState<Granularity>('year');
	const [periodOffset, setPeriodOffset] = useState(0);

	const period = useMemo(() => getPeriodRange(granularity, periodOffset), [granularity, periodOffset]);
	const prevPeriod = useMemo(() => getPeriodRange(granularity, periodOffset - 1), [granularity, periodOffset]);
	const kpis = useMemo(() => computeKPIs(MOCK_RECEIPTS, period), [period]);

	const barData = useMemo(
		() => buildBarData(MOCK_RECEIPTS, period, granularity),
		[period, granularity],
	);

	const barAvg = useMemo(() => {
		const nonZero = barData.filter((b) => b.total > 0);
		return nonZero.length > 0 ? nonZero.reduce((s, b) => s + b.total, 0) / nonZero.length : 0;
	}, [barData]);

	const handleBarClick = (data: BarData) => {
		if (data.receipts === 0) return;
		if (granularity === 'year') {
			const today = new Date();
			const newOffset =
				(data.periodStart.getFullYear() * 12 + data.periodStart.getMonth()) -
				(today.getFullYear() * 12 + today.getMonth());
			setGranularity('month');
			setPeriodOffset(newOffset);
		} else if (granularity === 'month') {
			const targetSunday = new Date(data.periodStart);
			targetSunday.setHours(0, 0, 0, 0);
			const currentWeekStart = getPeriodRange('week', 0).start;
			const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
			const newOffset = Math.round(
				(targetSunday.getTime() - currentWeekStart.getTime()) / MS_PER_WEEK,
			);
			setGranularity('week');
			setPeriodOffset(newOffset);
		}
	};

	const handleGranularity = (g: Granularity) => {
		setGranularity(g);
		setPeriodOffset(0);
	};

	const deltaSign = kpis.delta !== null && kpis.delta >= 0 ? '+' : '';
	const deltaColor = kpis.delta === null ? 'text-slate-400' : kpis.delta > 0 ? 'text-rose-500' : 'text-emerald-500';

	const totalSpend = MOCK_CATEGORY_TOTALS.reduce((s, c) => s + c.amount, 0);

	return (
		<div className="space-y-3">
			{/* Granularity toggle + period nav */}
			<div className="flex items-center justify-between gap-2">
				<GranularityToggle value={granularity} onChange={handleGranularity} />
				<div className="flex items-center gap-1">
					<button
						type="button"
						onClick={() => setPeriodOffset((o) => o - 1)}
						className="flex items-center h-6 px-2 rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 text-[10px] transition-colors"
					>
						<i className="fas fa-chevron-left text-[8px]" aria-hidden="true" />
					</button>
					<span className="text-[11px] font-semibold text-slate-700 min-w-[90px] text-center">{period.label}</span>
					<button
						type="button"
						onClick={() => setPeriodOffset((o) => o + 1)}
						disabled={periodOffset >= 0}
						className="flex items-center h-6 px-2 rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed text-[10px] transition-colors"
					>
						<i className="fas fa-chevron-right text-[8px]" aria-hidden="true" />
					</button>
				</div>
			</div>

			{/* KPI strip */}
			<div className="grid grid-cols-2 gap-2">
				<div className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm flex items-start gap-2.5">
					<div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center flex-shrink-0">
						<i className="fas fa-wallet text-violet-600 text-xs" aria-hidden="true" />
					</div>
					<div>
						<p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Period Spend</p>
						<p className="text-lg font-bold tracking-tight text-slate-900 tabular-nums">{formatMoney(kpis.periodTotal)}</p>
						{kpis.delta !== null && (
							<p className={`text-[10px] font-medium ${deltaColor}`}>
								{deltaSign}{kpis.delta.toFixed(1)}% vs {prevPeriod.label}
							</p>
						)}
					</div>
				</div>
				<div className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
					<p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Receipts</p>
					<p className="mt-0.5 text-lg font-bold tracking-tight text-slate-900 tabular-nums">{kpis.periodReceipts}</p>
					<p className="text-[10px] text-slate-400">this period</p>
				</div>
			</div>

			{/* Bar chart */}
			<div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
				<div className="mb-2 flex items-baseline justify-between">
					<h3 className="text-xs font-semibold text-slate-800">Spending — {period.label}</h3>
					{barAvg > 0 && <p className="text-[10px] text-slate-400">avg {formatMoney(barAvg)}</p>}
				</div>
				<ResponsiveContainer width="100%" height={180}>
					<BarChart data={barData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
						<CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
						<XAxis dataKey="label" tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
						<YAxis tickFormatter={(v: number) => `$${v}`} tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={40} />
						<Tooltip content={(props: BarTooltipProps) => <BarTooltip {...props} getCategoryColor={getCategoryColor} />} cursor={{ fill: '#f8fafc' }} />
						{barAvg > 0 && (
							<ReferenceLine
								y={barAvg}
								stroke="#a78bfa"
								strokeDasharray="4 3"
								strokeWidth={1.5}
								label={{ value: `avg ${formatMoney(barAvg)}`, fill: '#a78bfa', fontSize: 8, position: 'insideTopRight' }}
							/>
						)}
						<Bar
							dataKey="total"
							radius={[4, 4, 0, 0]}
							maxBarSize={32}
							minPointSize={4}
							isAnimationActive
							animationDuration={600}
							onClick={(data) => handleBarClick(data as unknown as BarData)}
							cursor="pointer"
						>
							{barData.map((entry, idx) => (
								<Cell
									key={entry.label}
									fill={entry.total > 0 ? (idx === barData.findIndex((b) => b.total === Math.max(...barData.map((d) => d.total))) ? '#7c3aed' : '#a78bfa') : '#f1f5f9'}
								/>
							))}
						</Bar>
					</BarChart>
				</ResponsiveContainer>
				{granularity !== 'week' && (
					<p className="text-[9px] text-slate-400 mt-1 text-center">
						<i className="fas fa-mouse-pointer text-[8px] mr-0.5" aria-hidden="true" />
						Click a bar to drill down
					</p>
				)}
			</div>

			{/* Category breakdown */}
			<div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
				<h3 className="text-xs font-semibold text-slate-800 mb-2">Spending by Category</h3>
				<div className="space-y-2">
					{MOCK_CATEGORY_TOTALS.map((cat) => {
						const pct = totalSpend > 0 ? (cat.amount / totalSpend) * 100 : 0;
						return (
							<div key={cat.category}>
								<div className="flex items-center justify-between mb-0.5">
									<span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-700">
										<span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
										{cat.category}
									</span>
									<span className="text-[11px] font-semibold text-slate-800">{formatMoney(cat.amount)}</span>
								</div>
								<div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
									<div
										className="h-full rounded-full"
										style={{
											width: `${pct}%`,
											backgroundColor: cat.color,
											transition: 'width 0.6s ease',
										}}
									/>
								</div>
								<p className="mt-0.5 text-[9px] text-slate-400">{pct.toFixed(1)}% · {cat.items} items</p>
							</div>
						);
					})}
				</div>
			</div>
		</div>
	);
}
