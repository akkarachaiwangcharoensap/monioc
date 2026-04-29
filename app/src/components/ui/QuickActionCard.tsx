import type React from 'react';
import TabLink from './TabLink';

export interface QuickActionData {
	to: string;
	icon: string;
	title: string;
	subtitle: string;
	/** Tailwind bg for the icon badge */
	iconBg: string;
	/** Tailwind text color for the icon */
	iconColor: string;
}

interface QuickActionCardProps extends QuickActionData {
	/** Primary variant: full-width colored banner; secondary: compact grid card */
	variant?: 'primary' | 'secondary';
	className?: string;
}

/**
 * A data-driven quick action card that links to a route via the tab system.
 * Supports two visual variants for hero vs. grid placement.
 */
export default function QuickActionCard({
	to,
	icon,
	title,
	subtitle,
	iconBg,
	iconColor,
	variant = 'secondary',
	className = '',
}: QuickActionCardProps): React.ReactElement {
	if (variant === 'primary') {
		return (
			<TabLink
				to={to}
				className={`flex items-center gap-4 rounded-2xl bg-violet-600 p-4 text-white transition-all hover:bg-violet-700 active:scale-[0.99] ${className}`.trim()}
			>
				<div className="h-10 w-10 flex-shrink-0 rounded-xl bg-white/20 flex items-center justify-center">
					<i className={`fas ${icon}`} aria-hidden="true" />
				</div>
				<div className="flex-1">
					<p className="text-sm font-semibold leading-tight">{title}</p>
					<p className="mt-0.5 text-xs text-violet-200">{subtitle}</p>
				</div>
				<i className="fas fa-arrow-right text-xs opacity-60" aria-hidden="true" />
			</TabLink>
		);
	}

	return (
		<TabLink
			to={to}
			className={`flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 transition-all hover:bg-slate-100 active:scale-[0.99] ${className}`.trim()}
		>
			<div className={`h-9 w-9 flex-shrink-0 rounded-xl ${iconBg} flex items-center justify-center`}>
				<i className={`fas ${icon} text-sm ${iconColor}`} aria-hidden="true" />
			</div>
			<div>
				<p className="text-sm font-semibold text-slate-800">{title}</p>
				<p className="text-xs text-slate-500">{subtitle}</p>
			</div>
		</TabLink>
	);
}
