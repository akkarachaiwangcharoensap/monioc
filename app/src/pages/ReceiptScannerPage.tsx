import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import type React from 'react';
import { open as openFilePicker } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';
import { SUPPORTED_IMAGE_EXTENSIONS } from '../constants';
import ImageCropEditor from '../components/receipt-scanner/ImageCropEditor';
import ModelDownloadBanner from '../components/receipt-scanner/ModelDownloadBanner';
import { useModelDownload } from '../hooks/useModelDownload';
import { useTabContext } from '../context/TabContext';
import { useTabMemory } from '../context/TabMemoryContext';
import { useAppEvents } from '../hooks/useAppEvents';
import { useScanReceipt } from '../hooks/receipt-scanner/useScanReceipt';
import { useTauriDragDrop } from '../hooks/receipt-scanner/useTauriDragDrop';
import { shouldAcceptDragEnter } from '../utils/receipt-scanner/queueUtils';
import { useCategoriesContext as useCategories } from '../context/CategoriesContext';
import { useTaskManager, type Task } from '../context/TaskManagerContext';
import { useImageLibrary } from '../context/ImageLibraryContext';
import ScannerInboxCard from '../components/receipt-scanner/ScannerInboxCard';

// ── Page ──────────────────────────────────────────────────────────────────────────────

