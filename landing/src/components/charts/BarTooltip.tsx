import type React from 'react';
import type { BarData } from '../../utils/statistics';
import { formatMoney } from '../../utils';

interface BarTooltipProps {
	active?: boolean;
	payload?: ReadonlyArray<{ payload?: BarData }>;
	label?: string | number;
	getCategoryColor?: (category: string) => string;
}

/**
 * Custom Recharts tooltip for the spending bar chart.
 * Shows the bar total, receipt count, and top 5 category breakdown.
 */
export default function BarTooltip({
	active,
	payload,
	label,
	getCategoryColor,
}: BarTooltipProps): React.ReactElement | null {
	if (!active || !payload?.length) return null;
	const d = payload[0].payload;
	if (!d) return null;
	const topCats = d.categories?.slice(0, 5) ?? [];

	return (
		<div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-lg text-xs min-w-[220px]">
			<p className="font-semibold text-slate-700 mb-1">{label}</p>
			<p className="text-slate-600">{formatMoney(d.total)}</p>
			{d.receipts > 0 && (
				<p className="text-slate-400 mt-0.5">
					{d.receipts} receipt{d.receipts !== 1 ? 's' : ''}
				</p>
			)}
			{topCats.length > 0 && (
				<div className="mt-1.5 pt-1.5 border-t border-slate-100 space-y-0.5">
					{topCats.map((c) => (
						<div key={c.category} className="flex items-center justify-between gap-2">
							<span className="flex items-center gap-1 text-slate-500 min-w-0">
								<span
									className="w-1.5 h-1.5 rounded-full flex-shrink-0"
									style={{ backgroundColor: getCategoryColor?.(c.category) ?? '#94a3b8' }}
								/>
								<span className="truncate max-w-[130px]">{c.category}</span>
							</span>
							<span className="text-slate-600 font-medium tabular-nums flex-shrink-0">
								{formatMoney(c.amount)}
							</span>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

export type { BarTooltipProps };
