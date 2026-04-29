import { useEffect, useState, useCallback } from 'react';
import type React from 'react';
import { TauriApi, type StorageInfo } from '../services/api';
import { parseTauriError } from '../services/errors';
import { confirm as confirmDialog } from '@tauri-apps/plugin-dialog';
import { formatBytes } from '../utils';
import { useModelDownload } from '../hooks/useModelDownload';
import { useReceiptCache } from '../context/ReceiptCacheContext';


export default function SettingsPage(): React.ReactElement {
	// ── Storage ──────────────────────────────────────────────────────────
	const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
	const [storageLoading, setStorageLoading] = useState(false);
	const [storageMsg, setStorageMsg] = useState<{ text: string; kind: 'info' | 'error' } | null>(null);

	const loadStorageInfo = useCallback(async () => {
		setStorageLoading(true);
		try {
			const info = await TauriApi.getStorageInfo();
			setStorageInfo(info);
		} finally {
			setStorageLoading(false);
		}
	}, []);

	useEffect(() => {
		void loadStorageInfo();
	}, [loadStorageInfo]);

	// ── AI Models ─────────────────────────────────────────────────────────
	const {
		checking: modelChecking,
		modelStatus,
		downloading,
		progress: downloadProgress,
		removing: modelRemoving,
		error: modelError,
		handleDownload,
		handleRemove,
	} = useModelDownload();

	const allModelsReady = modelStatus?.ocr && modelStatus?.llm;

	// Actual on-disk model size (models live outside app_data_dir in system caches).
	const [modelDiskBytes, setModelDiskBytes] = useState<number | null>(null);

	const loadModelDiskSize = useCallback(async () => {
		try {
			const p = await TauriApi.modelDownloadProgress();
			setModelDiskBytes(p.downloadedBytes);
		} catch {
			// Non-fatal — size stays null
		}
	}, []);

	// Reload storage info (and model size) after model operations complete
	useEffect(() => {
		if (!downloading && !modelRemoving && modelStatus != null) {
			void loadStorageInfo();
			if (modelStatus.ocr && modelStatus.llm) {
				void loadModelDiskSize();
			} else {
				setModelDiskBytes(null);
			}
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [downloading, modelRemoving]);

	// Load model disk size once models are confirmed ready on mount
	useEffect(() => {
		if (allModelsReady) void loadModelDiskSize();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// ── Cache / subscription ──────────────────────────────────────────────
	// These must be declared before any useCallback that references them.
	const { forceReload } = useReceiptCache();

	// ── Per-item storage actions ──────────────────────────────────────────
	const handleClearReceiptFiles = useCallback(async () => {
		const ok = await confirmDialog(
			'Remove all receipt images and temporary scan files? Database records (items, dates, names) are kept — only the files are deleted. This cannot be undone.',
			{ title: 'Clear Receipt Files', kind: 'warning' },
		);
		if (!ok) return;
		try {
			await TauriApi.removeReceiptImages();
			await TauriApi.clearReceiptStaging();
			setStorageMsg({ text: 'Receipt files cleared.', kind: 'info' });
			await loadStorageInfo();
		} catch (err) {
			setStorageMsg({ text: parseTauriError(err), kind: 'error' });
		}
	}, [loadStorageInfo]);

	const handleRemoveAll = useCallback(async () => {
		const ok = await confirmDialog(
			'Remove all app data? This will delete all scanned receipt images, downloaded AI models, and all receipt records. This cannot be undone.',
			{ title: 'Remove All App Data', kind: 'warning' },
		);
		if (!ok) return;
		try {
			await TauriApi.removeAllAppData();
			// Clear all persisted UI state so the app starts fully fresh
			localStorage.clear();
			// Reload the window to reset all in-memory React state
			window.location.reload();
		} catch (err) {
			setStorageMsg({ text: parseTauriError(err), kind: 'error' });
		}
	}, []);

	const handleOpenFolder = useCallback(async () => {
		try {
			await TauriApi.openAppDataDir();
		} catch (err) {
			setStorageMsg({ text: parseTauriError(err), kind: 'error' });
		}
	}, []);

	// ── Cache refresh ─────────────────────────────────────────────────────
	const [cacheRefreshing, setCacheRefreshing] = useState(false);

	const handleRefreshCache = useCallback(async () => {
		setCacheRefreshing(true);
		try {
			await forceReload();
			setStorageMsg({ text: 'Cache refreshed successfully.', kind: 'info' });
		} catch (err) {
			setStorageMsg({ text: parseTauriError(err), kind: 'error' });
		} finally {
			setCacheRefreshing(false);
		}
	}, [forceReload]);

	return (
		<div className="min-h-screen bg-white">
			<main className="container mx-auto px-4 pt-8 pb-20 max-w-3xl">
				<div className="mb-8">
					<h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Settings</h1>
					<p className="text-slate-500 mt-1 text-base">Storage and AI model management.</p>
				</div>

				{/* ── AI Models section ────────────────────────────────────────── */}
				<section className="rounded-2xl border border-slate-200 bg-white p-5">
					<div className="flex items-start justify-between gap-4">
						<div className="flex items-start gap-3">
							<div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0 mt-0.5">
								<i className="fas fa-brain text-sm text-blue-500" aria-hidden="true" />
							</div>
							<div>
								<p className="text-sm font-semibold text-slate-800">AI Models</p>
								<p className="text-xs text-slate-500 mt-0.5">
									{modelChecking
										? 'Checking…'
										: downloading
											? 'Downloading…'
											: allModelsReady
												? `Ready · ${modelDiskBytes != null ? formatBytes(modelDiskBytes) : '~5.4 GB'}`
												: 'Not downloaded · ~5.4 GB required'}
								</p>
								{modelError && !downloading && (
									<p className="text-xs text-red-500 mt-1">{modelError}</p>
								)}
							</div>
						</div>

						<div className="flex items-center gap-2 flex-shrink-0">
							{!modelChecking && !allModelsReady && (
								<button
									type="button"
									onClick={() => void handleDownload()}
									disabled={downloading}
									className="inline-flex items-center gap-1.5 rounded-full bg-blue-500 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-600 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
								>
									<i className="fas fa-download text-[10px]" aria-hidden="true" />
									Download
								</button>
							)}
							{!modelChecking && allModelsReady && (
								<button
									type="button"
									onClick={() => void handleRemove()}
									disabled={modelRemoving}
									className="inline-flex items-center gap-1.5 rounded-full border border-red-200 px-4 py-2 text-xs font-medium text-red-600 hover:bg-red-50 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
								>
									{modelRemoving ? (
										<i className="fas fa-circle-notch fa-spin text-[10px]" aria-hidden="true" />
									) : (
										<i className="fas fa-trash-alt text-[10px]" aria-hidden="true" />
									)}
									{modelRemoving ? 'Removing…' : 'Remove'}
								</button>
							)}
						</div>
					</div>

					{/* Download progress bar */}
					{downloading && (
						<div className="mt-3 space-y-1.5">
							<div className="h-[3px] w-full rounded-full bg-slate-100 overflow-hidden">
								<div
									className="h-full rounded-full bg-blue-500 transition-all duration-300 ease-out"
									style={{
										width: `${downloadProgress && downloadProgress.totalBytes > 0
												? Math.min(100, Math.round((downloadProgress.downloadedBytes / downloadProgress.totalBytes) * 100))
												: 0
											}%`,
									}}
								/>
							</div>
							<p className="text-[11px] text-slate-400 font-mono tabular-nums leading-none">
								{downloadProgress && downloadProgress.totalBytes > 0
									? `${formatBytes(downloadProgress.downloadedBytes)} of ${formatBytes(downloadProgress.totalBytes)} · ${Math.min(100, Math.round((downloadProgress.downloadedBytes / downloadProgress.totalBytes) * 100))}%`
									: 'Starting…'}
							</p>
						</div>
					)}

					{/* Status indicator dot */}
					{!modelChecking && !downloading && (
						<div className="mt-3 flex items-center gap-1.5">
							<span
								className={`inline-block w-2 h-2 rounded-full ${allModelsReady ? 'bg-emerald-400' : 'bg-amber-400'}`}
							/>
							<span className={`text-xs ${allModelsReady ? 'text-emerald-700' : 'text-amber-700'}`}>
								{allModelsReady ? 'Ready to scan receipts' : 'Download required before scanning'}
							</span>
						</div>
					)}
				</section>

				{/* ── Storage section ──────────────────────────────────────────── */}
				<section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
					<div className="flex items-center justify-between">
						<h2 className="text-base font-semibold text-slate-800">Storage</h2>
						<button
							onClick={() => void loadStorageInfo()}
							disabled={storageLoading}
							className="text-xs text-slate-500 hover:text-slate-700 disabled:opacity-50 transition-colors cursor-pointer"
						>
							<i className="fas fa-sync-alt mr-1" aria-hidden="true" />
							Refresh
						</button>
					</div>

					{storageMsg && (
						<div
							className={`px-3 py-2 rounded-xl text-xs border ${storageMsg.kind === 'error'
									? 'bg-red-50 border-red-200 text-red-700'
									: 'bg-green-50 border-green-200 text-green-700'
								}`}
						>
							{storageMsg.text}
							<button onClick={() => setStorageMsg(null)} className="ml-2 underline cursor-pointer">
								Dismiss
							</button>
						</div>
					)}

					{storageLoading && !storageInfo ? (
						<div className="animate-pulse space-y-2">
							<div className="h-3 w-48 bg-slate-200 rounded" />
							<div className="h-3 w-64 bg-slate-100 rounded" />
						</div>
					) : storageInfo ? (
						<div className="space-y-3">
							{/* Summary tiles */}
							<div className="grid grid-cols-2 gap-3">
								<div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3 text-center">
									<p className="text-2xl font-semibold text-slate-800">{storageInfo.fileCount}</p>
									<p className="text-xs text-slate-500 mt-0.5">Files</p>
								</div>
								<div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3 text-center">
									<p className="text-2xl font-semibold text-slate-800">{formatBytes(storageInfo.totalSizeBytes)}</p>
									<p className="text-xs text-slate-500 mt-0.5">Total size</p>
								</div>
							</div>

							{/* ── Breakdown with per-row actions ───────────────────── */}
							<div className="rounded-xl bg-slate-50 border border-slate-100 divide-y divide-slate-100">
								{/* Database */}
								<div className="flex items-center justify-between px-4 py-2.5">
									<span className="flex items-center gap-2 text-xs text-slate-600">
										<i className="fas fa-database w-3 text-slate-400" aria-hidden="true" />
										Database
									</span>
									<span className="text-xs font-medium text-slate-700 tabular-nums">
										{formatBytes(storageInfo.dbSizeBytes ?? 0)}
									</span>
								</div>

								{/* Receipt files (images + staging) — clearable */}
								<div className="flex items-center justify-between px-4 py-2.5 gap-3">
									<span className="flex items-center gap-2 text-xs text-slate-600">
										<i className="fas fa-image w-3 text-slate-400" aria-hidden="true" />
										Receipt files
										<span className="relative group">
											<i className="fas fa-circle-info text-[10px] text-slate-300 cursor-help" aria-hidden="true" />
											<span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-48 rounded-lg bg-slate-800 px-3 py-2 text-[11px] leading-relaxed text-white shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-50">
												Includes saved receipt images and temporary files created during scanning.
											</span>
										</span>
									</span>
									<div className="flex items-center gap-3">
										<span className="text-xs font-medium text-slate-700 tabular-nums">
											{formatBytes((storageInfo.receiptImagesBytes ?? 0) + (storageInfo.stagingBytes ?? 0))}
										</span>
										{((storageInfo.receiptImagesBytes ?? 0) + (storageInfo.stagingBytes ?? 0)) > 0 && (
											<button
												type="button"
												onClick={() => void handleClearReceiptFiles()}
												className="text-xs text-red-500 hover:text-red-700 transition-colors cursor-pointer"
											>
												Clear
											</button>
										)}
									</div>
								</div>

								{/* AI Models — managed in section above */}
								<div className="flex items-center justify-between px-4 py-2.5">
									<span className="flex items-center gap-2 text-xs text-slate-600">
										<i className="fas fa-brain w-3 text-slate-400" aria-hidden="true" />
										AI Models
									</span>
									<span className="text-xs font-medium text-slate-700 tabular-nums">
										{modelDiskBytes != null ? formatBytes(modelDiskBytes) : '—'}
									</span>
								</div>
							</div>

							{/* Location */}
							<div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
								<p className="text-xs font-medium text-slate-600 mb-1">Location</p>
								<p className="text-xs text-slate-500 break-all font-mono">{storageInfo.appDataDir}</p>
							</div>

							{/* Actions */}
							<div className="flex flex-wrap gap-2 pt-1">
								<button
									type="button"
									onClick={() => void handleOpenFolder()}
									className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-slate-300 text-sm text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
								>
									<i className="fas fa-folder-open text-xs" aria-hidden="true" />
									Open Folder
								</button>
								<button
									type="button"
									onClick={() => void handleRefreshCache()}
									disabled={cacheRefreshing}
									className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-violet-200 text-sm text-violet-700 hover:bg-violet-50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
								>
									<i className={`fas fa-rotate-right text-xs${cacheRefreshing ? ' animate-spin' : ''}`} aria-hidden="true" />
									{cacheRefreshing ? 'Refreshing…' : 'Refresh Cache'}
								</button>
								<button
									type="button"
									onClick={() => void handleRemoveAll()}
									className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-red-200 text-sm text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
								>
									<i className="fas fa-trash-alt text-xs" aria-hidden="true" />
									Remove All
								</button>
							</div>
						</div>
					) : null}
				</section>
			</main>
		</div>
	);
}
