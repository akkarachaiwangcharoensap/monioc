import type React from 'react';

interface MockStatCardProps {
	/** Numeric or formatted value to display prominently */
	value: string;
	/** Label below the value */
	label: string;
	/** Optional icon class (Font Awesome), e.g. "fas fa-wallet" */
	icon?: string;
	/** Tailwind bg class for the icon container, e.g. "bg-violet-50" */
	iconBg?: string;
	/** Tailwind text class for the icon, e.g. "text-violet-600" */
	iconColor?: string;
	/** Optional delta line (e.g. "+3.2% vs last month") */
	delta?: React.ReactNode;
	/** When true, stretches to fill two grid columns on sm+ */
	wide?: boolean;
	className?: string;
}

/**
 * A KPI / stat display card used in the landing demo statistics page.
 * Data-driven: pass values as props to render the same visual in any context.
 */
export default function MockStatsCard({
	value,
	label,
	icon,
	iconBg = 'bg-violet-50',
	iconColor = 'text-violet-600',
	delta,
	wide = false,
	className = '',
}: MockStatCardProps): React.ReactElement {
	return (
		<div
			className={`rounded-2xl border border-slate-100 bg-white p-5 ${wide ? 'col-span-2 sm:col-span-1' : ''} ${icon ? 'flex items-start gap-4' : 'flex flex-col justify-between'} ${className}`.trim()}
		>
			{icon && (
				<div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg} ${iconColor}`}>
					<i className={`${icon} text-sm`} aria-hidden="true" />
				</div>
			)}
			<div className="min-w-0">
				<p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 text-left">{label}</p>
				<p className="mt-0.5 text-2xl font-bold tracking-tight text-slate-900 leading-none tabular-nums text-left">
					{value}
				</p>
				{delta && <div className="mt-1 text-left">{delta}</div>}
			</div>
		</div>
	);
}
