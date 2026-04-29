import { useState, useRef } from 'react';
import type React from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { formatMoney } from '../utils';
import { CHART_COLORS, FALLBACK_CATEGORY_COLOR, CHART_TRANSITION_DURATION_MS } from '../constants';

export interface SpendingPieChartItem {
    category: string;
    amount: number;
    items: number;
}

export interface SpendingPieChartProps {
    items: SpendingPieChartItem[];
    getCategoryColor: (category: string) => string;
    onCategoryClick: (category: string) => void;
    totalAmount: number;
}

interface Segment extends SpendingPieChartItem {
    color: string;
    pct: number;
}

function getSegmentColor(category: string, index: number, getCategoryColor: (c: string) => string): string {
    const color = getCategoryColor(category);
    if (color) return color;
    return category === 'Uncategorized' ? FALLBACK_CATEGORY_COLOR : CHART_COLORS[index % CHART_COLORS.length];
}

interface PieTooltipProps {
    active?: boolean;
    payload?: Array<{ name: string; value: number; payload: Segment }>;
}

function PieChartTooltip({ active, payload }: PieTooltipProps): React.ReactElement | null {
    if (!active || !payload?.length) return null;
    const seg = payload[0].payload;
    return (
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-lg text-xs">
            <p className="font-semibold text-slate-700">{seg.category}</p>
            <p className="text-slate-600 mt-0.5">{formatMoney(seg.amount)}</p>
        </div>
    );
}

export default function SpendingPieChart({
    items,
    getCategoryColor,
    onCategoryClick,
    totalAmount,
}: SpendingPieChartProps): React.ReactElement {
    const [hovered, setHovered] = useState<string | null>(null);
    const normalizedItems = items.filter((item) => Number.isFinite(item.amount) && item.amount > 0);

    // Stable string key representing the current data set.
    // Used as the `key` on <Pie> so Recharts mounts a fresh instance (and plays
    // its entry animation) whenever the category/amount structure changes.
    const itemsKey = normalizedItems.map((i) => `${i.category}:${i.amount.toFixed(2)}`).join('|');
    // Suppress the stale-hover after a data change so the centre label resets.
    const prevKeyRef = useRef(itemsKey);
    if (itemsKey !== prevKeyRef.current) {
        prevKeyRef.current = itemsKey;
        // Clear hover synchronously during render (safe: only updates a ref/derived value)
    }

    const renderedTotal = totalAmount > 0 ? totalAmount : normalizedItems.reduce((sum, item) => sum + item.amount, 0);

    if (normalizedItems.length === 0 || renderedTotal <= 0) {
        return (
            <div className="flex flex-col items-center py-6 text-center">
                <i className="fas fa-chart-pie text-3xl text-slate-200 mb-2 block" aria-hidden="true" />
                <p className="text-sm text-slate-400">No data for this period</p>
            </div>
        );
    }

    const segments: Segment[] = normalizedItems.map((item, i) => {
        const pct = renderedTotal > 0 ? (item.amount / renderedTotal) * 100 : 0;
        return {
            ...item,
            color: getSegmentColor(item.category, i, getCategoryColor),
            pct,
        };
    });

    const hoveredSeg = hovered ? segments.find((s) => s.category === hovered) ?? null : null;

    return (
        <div className="w-full flex flex-col gap-5 sm:flex-row sm:items-start">
            <div className="relative h-[210px] w-[210px] flex-shrink-0 [&_*:focus]:outline-none [&_*:focus-visible]:outline-none">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            key={itemsKey}
                            data={segments}
                            dataKey="amount"
                            nameKey="category"
                            cx="50%"
                            cy="50%"
                            innerRadius={54}
                            outerRadius={84}
                            paddingAngle={0}
                            stroke="none"
                            isAnimationActive={true}
                            animationBegin={50}
                            animationDuration={300}
                            animationEasing="ease-out"
                            onMouseEnter={(_, index) => {
                                const segment = segments[index];
                                setHovered(segment ? segment.category : null);
                            }}
                            onMouseLeave={() => setHovered(null)}
                            onClick={(_, index) => {
                                const segment = segments[index];
                                if (segment) onCategoryClick(segment.category);
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
                                        style={{ cursor: 'pointer', transition: `fill-opacity ${CHART_TRANSITION_DURATION_MS}ms ease 40ms`, outline: 'none' }}
                                        aria-label={`${seg.category}: ${formatMoney(seg.amount)} (${seg.pct.toFixed(1)}%)`}
                                    />
                                );
                            })}
                        </Pie>
                        <Tooltip content={<PieChartTooltip />} wrapperStyle={{ zIndex: 20 }} />
                    </PieChart>
                </ResponsiveContainer>

                {/* Centre label — amount+% on hover, total otherwise */}
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center" style={{ zIndex: 0 }}>
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
                                {hoveredSeg ? `${hoveredSeg.pct.toFixed(1)}%` : ''}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Legend */}
            <ul className="min-w-0 w-full space-y-2.5 list-none p-0 m-0">
                {segments.map((seg) => {
                    const isHovered = hovered === seg.category;
                    const anyHovered = hovered !== null;
                    return (
                        <li
                            key={seg.category}
                            className={`flex items-center justify-between gap-2 transition-opacity duration-200`}
                            style={{ opacity: anyHovered && !isHovered ? 0.35 : 1 }}
                            onMouseEnter={() => setHovered(seg.category)}
                            onMouseLeave={() => setHovered(null)}
                        >
                            <button
                                type="button"
                                className="flex items-center gap-2 min-w-0 cursor-pointer bg-transparent border-none p-0 text-left focus:outline-none focus-visible:ring-0 focus-visible:outline-none"
                                onClick={() => onCategoryClick(seg.category)}
                            >
                                <span
                                    className="w-2.5 h-2.5 rounded-full flex-shrink-0 transition-transform duration-150"
                                    style={{
                                        backgroundColor: seg.color,
                                        transform: isHovered ? 'scale(1.35)' : 'scale(1)',
                                    }}
                                    aria-hidden="true"
                                />
                                <span
                                    className="text-[12px] font-medium truncate transition-colors duration-150"
                                    style={{ color: isHovered ? '#1e293b' : '#475569' }}
                                >
                                    {seg.category}
                                </span>
                                <i
                                    className={`fas fa-chevron-right text-[8px] transition-opacity duration-150 ${isHovered ? 'opacity-50' : 'opacity-0'}`}
                                    aria-hidden="true"
                                />
                            </button>
                            <div className="flex items-center gap-2 flex-shrink-0">
                                <span className="text-[11px] text-slate-400">{seg.pct.toFixed(1)}%</span>
                                <span className="text-[12px] font-semibold text-slate-700">{formatMoney(seg.amount)}</span>
                            </div>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
