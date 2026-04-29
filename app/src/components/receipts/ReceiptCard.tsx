import type React from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { formatBytes, formatMoney, estimateReceiptDataSizeBytes } from '../../utils';
import type { ReceiptScanRecord } from '../../types';
import ReceiptDateRow from './ReceiptDateRow';

interface ReceiptCardProps {
	record: ReceiptScanRecord;
	displayName: string;
	getCategoryColor: (category: string) => string;
	isSelected: boolean;
	isSelectMode: boolean;
	isRenaming: boolean;
	renameValue: string;
	imageSizeBytes: number | null | undefined;
	thumbLoadFailed: boolean;
	/** When true, shows a brief "Updated" badge (used after a rescan). */
	isUpdated?: boolean;
	onCardClick: () => void;
	onContextMenu?: (e: React.MouseEvent) => void;
	onToggleSelect: (e: React.MouseEvent) => void;
	onRenameStart: (e: React.MouseEvent) => void;
	onRenameChange: (value: string) => void;
	onRenameConfirm: () => void;
	onRenameCancel: () => void;
	onThumbError: () => void;
	onPurchaseDateChange?: (date: string | null) => void;
}

export default function ReceiptCard({
	record,
	displayName,
	getCategoryColor,
	isSelected,
	isSelectMode,
	isRenaming,
	renameValue,
	imageSizeBytes,
	thumbLoadFailed,
	isUpdated = false,
	onCardClick,
	onContextMenu,
	onToggleSelect,
	onRenameStart,
	onRenameChange,
	onRenameConfirm,
	onRenameCancel,
	onThumbError,
	onPurchaseDateChange,
}: ReceiptCardProps): React.ReactElement {
	const primaryThumbPath = record.processedImagePath ?? record.imagePath;
	const thumbPath = thumbLoadFailed ? (record.imagePath ?? null) : primaryThumbPath;
	const thumbSrc = thumbPath ? convertFileSrc(thumbPath) : null;

	const dataSizeBytes = estimateReceiptDataSizeBytes(record.data);
	const totalSizeBytes =
		typeof imageSizeBytes === 'number'
			? imageSizeBytes + dataSizeBytes
			: imageSizeBytes === null
				? dataSizeBytes
				: null;

	const rowCount = record.data.rows.length;
	const estimatedTotal = record.data.rows.reduce((sum, row) => sum + row.price, 0);
	const topCategories = Object.entries(
		record.data.rows.reduce<Record<string, number>>((acc, row) => {
			const category = row.category?.trim() || 'Uncategorized';
			acc[category] = (acc[category] ?? 0) + row.price;
			return acc;
		}, {}),
	)
		.sort((a, b) => b[1] - a[1])
		.slice(0, 3);

	return (
		<div
			onClick={onCardClick}
			onContextMenu={onContextMenu}
			className={`group relative rounded-3xl border p-4 bg-white cursor-pointer transition-colors duration-200 select-none ${isSelected
				? 'border-violet-400 bg-violet-50/70'
				: 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/60'
				}`}
		>
			{/* Updated badge — briefly shown after a successful rescan */}
			{isUpdated && (
				<span className="absolute top-3 right-3 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-semibold tracking-wide z-10 pointer-events-none">
					<i className="fas fa-check text-[8px]" aria-hidden="true" />
					Updated
				</span>
			)}
			{/* Selection checkbox */}
			{isSelectMode && (
				<button
					type="button"
					aria-label={isSelected ? 'Deselect receipt' : 'Select receipt'}
					onClick={onToggleSelect}
					className={`absolute top-3 left-3 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all z-10 cursor-pointer ${isSelected
						? 'border-violet-500 bg-violet-500 text-white'
						: 'border-slate-300 bg-white text-transparent hover:border-slate-400'
						}`}
				>
					<i className="fas fa-check text-[9px]" aria-hidden="true" />
				</button>
			)}

			<div className={`flex items-start gap-4 ${isSelectMode ? 'pl-7' : ''}`}>
				{/* Thumbnail */}
				{thumbSrc ? (
					<div className="w-16 h-20 sm:w-20 sm:h-24 rounded-2xl border border-slate-200 bg-white overflow-hidden flex-shrink-0">
						<img
							src={thumbSrc}
							alt="Receipt preview"
							draggable={false}
							className="w-full h-full object-contain p-1 select-none"
							onError={onThumbError}
						/>
					</div>
				) : (
					<div className="w-16 h-20 sm:w-20 sm:h-24 rounded-2xl border border-slate-200 bg-slate-100 flex items-center justify-center text-slate-300 flex-shrink-0">
						<i className="fas fa-image" aria-hidden="true" />
					</div>
				)}

				{/* Content */}
				<div className="flex-1 min-w-0">
					<div className="flex items-start justify-between gap-2">
						<div className="min-w-0">
							{isRenaming ? (
								<input
									autoFocus
									value={renameValue}
									onChange={(e) => onRenameChange(e.target.value)}
									onBlur={onRenameConfirm}
									onKeyDown={(e) => {
										if (e.key === 'Enter') onRenameConfirm();
										if (e.key === 'Escape') onRenameCancel();
									}}
									onClick={(e) => e.stopPropagation()}
									className="text-sm font-semibold text-slate-800 border-b border-violet-400 outline-none bg-transparent w-48"
								/>
							) : (
								<>
									<div className="flex items-center gap-1.5 min-w-0">
										<p className="text-[15px] font-semibold tracking-[-0.01em] text-slate-900 truncate">
											{displayName}
										</p>
										{!isSelectMode && (
											<button
												type="button"
												aria-label="Rename receipt"
												onClick={onRenameStart}
												className="flex-shrink-0 text-slate-300 hover:text-slate-500 transition-colors cursor-pointer"
											>
												<i className="fas fa-pencil text-[10px]" aria-hidden="true" />
											</button>
										)}
									</div>
									<ReceiptDateRow
										purchaseDate={record.purchaseDate}
										createdAt={record.createdAt}
										onPurchaseDateChange={!isSelectMode ? onPurchaseDateChange : undefined}
										className="mt-1"
									/>
								</>
							)}
						</div>
						<div className="flex items-start gap-2 shrink-0">
							<p className="text-[15px] font-semibold tabular-nums text-slate-900">
								{formatMoney(estimatedTotal)}
							</p>
						</div>
					</div>

					{/* Badges */}
					<div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
						<span className="inline-flex items-center gap-1 rounded-full bg-white border border-slate-200 px-2 py-1 text-slate-600">
							<i className="fas fa-list-ul text-[10px] text-slate-400" aria-hidden="true" />
							{rowCount} item{rowCount === 1 ? '' : 's'}
						</span>
						<span className="inline-flex items-center gap-1 rounded-full bg-slate-100 border border-slate-200 px-2 py-1 text-slate-700">
							<i className="fas fa-hard-drive text-[10px] text-slate-500" aria-hidden="true" />
							{totalSizeBytes == null ? 'Calculating…' : formatBytes(totalSizeBytes)}
						</span>
					</div>

					{/* Top categories preview */}
					<div className="mt-2 flex flex-wrap gap-1.5">
						{topCategories.length > 0 ? (
							topCategories.map(([category, amount], idx) => (
								<span
									key={`${record.id}-${category}-${idx}`}
									className="inline-flex max-w-full items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600"
									title={`${category} (${formatMoney(amount)})`}
								>
									<span
										className="h-2 w-2 rounded-full flex-shrink-0"
										style={{ backgroundColor: getCategoryColor(category) }}
										aria-hidden="true"
									/>
									<span className="truncate max-w-32">{category}</span>
									<span className="text-slate-500">{formatMoney(amount)}</span>
								</span>
							))
						) : (
							<span className="text-[11px] text-slate-400">No categorized items</span>
						)}
					</div>
				</div>

				<i
					className="fas fa-chevron-right text-slate-300 group-hover:text-slate-500 transition-colors self-center flex-shrink-0 text-xs"
					aria-hidden="true"
				/>
			</div>
		</div>
	);
}
