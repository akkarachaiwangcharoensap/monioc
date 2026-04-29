import { useMemo } from 'react';
import type React from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';

import { useReceiptCache } from '../../context/ReceiptCacheContext';
import { formatBytes } from '../../utils/fileFormatting';
import type { PerImageScanStatusValue } from '../../hooks/receipt-scanner/deriveScanStatuses';

interface EditorThumbnailStripProps {
	loadedReceiptIds: number[];
	selectedReceiptId: number | null;
	previewSrc: string | null;
	queueScanResults: Record<string, { scanId: number; processedImagePath?: string | null }>;
	perImageScanStatus: Record<string, PerImageScanStatusValue>;
	perImageCategorizeStatus: Record<string, 'categorizing'>;
	isScanQueued: Record<string, boolean>;
	fileSizeByPath: Record<string, number | null | undefined>;
	trackedSizePaths: string[];
	/** Stable receipt-id → original-basePath map. After a Re-Scan the DB
	 *  record's imagePath changes to the processed file, but jobKeys,
	 *  queueScanResults and perImageScanStatus are still keyed by the
	 *  *original* basePath registered at init time.  Without this map the
	 *  thumbnail strip would look up a key that no longer exists in the
	 *  status maps after the first rescan. */
	receiptBasePathMap: Record<number, string> | undefined;
	onChipClick: (id: number) => void;
	onRemove: (id: number) => void;
	onAdd: () => void;
}

export default function EditorThumbnailStrip({
	loadedReceiptIds,
	selectedReceiptId,
	previewSrc,
	queueScanResults,
	perImageScanStatus,
	perImageCategorizeStatus,
	isScanQueued,
	fileSizeByPath,
	trackedSizePaths,
	receiptBasePathMap,
	onChipClick,
	onRemove,
	onAdd,
}: EditorThumbnailStripProps): React.ReactElement {
	const { getReceipt } = useReceiptCache();

	const totalSizeBytes = useMemo(() => {
		if (trackedSizePaths.length === 0) return null;
		const sizes = trackedSizePaths.map((p) => fileSizeByPath[p]);
		if (!sizes.every((s) => typeof s === 'number')) return null;
		return sizes.reduce<number>((sum, s) => sum + (s as number), 0);
	}, [trackedSizePaths, fileSizeByPath]);

	return (
		<div className="space-y-3 mb-8">
			{/* Size summary row */}
			<div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
				<div className="inline-flex items-center gap-2">
					<i className="fas fa-receipt text-slate-400" aria-hidden="true" />
					<span className="font-medium text-slate-700">
						{loadedReceiptIds.length} receipt{loadedReceiptIds.length === 1 ? '' : 's'}
					</span>
				</div>
				{totalSizeBytes != null && (
					<span>{formatBytes(totalSizeBytes)}</span>
				)}
			</div>
			{/* Thumbnail strip */}
			<div className="flex gap-2 overflow-x-auto pt-2 pb-2 px-1 -mx-1">
				{loadedReceiptIds.map((id) => {
					const record = getReceipt(id);
					// Use the stable tracking basePath that was registered when the
					// receipt was first opened.  After a Re-Scan the DB record's
					// imagePath changes to the processed file, but all status maps
					// (perImageScanStatus, jobKeys, queueScanResults) are still keyed
					// by the *original* basePath.
					const basePath = receiptBasePathMap?.[id] ?? record?.imagePath ?? null;
					const isActive = id === selectedReceiptId;
					const savedResult = basePath != null ? queueScanResults[basePath] : null;
					const thumbDisplayPath = savedResult?.processedImagePath ?? record?.processedImagePath ?? basePath;
					const thumbSrc = isActive
						? (previewSrc ?? (thumbDisplayPath ? convertFileSrc(thumbDisplayPath) : null))
						: (thumbDisplayPath ? convertFileSrc(thumbDisplayPath) : null);
					const scanStatus = basePath != null ? perImageScanStatus[basePath] : undefined;
					const isCatActive = basePath != null && perImageCategorizeStatus[basePath] === 'categorizing';
					const isQueued = basePath != null && isScanQueued[basePath];
					const displaySize = thumbDisplayPath ? fileSizeByPath[thumbDisplayPath] : undefined;
					return (
						<div key={id} className="relative w-16 h-16 flex-shrink-0 select-none">
							<button
								type="button"
								onClick={() => onChipClick(id)}
								className={`relative w-full h-full rounded-xl overflow-hidden border-2 transition-all cursor-pointer ${isActive
									? 'border-violet-500'
									: 'border-slate-200 hover:border-slate-400'
									}`}
							>
								{thumbSrc ? (
									<img src={thumbSrc} alt="" draggable={false} className="w-full h-full object-cover pointer-events-none" onError={() => undefined} />
								) : (
									<div className="w-full h-full bg-slate-100 flex items-center justify-center">
										<i className="fas fa-receipt text-slate-400 text-base" aria-hidden="true" />
									</div>
								)}
								{scanStatus === 'scanning' && (
									<div className="absolute inset-0 bg-black/50 flex items-center justify-center pointer-events-none">
										<i className="fas fa-spinner fa-spin text-white text-xs" aria-hidden="true" />
									</div>
								)}
								{scanStatus === 'cancelling' && (
									<div className="absolute inset-0 bg-amber-500/50 flex items-center justify-center pointer-events-none">
										<i className="fas fa-ban text-white text-xs" aria-hidden="true" />
									</div>
								)}
								{(isCatActive || scanStatus === 'categorizing') && scanStatus !== 'scanning' && (
									<div className="absolute inset-0 bg-violet-500/50 flex items-center justify-center pointer-events-none">
										<i className="fas fa-spinner fa-spin text-white text-xs" aria-hidden="true" />
									</div>
								)}
								{scanStatus !== 'scanning' && scanStatus !== 'categorizing' && !isCatActive && isQueued && (
									<div className="absolute inset-0 bg-slate-700/60 flex items-center justify-center pointer-events-none">
										<i className="fas fa-clock text-white text-xs" aria-hidden="true" />
									</div>
								)}
								{scanStatus === 'error' && (
									<div className="absolute inset-0 bg-red-500/50 flex items-center justify-center pointer-events-none">
										<i className="fas fa-exclamation text-white text-xs" aria-hidden="true" />
									</div>
								)}
								{typeof displaySize === 'number' && (
									<div className="absolute bottom-1 left-1 right-1 rounded bg-black/55 px-1 py-0.5 text-[9px] text-white text-center truncate pointer-events-none" title={`${displaySize.toLocaleString()} bytes`}>
										{formatBytes(displaySize)}
									</div>
								)}
							</button>
							<button
								type="button"
								aria-label="Remove receipt from editor"
								onClick={(e) => {
									e.stopPropagation();
									onRemove(id);
								}}
								className="absolute -top-1.5 -right-1.5 w-4 h-4 flex items-center justify-center bg-slate-700 hover:bg-red-500 text-white rounded-full text-[9px] transition-colors cursor-pointer"
							>
								<i className="fas fa-times" aria-hidden="true" />
							</button>
						</div>
					);
				})}
				{/* Add more receipts */}
				<button
					type="button"
					aria-label="Add receipt to editor"
					title="Add receipt"
					onClick={onAdd}
					className="w-16 h-16 flex-shrink-0 rounded-xl border-2 border-dashed border-slate-300 hover:border-violet-400 flex items-center justify-center transition-colors cursor-pointer text-slate-400 hover:text-violet-500"
				>
					<i className="fas fa-plus text-base" aria-hidden="true" />
				</button>
			</div>
		</div>
	);
}
