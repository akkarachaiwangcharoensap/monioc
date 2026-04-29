import { useState } from 'react';
import type React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { formatMoney } from '../utils';
import { CHART_COLORS, FALLBACK_CATEGORY_COLOR, CHART_ANIMATION_DURATION_MS, CHART_TRANSITION_DURATION_MS } from '../constants';

export interface SpendingChartItem {
	category: string;
	amount: number;
}

export interface SpendingChartProps {
	items: SpendingChartItem[];
	onCategoryClick?: (category: string) => void;
	getCategoryColor?: (category: string) => string;
}

interface Segment extends SpendingChartItem {
	color: string;
	pct: number;
}

function getSegmentColor(category: string, index: number, getCategoryColor?: (c: string) => string): string {
	if (getCategoryColor) return getCategoryColor(category);
	return category === 'Uncategorized' ? FALLBACK_CATEGORY_COLOR : CHART_COLORS[index % CHART_COLORS.length];
}

export default function SpendingChart({
	items,
	onCategoryClick,
	getCategoryColor,
}: SpendingChartProps): React.ReactElement {
	const [hovered, setHovered] = useState<string | null>(null);
	// Disable animation after the first render so hover state changes
	// don't replay the entry animation.
	const [animationActive, setAnimationActive] = useState(true);
	const normalizedItems = items.filter((item) => Number.isFinite(item.amount) && item.amount > 0);
	const renderedTotal = normalizedItems.reduce((sum, item) => sum + item.amount, 0);

	if (normalizedItems.length === 0 || renderedTotal <= 0) {
		return (
			<div className="flex flex-col items-center py-6 text-center">
				<i className="fas fa-chart-pie text-3xl text-slate-200 mb-2 block" aria-hidden="true" />
				<p className="text-sm text-slate-400">No spending data for this period</p>
				<p className="text-xs text-slate-300 mt-1">
					Scan a receipt and assign categories to see your breakdown
				</p>
			</div>
		);
	}

	const segments: Segment[] = normalizedItems.map((item, i) => {
		const pct = (item.amount / renderedTotal) * 100;
		return {
			...item,
			color: getSegmentColor(item.category, i, getCategoryColor),
			pct,
		};
	});

	const hoveredSeg = hovered ? segments.find((s) => s.category === hovered) ?? null : null;

	return (
		<div className="w-full flex flex-col gap-5 sm:flex-row sm:items-start">
			<div className="relative h-[210px] w-[210px] flex-shrink-0">
				<ResponsiveContainer width="100%" height="100%">
					<PieChart>
						<Pie
							data={segments}
							dataKey="amount"
							nameKey="category"
							cx="50%"
							cy="50%"
							innerRadius={54}
							outerRadius={84}
							paddingAngle={0}
							stroke="none"
							isAnimationActive={animationActive}
							animationDuration={CHART_ANIMATION_DURATION_MS}
							animationEasing="ease-out"
							onAnimationEnd={() => setAnimationActive(false)}
							onMouseEnter={(_, index) => {
								const segment = segments[index];
								setHovered(segment ? segment.category : null);
							}}
							onMouseLeave={() => setHovered(null)}
							onClick={(_, index) => {
								const segment = segments[index];
								if (segment && onCategoryClick) onCategoryClick(segment.category);
							}}
						>
							{segments.map((seg) => {
								const isHovered = hovered === seg.category;
								const anyHovered = hovered !== null;
								return (
									<Cell
										key={seg.category}
										fill={seg.color}
										fillOpacity={anyHovered && !isHovered ? 0.4 : 1}
										style={{ cursor: 'pointer', transition: `fill-opacity ${CHART_TRANSITION_DURATION_MS}ms ease 40ms` }}
									/>
								);
							})}
						</Pie>
					</PieChart>
				</ResponsiveContainer>

				{/* Centre label — amount+% on hover, total otherwise */}
				<div className="pointer-events-none absolute inset-0 flex items-center justify-center">
					<div className="relative h-[56px] w-[120px] text-center">
						<div
							className={`absolute inset-0 flex flex-col items-center justify-center transition-opacity duration-220 ${hoveredSeg ? 'opacity-0 delay-0' : 'opacity-100 delay-90'}`}
						>
							<p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Total</p>
							<p className="text-[16px] font-bold text-slate-800 leading-tight tabular-nums">{formatMoney(renderedTotal)}</p>
						</div>
						<div
							className={`absolute inset-0 flex flex-col items-center justify-center transition-opacity duration-220 ${hoveredSeg ? 'opacity-100 delay-90' : 'opacity-0 delay-0'}`}
						>
							<p className="text-[16px] font-bold text-slate-900 leading-snug tabular-nums">
								{hoveredSeg ? formatMoney(hoveredSeg.amount) : ''}
							</p>
							<p className="text-[11px] text-slate-400 leading-tight">
								{hoveredSeg ? `${hoveredSeg.pct.toFixed(0)}%` : ''}
							</p>
						</div>
					</div>
				</div>
			</div>

			{/* Legend — min-w-0 ensures the flex child never pushes the container wider */}
			<div className="min-w-0 w-full space-y-2.5">
				{segments.map((seg) => {
					const isHovered = hovered === seg.category;
					const anyHovered = hovered !== null;
					return (
						<div
							key={seg.category}
							className={`flex items-center justify-between gap-2 transition-opacity duration-200 ${onCategoryClick ? 'cursor-pointer' : 'cursor-default'}`}
							style={{ opacity: anyHovered && !isHovered ? 0.35 : 1 }}
							onMouseEnter={() => setHovered(seg.category)}
							onMouseLeave={() => setHovered(null)}
							onClick={() => onCategoryClick?.(seg.category)}
						>
							<div className="flex items-center gap-2 min-w-0">
								<span
									className="w-2.5 h-2.5 rounded-full flex-shrink-0 transition-transform duration-150"
									style={{
										backgroundColor: seg.color,
										transform: isHovered ? 'scale(1.35)' : 'scale(1)',
									}}
									aria-hidden="true"
								/>
								{/* Keep font-weight fixed to avoid text-width layout shifts on hover */}
								<span className="text-[12px] font-medium truncate transition-colors duration-150" style={{ color: isHovered ? '#1e293b' : '#475569' }}>
									{seg.category}
								</span>
								{onCategoryClick && (
									<i
										className={`fas fa-chevron-right text-[8px] transition-opacity duration-150 ${isHovered ? 'opacity-50' : 'opacity-0'}`}
										aria-hidden="true"
									/>
								)}
							</div>
							<div className="flex items-center gap-2 flex-shrink-0">
								<span className="text-[11px] text-slate-400">{seg.pct.toFixed(0)}%</span>
								<span className="text-[12px] font-semibold text-slate-700">{formatMoney(seg.amount)}</span>
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}
