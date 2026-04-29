import { useState } from 'react';
import type React from 'react';
import type { ImageLibraryEntry } from '../../types';
import type { Task } from '../../context/TaskManagerContext';
import type { CardStatus } from '../../utils/receipt-scanner/cardStatus';
import { getCardStatus, getCardPhaseLabel, getCardProgress } from '../../utils/receipt-scanner/cardStatus';
import { cleanScanError, fileNameFromPath } from '../../utils/receipt-scanner/formatting';

export interface ScannerInboxCardProps {
	entry: ImageLibraryEntry;
	donePhase: Record<string, 'check' | 'exit'>;
	taskForPath: Record<string, Task>;
	perImageScanStatus: Record<string, string | undefined>;
	queueScanResults: Record<string, { errorMsg?: string } | undefined>;
	queueErrors: Record<string, string | undefined> | undefined;
	modelsAbsent: boolean;
	onScan: (path: string) => void;
	onCancel: (path: string, task: Task | undefined) => void;
	onEdit: (entry: ImageLibraryEntry) => void;
	onRevert: (entry: ImageLibraryEntry) => void;
	onRemove: (entry: ImageLibraryEntry) => void;
}

export default function ScannerInboxCard({
	entry,
	donePhase,
	taskForPath,
	perImageScanStatus,
	queueScanResults,
	queueErrors,
	modelsAbsent,
	onScan,
	onCancel,
	onEdit,
	onRevert,
	onRemove,
}: ScannerInboxCardProps): React.ReactElement {
	const path = entry.filePath;
	const isUploading = entry.id < 0;
	const cardStatus: CardStatus = isUploading ? 'idle' : getCardStatus(path, donePhase, taskForPath, perImageScanStatus);
	// Build ordered fallback list: stagingPath → thumbnailPath → original filePath.
	// On load error, advance to the next candidate so stale staging files don't
	// leave the thumbnail blank.
	const thumbCandidates = isUploading
		? []
		: [entry.stagingPath, entry.thumbnailPath, path].filter((p): p is string => p != null);
	// Fingerprint the candidate list so we reset thumbIdx when the entry's
	// staging/thumbnail paths change (e.g. after re-uploading the same image).
	const thumbKey = thumbCandidates.join('\0');
	const [thumbIdx, setThumbIdx] = useState(0);
	const [prevThumbKey, setPrevThumbKey] = useState(thumbKey);
	if (thumbKey !== prevThumbKey) {
		setPrevThumbKey(thumbKey);
		setThumbIdx(0);
	}
	const thumbSrc = thumbCandidates.length > 0 && thumbIdx < thumbCandidates.length
		? ''
		: null;
	const cardErrorMsg = cardStatus === 'error'
		? queueScanResults[path]?.errorMsg ?? queueErrors?.[path]
		: undefined;
	const phaseLabel = getCardPhaseLabel(path, taskForPath);
	const progress = getCardProgress(path, taskForPath);
	const isWorking = cardStatus === 'scanning' || cardStatus === 'categorizing';

	return (
		<div
			role="status"
			className={`flex items-center gap-4 p-4 bg-white rounded-2xl border border-slate-100 shadow-sm transition-all duration-300 ${cardStatus === 'exit' ? 'opacity-0 -translate-y-2 scale-95 pointer-events-none' : 'opacity-100'
				}`}
		>
			{/* Thumbnail */}
			<div className="relative w-16 h-16 rounded-xl overflow-hidden bg-slate-100 ring-1 ring-black/5 flex-shrink-0 flex items-center justify-center">
				{isUploading ? (
					<div className="w-full h-full animate-pulse bg-gradient-to-br from-violet-100 to-slate-200 flex items-center justify-center">
						<i className="fas fa-arrow-up text-violet-400 text-sm animate-bounce" aria-hidden="true" />
					</div>
				) : thumbSrc ? (
					<img
						src={thumbSrc}
						alt=""
						className="w-full h-full object-cover"
						onError={() => {
							// Advance to next fallback candidate; hide if all exhausted.
							setThumbIdx((i) => i + 1);
						}}
					/>
				) : (
					<i className="fas fa-image text-slate-300 text-lg" aria-hidden="true" />
				)}
				{cardStatus === 'check' && (
					<div className="absolute inset-0 bg-emerald-500/85 flex items-center justify-center">
						<i className="fas fa-check text-white text-xl" aria-hidden="true" />
					</div>
				)}
				{(isWorking || cardStatus === 'cancelling') && (
					<div className={`absolute inset-0 backdrop-blur-sm flex items-center justify-center ${isWorking ? 'bg-violet-500/20' : 'bg-slate-500/20'
						}`}>
						<i className="fas fa-spinner fa-spin text-white text-sm drop-shadow" aria-hidden="true" />
					</div>
				)}
				{progress != null && (
					<div className="absolute bottom-0 left-0 right-0 h-0.5 bg-violet-200/60">
						<div
							className="h-full bg-violet-500 rounded-full transition-all duration-300"
							style={{ width: `${progress}%` }}
						/>
					</div>
				)}
			</div>

			{/* Info */}
			<div className="flex-1 min-w-0">
				<p className="text-sm font-semibold text-slate-800 truncate" title={path}>
					{fileNameFromPath(path)}
				</p>
				<div className="mt-1">
					<StatusBadge
						isUploading={isUploading}
						cardStatus={cardStatus}
						phaseLabel={phaseLabel}
						cardErrorMsg={cardErrorMsg}
					/>
				</div>
			</div>

			{/* Actions */}
			<div className="flex items-center gap-2 flex-shrink-0">
				{isUploading && (
					<div className="w-7 h-7 flex items-center justify-center">
						<i className="fas fa-circle-notch fa-spin text-violet-300 text-sm" aria-hidden="true" />
					</div>
				)}
				{!isUploading && cardStatus === 'idle' && (
					<button
						type="button"
						disabled={modelsAbsent}
						onClick={() => onScan(path)}
						className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium bg-violet-50 text-violet-600 hover:bg-violet-100 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
						aria-label="Scan this image"
					>
						<i className="fas fa-search text-[10px]" aria-hidden="true" /> Scan
					</button>
				)}
				{!isUploading && (cardStatus === 'idle' || cardStatus === 'error') && (
					<button
						type="button"
						onClick={() => onEdit(entry)}
						className="inline-flex items-center justify-center w-8 h-8 rounded-full text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-colors cursor-pointer"
						aria-label="Edit image"
						title="Crop & adjust"
					>
						<i className="fas fa-crop-simple text-xs" aria-hidden="true" />
					</button>
				)}
				{!isUploading && entry.stagingPath != null && (cardStatus === 'idle' || cardStatus === 'error') && (
					<button
						type="button"
						onClick={() => onRevert(entry)}
						className="inline-flex items-center justify-center w-8 h-8 rounded-full text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors cursor-pointer"
						aria-label="Revert to original"
						title="Revert to original"
					>
						<i className="fas fa-rotate-left text-xs" aria-hidden="true" />
					</button>
				)}
				{(cardStatus === 'scanning' || cardStatus === 'categorizing') && (
					<button
						type="button"
						onClick={() => onCancel(path, taskForPath[path])}
						className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border border-red-200 text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
						aria-label="Cancel scan"
					>
						<i className="fas fa-xmark text-[10px]" aria-hidden="true" /> Cancel
					</button>
				)}
				{cardStatus === 'error' && (
					<button
						type="button"
						onClick={() => onScan(path)}
						className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium bg-red-50 text-red-500 hover:bg-red-100 transition-colors cursor-pointer"
						aria-label="Retry scan"
					>
						<i className="fas fa-rotate-right text-[10px]" aria-hidden="true" /> Retry
					</button>
				)}
				{!isUploading && (cardStatus === 'idle' || cardStatus === 'error') && (
					<button
						type="button"
						onClick={() => onRemove(entry)}
						className="inline-flex items-center justify-center w-7 h-7 rounded-full text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
						aria-label="Remove from inbox"
					>
						<i className="fas fa-xmark text-xs" aria-hidden="true" />
					</button>
				)}
			</div>
		</div>
	);
}