export default function ReceiptScannerPage(): React.ReactElement {
	const tabId = '/receipt-scanner/new';
	const { openReceiptEditorTab, registerCloseInterceptor } = useTabContext();
	const { getTabMemory, setTabMemory } = useTabMemory();

	// ── Model checks ─────────────────────────────────────────────────────────────────
	const { categories } = useCategories();
	const { allModelsReady, checking: modelChecking } = useModelDownload();
	const modelsAbsent = !modelChecking && !allModelsReady;

	// ── Image library (persistent, tab-independent) ──────────────────────────────────
	const {
		images: libraryImages,
		isLoading: libraryLoading,
		addImages: addToLibrary,
		removeImage: removeFromLibrary,
		linkToReceipt,
		updateStaging,
	} = useImageLibrary();

	// Inbox = library images not yet linked to a receipt.
	const inboxImages = useMemo(
		() => libraryImages.filter((e) => e.receiptId == null),
		[libraryImages],
	);

	// ── Scan hook (triggering scans and tracking scan status) ─────────────────────────
	const {
		queueScanResults,
		queueWarningMsg,
		isEditorOpen,
		editorSrc,
		editorPath,
		perImageScanStatus,
		isScanQueued,
		handleEditorApply,
		handleEditorCancel,
		scan,
		cancelActiveScan,
		reset,
		addImagesToQueue,
		removeFromQueue,
	} = useScanReceipt(tabId, categories);

	// ── Task manager (rich per-card status + cancel) ──────────────────────────────────────
	const { tasks, cancelTask } = useTaskManager();

	// ── Done animation state ───────────────────────────────────────────────────────────────
	const [donePhase, setDonePhase] = useState<Record<string, 'check' | 'exit'>>({});
	// Initialize from TabMemory so the "All Done" CTA survives unmount/remount.
	const [completedReceiptIds, setCompletedReceiptIds] = useState<number[]>(
		() => getTabMemory(tabId).completedScanIds ?? [],
	);
	const doneAnimatedRef = useRef(new Set<string>());
	const timerIdsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

	// ── Standalone image editor state ─────────────────────────────────────────────────────
	const [editingEntry, setEditingEntry] = useState<{ id: number; src: string; path: string } | null>(null);

	// Track images that were already 'done' at mount time.  These finished
	// while the page was unmounted and should be linked immediately (no replay animation).
	const mountDonePathsRef = useRef<Set<string> | null>(null);
	if (mountDonePathsRef.current === null) {
		mountDonePathsRef.current = new Set(
			inboxImages
				.map((e) => e.filePath)
				.filter((p) =>
					perImageScanStatus[p] === 'done' ||
					(queueScanResults[p] != null && !queueScanResults[p]?.errorMsg),
				),
		);
	}

	// Cleanup timers on unmount
	useEffect(() => {
		return () => {
			for (const id of timerIdsRef.current) clearTimeout(id);
		};
	}, []);

	// When the tab is explicitly CLOSED (× button), reset all scanner state.
	useEffect(() => {
		return registerCloseInterceptor(tabId, () => {
			for (const id of timerIdsRef.current) clearTimeout(id);
			timerIdsRef.current = [];
			setDonePhase({});
			setCompletedReceiptIds([]);
			doneAnimatedRef.current.clear();
			reset();
		});
	}, [registerCloseInterceptor, tabId, reset]);

	// ── Done detection: animate + link to receipt + remove from inbox ─────────────────
	useEffect(() => {
		for (const entry of inboxImages) {
			// Skip in-flight uploads: their DB entry doesn't exist yet, so
			// linkToReceipt(entry.id, scanId) would silently fail.
			if (entry.id < 0) continue;
			const path = entry.filePath;
			if (perImageScanStatus[path] !== 'done') continue;
			if (doneAnimatedRef.current.has(path)) continue;
			doneAnimatedRef.current.add(path);

			const scanId = queueScanResults[path]?.scanId ?? null;
			if (scanId != null) {
				setCompletedReceiptIds((ids) => (ids.includes(scanId) ? ids : [...ids, scanId]));
				// Persist to TabMemory so the CTA survives remount.
				setTabMemory(tabId, (prev) => ({
					...prev,
					completedScanIds: [...(prev.completedScanIds ?? []).filter((id) => id !== scanId), scanId],
				}));
				// Link the library entry to the receipt so it leaves the inbox.
				void linkToReceipt(entry.id, scanId);
			}

			// Images that finished while the page was unmounted: skip animation.
			if (mountDonePathsRef.current?.has(path)) {
				mountDonePathsRef.current.delete(path);
				// Also evict from legacy queue for dual-write compatibility.
				removeFromQueue(path);
				continue;
			}

			setDonePhase((prev) => ({ ...prev, [path]: 'check' }));
			const t1 = setTimeout(() => {
				setDonePhase((prev) => ({ ...prev, [path]: 'exit' }));
				const t2 = setTimeout(() => {
					removeFromQueue(path);
					setDonePhase((prev) => { const n = { ...prev }; delete n[path]; return n; });
				}, 400);
				timerIdsRef.current.push(t2);
			}, 200);
			timerIdsRef.current.push(t1);
		}
	}, [inboxImages, perImageScanStatus, queueScanResults, removeFromQueue, linkToReceipt, setTabMemory, tabId]);

	// ── Receipt deletion: evict deleted receipt from inbox ─────────────────────────────────
	const onReceiptDeleted = useCallback(
		({ id }: { id: number }) => {
			// Check if any inbox image was linked (shouldn't be, but be safe).
			const matchedEntry = inboxImages.find((e) => queueScanResults[e.filePath]?.scanId === id);
			if (!matchedEntry) return;
			void removeFromLibrary(matchedEntry.id);
			removeFromQueue(matchedEntry.filePath);
		},
		[inboxImages, queueScanResults, removeFromLibrary, removeFromQueue],
	);
	useAppEvents({ onReceiptDeleted });

	// ── Drag-and-drop ─────────────────────────────────────────────────────────────────────────────
	const handleDrop = useCallback(
		(paths: string[]) => {
			void addToLibrary(paths);
			void addImagesToQueue(paths, false, { noAutoScan: true });
		},
		[addToLibrary, addImagesToQueue],
	);

	const isDragOver = useTauriDragDrop(handleDrop, shouldAcceptDragEnter);

	// ── Pick images via file dialog ─────────────────────────────────────────────────────────
	const pickImages = useCallback(async () => {
		const selected = await openFilePicker({
			multiple: true,
			filters: [{ name: 'Images', extensions: [...SUPPORTED_IMAGE_EXTENSIONS] }],
		});
		if (!selected) return;
		const paths = Array.isArray(selected) ? selected : [selected];
		void addToLibrary(paths);
		void addImagesToQueue(paths, false, { noAutoScan: true });
	}, [addToLibrary, addImagesToQueue]);

	// ── Scan all inbox images ────────────────────────────────────────────────────────────────
	const handleScanAll = useCallback(() => {
		for (const entry of inboxImages) {
			// Skip in-flight uploads — their library entry doesn't exist in the DB
			// yet, so the scan result can't be linked to a receipt.
			if (entry.id < 0) continue;
			const path = entry.filePath;
			// Skip if already scanning/done — allow re-scanning on error (Retry).
			const status = perImageScanStatus[path];
			if (status && status !== 'error') continue;
			if (isScanQueued[path]) continue;
			if (queueScanResults[path] && !queueScanResults[path]?.errorMsg) continue;
			// If the user cropped the image, scan the staged version instead of the original.
			const source = entry.stagingPath ?? undefined;
			scan({ withAutoCat: true, imagePath: path, sourceOverride: source });
		}
	}, [inboxImages, perImageScanStatus, isScanQueued, queueScanResults, scan]);

	// ── Scan single image ────────────────────────────────────────────────────────────────────
	const handleScanOne = useCallback((path: string) => {
		// Allow re-scanning when status is 'error' (Retry button) but block active scans.
		const status = perImageScanStatus[path];
		if (status && status !== 'error') return;
		if (isScanQueued[path]) return;
		if (queueScanResults[path] && !queueScanResults[path]?.errorMsg) return;
		const entry = inboxImages.find((e) => e.filePath === path);
		const source = entry?.stagingPath ?? undefined;
		scan({ withAutoCat: true, imagePath: path, sourceOverride: source });
	}, [scan, perImageScanStatus, isScanQueued, queueScanResults, inboxImages]);

	// ── Derived state ──────────────────────────────────────────────────────────────────────────
	const isEmpty = inboxImages.length === 0;
	const allDone = isEmpty && completedReceiptIds.length > 0;

	// Images eligible for scanning: either never scanned or in error state.
	const hasScanableImages = inboxImages.some((e) => {
		const s = perImageScanStatus[e.filePath];
		if (isScanQueued[e.filePath]) return false;
		if (s === 'error') return true;
		return !s && !queueScanResults[e.filePath];
	});

	const uploadingCount = inboxImages.filter((entry) => entry.id < 0).length;
	const readyCount = inboxImages.length - uploadingCount;

	// ── Task manager → card mapping ──────────────────────────────────────────────────────────
	const taskForPath = useMemo((): Record<string, Task> => {
		const memory = getTabMemory(tabId);
		const map: Record<string, Task> = {};
		for (const entry of inboxImages) {
			const jobKey = memory.jobKeys[entry.filePath];
			if (!jobKey) continue;
			const task = tasks.find(t => t.id === jobKey || t._jobKey === jobKey);
			if (task) map[entry.filePath] = task;
		}
		return map;
	}, [getTabMemory, tabId, inboxImages, tasks]);

	const cancellableTasks = useMemo(
		() => Object.values(taskForPath).filter(t => t.status === 'active' && t.canCancel),
		[taskForPath],
	);
	const hasCancellableTasks = cancellableTasks.length > 0;

	const handleCancelAll = useCallback(() => {
		for (const task of cancellableTasks) cancelTask(task.id);
	}, [cancellableTasks, cancelTask]);

	// ── Card action callbacks ─────────────────────────────────────────────────────────────────────────
	const handleCardCancel = useCallback((_path: string, task: Task | undefined) => {
		if (task?.canCancel) cancelTask(task.id);
		else cancelActiveScan();
	}, [cancelTask, cancelActiveScan]);

	const handleCardEdit = useCallback(async (entry: { id: number; filePath: string; stagingPath: string | null }) => {
		const editPath = entry.stagingPath ?? entry.filePath;
		const bytes = await readFile(editPath);
		const ext = editPath.split('.').pop()?.toLowerCase();
		const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
		const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
		setEditingEntry((prev) => {
			if (prev?.src.startsWith('blob:')) URL.revokeObjectURL(prev.src);
			return { id: entry.id, src: url, path: editPath };
		});
	}, []);

	const handleCardRevert = useCallback((entry: { id: number }) => {
		void updateStaging(entry.id, null);
	}, [updateStaging]);

	const handleCardRemove = useCallback((entry: { id: number; filePath: string }) => {
		void removeFromLibrary(entry.id);
		removeFromQueue(entry.filePath);
	}, [removeFromLibrary, removeFromQueue]);

	return (
		<div className="min-h-screen bg-white">
			<main className="container mx-auto px-4 pt-8 pb-10 max-w-4xl">

				{/* Page header */}
				<div className="mb-8">
					<div className="flex items-center gap-3 mb-1">
						<div className="inline-flex items-center justify-center w-10 h-10 bg-violet-100 rounded-xl flex-shrink-0">
							<i className="fas fa-camera text-lg text-violet-600" aria-hidden="true" />
						</div>
						<h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Scan Receipts</h1>
					</div>
					<p className="text-slate-500 mt-1 text-sm">
						Upload receipt images, then scan them when you're ready.
					</p>
				</div>

				{/* AI model banner */}
				<ModelDownloadBanner />

				{/* Queue warning */}
				{queueWarningMsg && (
					<div className="mb-3 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-700 flex items-center gap-2">
						<i className="fas fa-exclamation-triangle flex-shrink-0" aria-hidden="true" />
						{queueWarningMsg}
					</div>
				)}

				{/* All done CTA */}
				{allDone && (
					<div className="relative mb-6 rounded-2xl border border-emerald-200 ring-1 ring-emerald-200 bg-emerald-50 px-5 py-5 flex flex-col items-center text-center gap-3">
						{/* Dismiss button */}
						<button
							type="button"
							aria-label="Dismiss completed scans"
							onClick={() => {
								setCompletedReceiptIds([]);
								doneAnimatedRef.current.clear();
								setTabMemory(tabId, (prev) => ({ ...prev, completedScanIds: [] }));
							}}
							className="absolute top-2.5 right-2.5 flex items-center justify-center w-6 h-6 rounded-full text-emerald-600 hover:bg-emerald-100 transition-colors cursor-pointer"
						>
							<i className="fas fa-xmark text-xs" aria-hidden="true" />
						</button>
						<div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
							<i className="fas fa-check text-emerald-600 text-xl" aria-hidden="true" />
						</div>
						<div>
							<p className="font-semibold text-emerald-900 text-base">
								{completedReceiptIds.length === 1 ? '1 receipt scanned!' : `${completedReceiptIds.length} receipts scanned!`}
							</p>
							<p className="text-xs text-emerald-700 mt-0.5">Ready to review and edit your data.</p>
						</div>
						<button
							type="button"
							onClick={() => {
								openReceiptEditorTab(completedReceiptIds);
								setCompletedReceiptIds([]);
								doneAnimatedRef.current.clear();
								setTabMemory(tabId, (prev) => ({ ...prev, completedScanIds: [] }));
							}}
							className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-full text-sm font-semibold hover:bg-emerald-700 transition-colors cursor-pointer shadow-sm"
						>
							<i className="fas fa-pen-to-square" aria-hidden="true" />
							Open {completedReceiptIds.length === 1 ? 'Receipt' : `${completedReceiptIds.length} Receipts`} in Editor
						</button>
						<button
							type="button"
							onClick={() => void pickImages()}
							className="text-xs text-emerald-600 hover:underline cursor-pointer"
						>
							Scan more receipts
						</button>
					</div>
				)}

				{/* Inbox image cards */}
				{inboxImages.length > 0 && (
					<div className="mb-6">
						{/* Inbox header */}
						<div className="flex items-center justify-between mb-3">
							<p className="text-xs font-medium text-slate-400 uppercase tracking-wide">
							{uploadingCount > 0 ? (
								<>Uploading {uploadingCount} {uploadingCount === 1 ? 'image' : 'images'} ...</>
							) : (
								<>{readyCount} {readyCount === 1 ? 'image' : 'images'} ready</>
							)}
						</p>
							<div className="flex items-center gap-2">
								{hasScanableImages && (
									<button
										type="button"
										disabled={modelsAbsent}
										onClick={handleScanAll}
										className="inline-flex items-center gap-1.5 rounded-full bg-violet-600 px-3 py-1 text-xs font-medium text-white hover:bg-violet-700 transition-all duration-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
										aria-label="Scan all images"
									>
										<i className="fas fa-search text-[10px]" aria-hidden="true" /> Scan All
									</button>
								)}
								{hasCancellableTasks && (
									<button
										type="button"
										onClick={handleCancelAll}
										className="inline-flex items-center gap-1.5 rounded-full border border-red-200 px-3 py-1 text-xs font-medium text-red-500 hover:bg-red-50 transition-all duration-200 cursor-pointer"
										aria-label="Cancel all active scans"
									>
										<i className="fas fa-xmark text-[10px]" aria-hidden="true" /> Cancel All
									</button>
								)}
							</div>
						</div>
						<div className="space-y-3">
							{inboxImages.map((entry) => (
								<ScannerInboxCard
									key={entry.id}
									entry={entry}
									donePhase={donePhase}
									taskForPath={taskForPath}
									perImageScanStatus={perImageScanStatus}
									queueScanResults={queueScanResults}
									queueErrors={getTabMemory(tabId).queueErrors}
									modelsAbsent={modelsAbsent}
									onScan={handleScanOne}
									onCancel={handleCardCancel}
									onEdit={handleCardEdit} onRevert={handleCardRevert} onRemove={handleCardRemove}
								/>
							))}
						</div>
					</div>
				)}

				{/* Drop / pick zone (shown when inbox is empty and not all done) */}
				{isEmpty && !allDone && !libraryLoading && (
					<button
						type="button"
						disabled={modelsAbsent}
						onClick={() => void pickImages()}
						className={`w-full py-12 border-2 border-dashed rounded-2xl transition-colors flex flex-col items-center gap-3 ${isDragOver
							? 'border-violet-400 bg-violet-50 text-violet-600 cursor-copy'
							: modelsAbsent
								? 'border-slate-200 bg-slate-50/50 text-slate-300 cursor-not-allowed'
								: 'border-slate-200 bg-slate-50/50 text-slate-500 hover:border-violet-400 hover:text-violet-500 cursor-pointer'
							}`}
					>
						<i className="fas fa-receipt text-4xl drop-shadow-sm" aria-hidden="true" />
						<span className="text-sm font-medium">Pick Receipt Images</span>
						<span className="text-xs opacity-60">or drag &amp; drop images here</span>
					</button>
				)}

				{/* Add more images button (shown when inbox has items) */}
				{!isEmpty && (
					<button
						type="button"
						disabled={modelsAbsent}
						onClick={() => void pickImages()}
						className="w-full py-3 border-2 border-dashed border-slate-200 hover:border-violet-400 rounded-2xl text-sm text-slate-400 hover:text-violet-500 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
					>
						<i className="fas fa-plus" aria-hidden="true" /> Add more images
					</button>
				)}

			</main>

			{/* Crop editor overlay (scan-flow) */}
			{isEditorOpen && editorSrc && editorPath && (
				<ImageCropEditor
					imageSrc={editorSrc}
					imagePath={editorPath}
					onApply={handleEditorApply}
					onCancel={handleEditorCancel}
				/>
			)}

			{/* Crop editor overlay (standalone inbox edit) */}
			{editingEntry && (
				<ImageCropEditor
					imageSrc={editingEntry.src}
					imagePath={editingEntry.path}
					onApply={(newPath) => {
						void updateStaging(editingEntry.id, newPath);
						if (editingEntry.src.startsWith('blob:')) URL.revokeObjectURL(editingEntry.src);
						setEditingEntry(null);
					}}
					onCancel={() => {
						if (editingEntry.src.startsWith('blob:')) URL.revokeObjectURL(editingEntry.src);
						setEditingEntry(null);
					}}
				/>
			)}
		</div>
	);
}
