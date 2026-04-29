import type React from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { formatMoney } from '../../utils';
import type { ReceiptScanRecord } from '../../types';
import NavButton from '../ui/NavButton';

interface MinimalReceiptCardProps {
	record: ReceiptScanRecord;
	displayName: string;
	to?: string;
	tabLabel?: string;
	thumbLoadFailed?: boolean;
	onThumbError?: () => void;
	onClick?: () => void;
}

export default function MinimalReceiptCard({
	record,
	displayName,
	to,
	tabLabel,
	thumbLoadFailed = false,
	onThumbError,
	onClick,
}: MinimalReceiptCardProps): React.ReactElement {
	const primaryThumbPath = record.processedImagePath ?? record.imagePath;
	const thumbPath = thumbLoadFailed ? (record.imagePath ?? null) : primaryThumbPath;
	const thumbSrc = thumbPath ? convertFileSrc(thumbPath) : null;

	const total = record.data.rows.reduce((sum, row) => sum + row.price, 0);
	const itemCount = record.data.rows.length;

	function formatDateTime(raw: string): string {
		const normalized = raw.replace(' ', 'T');
		const d = new Date(normalized);
		if (Number.isNaN(d.getTime())) return raw;
		return d.toLocaleDateString('en-CA', {
			month: 'short',
			day: 'numeric',
			weekday: 'short',
		});
	}

	const inner = (
		<div className="rounded-2xl border border-slate-200/90 bg-white p-3 transition-colors duration-200 hover:border-slate-300 hover:bg-slate-50">
			<div className="flex items-start gap-3">
				{thumbSrc ? (
					<div className="h-12 w-12 overflow-hidden rounded-xl border border-slate-200 bg-white ring-1 ring-slate-100/80 flex-shrink-0">
						<img
							src={thumbSrc}
							alt="Receipt preview"
							draggable={false}
							className="h-full w-full object-contain p-1 select-none"
							onError={onThumbError}
						/>
					</div>
				) : (
					<div className="h-12 w-12 rounded-xl border border-slate-200 bg-slate-100 flex items-center justify-center text-slate-300 flex-shrink-0">
						<i className="fas fa-image text-xs" aria-hidden="true" />
					</div>
				)}

				<div className="min-w-0 flex-1">
					<div className="flex items-start justify-between gap-2">
						<div className="min-w-0 flex-1">
							<p className="truncate text-[13px] font-semibold tracking-[-0.01em] text-slate-900">
								{displayName}
							</p>
							<p className="mt-0.5 text-[11px] text-slate-500">
								{formatDateTime(record.createdAt)}
							</p>
						</div>
						<div className="flex items-center gap-1.5 flex-shrink-0">
							<p className="text-sm font-semibold tabular-nums text-slate-900">
								{formatMoney(total)}
							</p>
							<i
								className="fas fa-chevron-right text-[9px] text-slate-300 transition-colors group-hover:text-slate-500"
								aria-hidden="true"
							/>
						</div>
					</div>

					<div className="mt-2 flex items-center gap-1.5 overflow-hidden">
						<span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600">
							<i className="fas fa-list-ul text-[8px] text-slate-400" aria-hidden="true" />
							{itemCount} {itemCount === 1 ? 'item' : 'items'}
						</span>
					</div>
				</div>
			</div>
		</div>
	);

	if (onClick) {
		return (
			<button
				type="button"
				onClick={onClick}
				className="group relative w-full text-left transition-all duration-200 active:scale-[0.99] cursor-pointer"
			>
				{inner}
			</button>
		);
	}

	return (
		<NavButton
			to={to ?? '/'}
			tabLabel={tabLabel}
			className="group relative w-full text-left transition-all duration-200 active:scale-[0.99]"
		>
			{inner}
		</NavButton>
	);
}