// ── Status badge sub-component ──────────────────────────────────────────────

function StatusBadge({
	isUploading,
	cardStatus,
	phaseLabel,
	cardErrorMsg,
}: {
	isUploading: boolean;
	cardStatus: CardStatus;
	phaseLabel: string | null;
	cardErrorMsg: string | undefined;
}): React.ReactElement | null {
	if (isUploading) {
		return (
			<span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-500">
				<i className="fas fa-spinner fa-spin text-[10px]" aria-hidden="true" /> Uploading…
			</span>
		);
	}
	switch (cardStatus) {
		case 'idle':
			return (
				<span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-400">
					<i className="fas fa-image text-[10px]" aria-hidden="true" /> Ready
				</span>
			);
		case 'queued':
			return (
				<span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
					<i className="fas fa-clock text-[10px]" aria-hidden="true" /> {phaseLabel ?? 'Queued'}
				</span>
			);
		case 'scanning':
			return (
				<span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-600">
					<i className="fas fa-spinner fa-spin text-[10px]" aria-hidden="true" /> {phaseLabel ?? 'Scanning…'}
				</span>
			);
		case 'categorizing':
			return (
				<span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-600">
					<i className="fas fa-spinner fa-spin text-[10px]" aria-hidden="true" /> {phaseLabel ?? 'Categorizing…'}
				</span>
			);
		case 'cancelling':
			return (
				<span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
					<i className="fas fa-spinner fa-spin text-[10px]" aria-hidden="true" /> Cancelling…
				</span>
			);
		case 'check':
			return (
				<span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-600">
					<i className="fas fa-check text-[10px]" aria-hidden="true" /> Done
				</span>
			);
		case 'error':
			return (
				<span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-500" title={cardErrorMsg}>
					<i className="fas fa-exclamation-circle text-[10px]" aria-hidden="true" />
					{cardErrorMsg ? cleanScanError(cardErrorMsg) : 'Scan failed'}
				</span>
			);
		default:
			return null;
	}
}
