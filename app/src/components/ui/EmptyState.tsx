import type React from 'react';

interface EmptyStateProps {
	icon?: string;
	message: string;
	subMessage?: string;
	action?: React.ReactNode;
}

export default function EmptyState({
	icon = 'fa-inbox',
	message,
	subMessage,
	action,
}: EmptyStateProps): React.ReactElement {
	return (
		<div className="rounded-2xl border border-slate-200 bg-slate-50 px-6 py-12 text-center">
			<i className={`fas ${icon} text-4xl text-slate-300 mb-4 block`} aria-hidden="true" />
			<p className="text-sm font-medium text-slate-600">{message}</p>
			{subMessage && <p className="text-xs text-slate-400 mt-1">{subMessage}</p>}
			{action && <div className="mt-4">{action}</div>}
		</div>
	);
}
