import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type React from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { useReceiptCache } from '../../context/ReceiptCacheContext';
import { useTabContext } from '../../context/TabContext';
import { getReceiptDisplayName } from '../../utils/receipt-scanner/receiptSession';
import { formatMoney } from '../../utils/priceFormatting';
import type { ReceiptScanRecord } from '../../types';

interface Props {
	loadedReceiptIds: number[];
	onClose: () => void;
}

function formatShortDate(raw: string | null | undefined): string | null {
	if (!raw) return null;
	const d = new Date(raw.replace(' ', 'T'));
	if (Number.isNaN(d.getTime())) return null;
	return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

interface CardProps {
	record: ReceiptScanRecord;
	isLoaded: boolean;
	isSelected: boolean;
	onToggle: () => void;
}

function ReceiptPickCard({ record, isLoaded, isSelected, onToggle }: CardProps): React.ReactElement {
	const thumbPath = record.processedImagePath ?? record.imagePath;
	const thumbSrc = thumbPath ? convertFileSrc(thumbPath) : null;
	const [thumbFailed, setThumbFailed] = useState(false);

	const label = getReceiptDisplayName(record.displayName, record.imagePath);
	const date = formatShortDate(record.purchaseDate ?? record.createdAt);
	const total = record.data.rows.reduce((sum, row) => sum + row.price, 0);
	const rowCount = record.data.rows.length;

	return (
		<button
			type="button"
			disabled={isLoaded}
			onClick={onToggle}
			className={`relative w-full text-left rounded-2xl overflow-hidden border-2 transition-all duration-150 ${
				isSelected
					? 'border-violet-500 ring-2 ring-violet-200 shadow-sm'
					: isLoaded
						? 'border-slate-200 opacity-50 cursor-default'
						: 'border-slate-200 hover:border-violet-300 hover:shadow-sm cursor-pointer'
			}`}
		>
			{/* Thumbnail */}
			<div className="relative bg-slate-100 h-28 flex items-center justify-center overflow-hidden">
				{thumbSrc && !thumbFailed ? (
					<img
						src={thumbSrc}
						alt=""
						className="w-full h-full object-cover"
						onError={() => setThumbFailed(true)}
					/>
				) : (
					<i className="fas fa-receipt text-3xl text-slate-300" aria-hidden="true" />
				)}

				{/* "In Editor" overlay */}
				{isLoaded && (
					<div className="absolute inset-0 bg-black/30 flex items-end justify-start p-2">
						<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-600 text-white text-[10px] font-semibold">
							<i className="fas fa-check text-[8px]" aria-hidden="true" />
							In Editor
						</span>
					</div>
				)}

				{/* Selection checkmark */}
				{isSelected && !isLoaded && (
					<div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-violet-600 flex items-center justify-center shadow-sm">
						<i className="fas fa-check text-[8px] text-white" aria-hidden="true" />
					</div>
				)}
			</div>

			{/* Info */}
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

export default function AddReceiptModal({ loadedReceiptIds, onClose }: Props): React.ReactElement {
	const { receipts } = useReceiptCache();
	const { openReceiptEditorTab } = useTabContext();
	const [query, setQuery] = useState('');
	const [selected, setSelected] = useState<Set<number>>(new Set());
	const searchRef = useRef<HTMLInputElement>(null);

	// Focus search on open
	useEffect(() => {
		searchRef.current?.focus();
	}, []);

	// Close on Escape
	useEffect(() => {
		const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
		document.addEventListener('keydown', handler);
		return () => document.removeEventListener('keydown', handler);
	}, [onClose]);

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		if (!q) return receipts;
		return receipts.filter((r) => {
			const name = getReceiptDisplayName(r.displayName, r.imagePath).toLowerCase();
			return name.includes(q) || String(r.id).includes(q);
		});
	}, [receipts, query]);

	const toggleSelect = useCallback((id: number) => {
		if (loadedReceiptIds.includes(id)) return; // already loaded, can't toggle
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}, [loadedReceiptIds]);

	const handleAdd = useCallback(() => {
		if (selected.size === 0) return;
		openReceiptEditorTab(Array.from(selected));
		onClose();
	}, [selected, openReceiptEditorTab, onClose]);

	return createPortal(
		<>
			{/* Backdrop */}
			<div
				className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px]"
				onClick={onClose}
				aria-hidden="true"
			/>

			{/* Dialog */}
			<div
				role="dialog"
				aria-modal="true"
				aria-label="Add Receipt to Editor"
				className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
			>
				<div
					className="pointer-events-auto w-full max-w-2xl bg-white rounded-2xl shadow-2xl flex flex-col max-h-[80vh]"
					onClick={(e) => e.stopPropagation()}
				>
					{/* Header */}
					<div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100 flex-shrink-0">
						<h2 className="text-base font-semibold text-slate-900">Add to Editor</h2>
						<button
							type="button"
							onClick={onClose}
							className="inline-flex items-center justify-center w-7 h-7 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
							aria-label="Close"
						>
							<i className="fas fa-xmark text-sm" aria-hidden="true" />
						</button>
					</div>

					{/* Search */}
					<div className="px-4 pt-3 pb-2 flex-shrink-0">
						<div className="relative">
							<i className="fas fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs" aria-hidden="true" />
							<input
								ref={searchRef}
								type="search"
								placeholder="Search receipts…"
								value={query}
								onChange={(e) => setQuery(e.target.value)}
								className="w-full pl-8 pr-3 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-violet-400"
							/>
						</div>
					</div>

					{/* Receipt grid */}
					<div className="flex-1 overflow-y-auto px-4 pb-3">
						{filtered.length === 0 ? (
							<p className="text-sm text-slate-400 py-8 text-center">No receipts found.</p>
						) : (
							<div className="grid grid-cols-2 gap-3 py-1">
								{filtered.map((record) => (
									<ReceiptPickCard
										key={record.id}
										record={record}
										isLoaded={loadedReceiptIds.includes(record.id)}
										isSelected={selected.has(record.id)}
										onToggle={() => toggleSelect(record.id)}
									/>
								))}
							</div>
						)}
					</div>

					{/* Footer */}
					<div className="px-5 py-4 border-t border-slate-100 flex items-center justify-between gap-3 flex-shrink-0">
						<span className="text-xs text-slate-500">
							{selected.size > 0
								? `${selected.size} receipt${selected.size !== 1 ? 's' : ''} selected`
								: 'Select receipts to add'}
						</span>
						<div className="flex gap-2">
							<button
								type="button"
								onClick={onClose}
								className="px-4 py-2 text-sm font-medium rounded-full border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
							>
								Cancel
							</button>
							<button
								type="button"
								disabled={selected.size === 0}
								onClick={handleAdd}
								className="px-4 py-2 text-sm font-medium rounded-full bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40 transition-colors cursor-pointer disabled:cursor-not-allowed"
							>
								Add to Editor
							</button>
						</div>
					</div>
				</div>
			</div>
		</>,
		document.body,
	);
}
