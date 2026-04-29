import type React from 'react';
import { useModelDownload } from '../../hooks/useModelDownload';
import { formatBytes } from '../../utils/fileFormatting';

/**
 * Receipt-page banner shown when AI models are missing or downloading.
 * Returns null when models are ready.
 */
export default function ModelDownloadBanner(): React.ReactElement | null {
	const { checking, modelStatus, downloading, progress, error, handleDownload, handleCancel } = useModelDownload();

	if (checking || !modelStatus) return null;
	if (modelStatus.ocr && modelStatus.llm) return null;

	// ── Downloading in progress ───────────────────────────────────────────
	if (downloading) {
		const pct =
			progress && progress.totalBytes > 0
				? Math.min(100, Math.round((progress.downloadedBytes / progress.totalBytes) * 100))
				: 0;
		const label =
			progress && progress.totalBytes > 0
				? `${formatBytes(progress.downloadedBytes)} of ${formatBytes(progress.totalBytes)} · ${pct}%`
				: 'Starting…';

		return (
			<div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3.5 mb-4">
				<div className="flex items-center gap-3">
					<div className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
						<i className="fas fa-brain text-sm text-blue-500" aria-hidden="true" />
					</div>
					<div className="flex-1 min-w-0 space-y-1.5">
						<p className="text-[13px] font-semibold text-slate-800">Downloading AI Models</p>
						<div className="h-[3px] w-full rounded-full bg-blue-200 overflow-hidden">
							<div
								className="h-full rounded-full bg-blue-500 transition-all duration-300 ease-out"
								style={{ width: `${pct}%` }}
							/>
						</div>
						<p className="text-[11px] text-blue-600 font-mono tabular-nums leading-none">{label}</p>
					</div>
					<button
						type="button"
						onClick={() => void handleCancel()}
						className="flex-shrink-0 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-[12px] font-medium text-slate-500 hover:bg-slate-50 active:bg-slate-100 transition-colors cursor-pointer"
					>
						Cancel
					</button>
				</div>
			</div>
		);
	}

	// ── Models not yet downloaded ─────────────────────────────────────────
	return (
		<div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 mb-4 text-sm">
			<div className="flex items-start gap-3">
				<i className="fas fa-circle-info text-slate-400 mt-0.5 flex-shrink-0" aria-hidden="true" />
				<div className="flex-1 min-w-0">
					<p className="font-semibold text-slate-800">AI models required</p>
					<p className="mt-1 text-slate-600 text-xs leading-relaxed">
						A one-time download (~5.4 GB) is needed before scanning.
					</p>
					{error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
					<div className="mt-3">
						<button
							type="button"
							onClick={() => void handleDownload()}
							className="inline-flex items-center gap-2 rounded-full bg-violet-500 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-600 active:scale-[0.98] transition-all cursor-pointer"
						>
							<i className="fas fa-download text-[11px]" aria-hidden="true" />
							Download Models
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
