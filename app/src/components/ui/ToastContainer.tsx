import { useState } from 'react';
import type React from 'react';
import { useToast, type ToastItem } from '../../context/ToastContext';

// ── Per-type icon + colour tokens ─────────────────────────────────────────────
const TOKENS: Record<string, { icon: string; bg: string; fg: string }> = {
	progress: { icon: 'fa-circle-notch fa-spin', bg: 'bg-blue-50', fg: 'text-blue-500' },
	success: { icon: 'fa-check', bg: 'bg-emerald-50', fg: 'text-emerald-500' },
	error: { icon: 'fa-xmark', bg: 'bg-red-50', fg: 'text-red-500' },
	info: { icon: 'fa-circle-info', bg: 'bg-slate-50', fg: 'text-slate-400' },
};

// ── Minimised pill ────────────────────────────────────────────────────────────
function MinimisedPill({ toast, onExpand }: { toast: ToastItem; onExpand: () => void }): React.JSX.Element {
	const raw = toast.progressLabel ?? (toast.progress != null ? `${toast.progress}%` : '');
	const label = raw.length > 28 ? `${raw.slice(0, 26)}…` : raw;
	return (
		<button
			type="button"
			onClick={onExpand}
			className="flex items-center gap-2 bg-white rounded-full px-3.5 py-2 shadow-lg shadow-slate-200/70 border border-slate-200/80 hover:shadow-xl transition-shadow cursor-pointer"
			aria-label="Expand progress"
		>
			<i className="fas fa-circle-notch fa-spin text-blue-500 text-[11px]" aria-hidden="true" />
			<span className="text-[12px] font-medium text-slate-600 max-w-[150px] truncate">
				{label || '…'}
			</span>
			<i className="fas fa-chevron-up text-slate-400 text-[9px]" aria-hidden="true" />
		</button>
	);
}

// ── Full toast card ───────────────────────────────────────────────────────────
function ToastCard({ toast }: { toast: ToastItem }): React.JSX.Element {
	const { dismissToast } = useToast();
	const [minimized, setMinimized] = useState(false);

	const isProgress = toast.type === 'progress';
	const tokens = TOKENS[toast.type] ?? TOKENS.info;

	if (minimized) {
		return <MinimisedPill toast={toast} onExpand={() => setMinimized(false)} />;
	}

	return (
		<div className="w-72 bg-white rounded-2xl overflow-hidden shadow-xl shadow-slate-200/60 border border-slate-100">
			{/* Body */}
			<div className="px-4 pt-4 pb-3 space-y-3">
				{/* Header */}
				<div className="flex items-start gap-3">
					{/* Icon badge */}
					<div className={`w-8 h-8 rounded-xl ${tokens.bg} flex items-center justify-center flex-shrink-0`}>
						<i className={`fas ${toast.icon ?? tokens.icon} ${tokens.fg} text-sm`} aria-hidden="true" />
					</div>

					{/* Title + action icon */}
					<div className="flex-1 min-w-0 pt-0.5">
						<div className="flex items-center justify-between gap-2">
							<p className="text-[13px] font-semibold text-slate-800 leading-tight">{toast.title}</p>
							{isProgress ? (
								/* Minimise */
								<button
									type="button"
									onClick={() => setMinimized(true)}
									className="w-5 h-5 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center flex-shrink-0 transition-colors cursor-pointer"
									aria-label="Minimise"
								>
									<i className="fas fa-minus text-[8px] text-slate-500" aria-hidden="true" />
								</button>
							) : (
								toast.dismissible && (
									/* Dismiss */
									<button
										type="button"
										onClick={() => dismissToast(toast.id)}
										className="w-5 h-5 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center flex-shrink-0 transition-colors cursor-pointer"
										aria-label="Dismiss"
									>
										<i className="fas fa-xmark text-[8px] text-slate-500" aria-hidden="true" />
									</button>
								)
							)}
						</div>
						{/* Message — non-progress only */}
						{toast.message && !isProgress && (
							<p className="mt-0.5 text-[11px] text-slate-500 leading-relaxed">{toast.message}</p>
						)}
					</div>
				</div>

				{/* Progress bar + label */}
				{isProgress && (
					<div className="space-y-1.5">
						<div className="h-[3px] w-full rounded-full bg-slate-100 overflow-hidden">
							{toast.progress != null ? (
								<div
									className="h-full rounded-full bg-blue-500 transition-all duration-500 ease-out"
									style={{ width: `${toast.progress}%` }}
								/>
							) : (
								<div className="h-full w-full rounded-full bg-blue-400 animate-pulse" />
							)}
						</div>
						<p className="text-[11px] text-slate-400 font-mono tabular-nums leading-none">
							{toast.progressLabel ?? 'Starting…'}
						</p>
					</div>
				)}
			</div>

			{/* Cancel button */}
			{isProgress && toast.onCancel && (
				<div className="px-3 pb-3">
					<button
						type="button"
						onClick={toast.onCancel}
						className="w-full py-2 rounded-xl bg-slate-50 hover:bg-slate-100 active:bg-slate-200 border border-slate-100 text-[12px] font-medium text-slate-500 transition-colors cursor-pointer"
					>
						Cancel
					</button>
				</div>
			)}
		</div>
	);
}

/** Fixed bottom-right stack of active toasts. Place once near the root of the app. */
export default function ToastContainer(): React.JSX.Element | null {
	const { toasts } = useToast();
	if (toasts.length === 0) return null;

	return (
		<div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 items-end pointer-events-none">
			{toasts.map((toast) => (
				<div key={toast.id} className="pointer-events-auto">
					<ToastCard toast={toast} />
				</div>
			))}
		</div>
	);
}
