import { useState, useMemo, useCallback } from 'react';
import type React from 'react';

import type { ReceiptScanRecord } from '../../types';
import { getReceiptDisplayName } from '../../utils/receipt-scanner/receiptSession';
import PickerCard from './PickerCard';

interface ReceiptPickerGridProps {
	receipts: ReceiptScanRecord[];
	cacheInitialLoading: boolean;
	onOpen: (ids: number[]) => void;
}

export default function ReceiptPickerGrid({
	receipts,
	cacheInitialLoading,
	onOpen,
}: ReceiptPickerGridProps): React.ReactElement {
	const [pickerQuery, setPickerQuery] = useState('');
	const [pickerSelected, setPickerSelected] = useState<Set<number>>(new Set());

	const filteredPickerReceipts = useMemo(() => {
		const q = pickerQuery.trim().toLowerCase();
		if (!q) return receipts;
		return receipts.filter((r) => {
			const name = getReceiptDisplayName(r.displayName, r.imagePath).toLowerCase();
			return name.includes(q) || String(r.id).includes(q);
		});
	}, [receipts, pickerQuery]);

	const handleOpen = useCallback(() => {
		onOpen(Array.from(pickerSelected));
		setPickerSelected(new Set());
	}, [pickerSelected, onOpen]);

	if (cacheInitialLoading) {
		return (
			<div className="space-y-3 py-4">
				{[...Array(4)].map((_, i) => (
					<div key={i} className="h-20 rounded-2xl bg-slate-100 animate-pulse" />
				))}
			</div>
		);
	}

	if (receipts.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center py-20 text-slate-400">
				<div className="inline-flex items-center justify-center w-16 h-16 bg-slate-100 rounded-2xl mb-4">
					<i className="fas fa-receipt text-2xl text-slate-400" aria-hidden="true" />
				</div>
				<p className="text-sm font-medium text-slate-700">No receipts yet</p>
				<p className="text-xs text-slate-400 mt-1">Go to New Scan to scan your first receipt.</p>
			</div>
		);
	}

	return (
		<div className="space-y-5">
			{/* Intro */}
			<div className="flex items-center justify-between">
				<p className="text-sm text-slate-500">
					Select receipts to open in the editor.
				</p>
				{pickerSelected.size > 0 && (
					<span className="text-xs text-violet-600 font-medium">
						{pickerSelected.size} selected
					</span>
				)}
			</div>

			{/* Search bar */}
			<div className="relative">
				<i className="fas fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs" aria-hidden="true" />
				<input
					type="search"
					placeholder="Search receipts…"
					value={pickerQuery}
					onChange={(e) => setPickerQuery(e.target.value)}
					className="w-full pl-8 pr-3 py-2.5 text-sm rounded-2xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-violet-400"
				/>
			</div>

			{/* Receipt grid */}
			{filteredPickerReceipts.length === 0 ? (
				<p className="text-sm text-slate-400 py-8 text-center">No receipts found.</p>
			) : (
				<div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
					{filteredPickerReceipts.map((record) => (
						<PickerCard
							key={record.id}
							record={record}
							isSelected={pickerSelected.has(record.id)}
							onToggle={() => {
								setPickerSelected((prev) => {
									const next = new Set(prev);
									if (next.has(record.id)) next.delete(record.id);
									else next.add(record.id);
									return next;
								});
							}}
						/>
					))}
				</div>
			)}

			{/* Open button */}
			{pickerSelected.size > 0 && (
				<div className="sticky bottom-4 flex justify-end">
					<button
						type="button"
						onClick={handleOpen}
						className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 active:scale-[0.98] shadow-lg shadow-violet-200 transition-all cursor-pointer"
					>
						<i className="fas fa-file-lines" aria-hidden="true" />
						Open {pickerSelected.size} receipt{pickerSelected.size !== 1 ? 's' : ''} in Editor
					</button>
				</div>
			)}
		</div>
	);
}
