import { useState } from 'react';
import type React from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';

import type { ReceiptScanRecord } from '../../types';
import { getReceiptDisplayName } from '../../utils/receipt-scanner/receiptSession';
import { formatMoney } from '../../utils/priceFormatting';

function formatPickerDate(raw: string | null | undefined): string | null {
	if (!raw) return null;
	const d = new Date(raw.replace(' ', 'T'));
	if (Number.isNaN(d.getTime())) return null;
	return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

interface PickerCardProps {
	record: ReceiptScanRecord;
	isSelected: boolean;
	onToggle: () => void;
}

export default function PickerCard({ record, isSelected, onToggle }: PickerCardProps): React.ReactElement {
	const thumbPath = record.processedImagePath ?? record.imagePath;
	const thumbSrc = thumbPath ? convertFileSrc(thumbPath) : null;
	const [thumbFailed, setThumbFailed] = useState(false);
	const label = getReceiptDisplayName(record.displayName, record.imagePath);
	const date = formatPickerDate(record.purchaseDate ?? record.createdAt);
	const total = record.data.rows.reduce((sum, row) => sum + row.price, 0);
	const rowCount = record.data.rows.length;
	return (
		<button
			type="button"
			onClick={onToggle}
			className={`relative w-full text-left rounded-2xl overflow-hidden border-2 transition-all duration-150 ${isSelected
					? 'border-violet-500 ring-2 ring-violet-200 shadow-sm'
					: 'border-slate-200 hover:border-violet-300 hover:shadow-sm cursor-pointer'
				}`}
		>
			<div className="relative bg-slate-100 h-28 flex items-center justify-center overflow-hidden">
				{thumbSrc && !thumbFailed ? (
					<img src={thumbSrc} alt="" className="w-full h-full object-cover" onError={() => setThumbFailed(true)} />
				) : (
					<i className="fas fa-receipt text-3xl text-slate-300" aria-hidden="true" />
				)}
				{isSelected && (
					<div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-violet-600 flex items-center justify-center shadow-sm">
						<i className="fas fa-check text-[8px] text-white" aria-hidden="true" />
					</div>
				)}
			</div>
			<div className="px-3 pt-2.5 pb-3">
				<p className="text-sm font-semibold text-slate-900 truncate leading-tight" title={label}>{label}</p>
				<p className="text-xs text-slate-500 mt-0.5">{date ?? 'No date'}</p>
				<div className="flex items-center justify-between mt-1.5">
					<p className="text-sm font-medium text-slate-800">{formatMoney(total)}</p>
					<p className="text-xs text-slate-400">{rowCount} item{rowCount !== 1 ? 's' : ''}</p>
				</div>
			</div>
		</button>
	);
}
