import type React from 'react';

interface PageHeaderProps {
	/** Small uppercase tag line above the title (e.g. "Analytics") */
	tagline?: string;
	/** Main heading text */
	title: string;
	/** Optional subtitle below the title */
	subtitle?: string;
	/** Content rendered at the trailing end of the header row */
	actions?: React.ReactNode;
	className?: string;
}

/**
 * Standardised page header: optional tagline, h1 title, subtitle, and
 * a trailing slot for action buttons / controls.
 */
export default function PageHeader({
	tagline,
	title,
	subtitle,
	actions,
	className = '',
}: PageHeaderProps): React.ReactElement {
	return (
		<div className={`mb-8 flex flex-wrap items-start justify-between gap-4 ${className}`.trim()}>
			<div>
				{tagline && (
					<p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
						{tagline}
					</p>
				)}
				<h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">{title}</h1>
				{subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
			</div>
			{actions && <div className="flex items-center gap-2">{actions}</div>}
		</div>
	);
}
