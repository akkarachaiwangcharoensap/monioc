import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import type React from 'react';
import DatePicker from 'react-date-picker';
import 'react-date-picker/dist/DatePicker.css';
import 'react-calendar/dist/Calendar.css';
import purchaseDatePickerStyles from '../components/receipt-scanner/PurchaseDatePicker.module.css';

import ExportCsvButton from '../components/receipt-scanner/ExportCsvButton';
import ImageCropEditor from '../components/receipt-scanner/ImageCropEditor';
import ReceiptSpreadsheet from '../components/receipt-scanner/ReceiptSpreadsheet';
import NavButton from '../components/ui/NavButton';
import InlineSpinner from '../components/ui/InlineSpinner';
import SkeletonBlock from '../components/ui/SkeletonBlock';
import EditorThumbnailStrip from '../components/receipt-editor/EditorThumbnailStrip';
import ReceiptPickerGrid from '../components/receipt-editor/ReceiptPickerGrid';

import { TauriApi } from '../services/api';
import { ROUTES } from '../constants';
import { useReceiptCache } from '../context/ReceiptCacheContext';
import { useToast } from '../context/ToastContext';
import { useTabMemory } from '../context/TabMemoryContext';
import { useTabContext } from '../context/TabContext';

import { useScanReceipt } from '../hooks/receipt-scanner/useScanReceipt';
import { useFileSizes } from '../hooks/receipt-scanner/useFileSizes';
import { useCategoriesContext as useCategories } from '../context/CategoriesContext';
import { useModelDownload } from '../hooks/useModelDownload';

import { getReceiptDisplayName } from '../utils/receipt-scanner/receiptSession';
import { useAppEvents } from '../hooks/useAppEvents';

import AddReceiptModal from '../components/receipt-editor/AddReceiptModal';

const TAB_ID = ROUTES.RECEIPTS_EDITOR;

export default function ReceiptEditorPage(): React.ReactElement {
	const { getTabMemory, setTabMemory, releaseWriteLock } = useTabMemory();
	const { receipts, getReceipt, applyOptimistic, forceReload, isInitialLoading: cacheInitialLoading } = useReceiptCache();
	const { openReceiptEditorTab } = useTabContext();
	const { addToast } = useToast();
	const { categories, getCategoryColor } = useCategories();
	const { allModelsReady, checking: modelChecking } = useModelDownload();
	const modelsAbsent = !modelChecking && !allModelsReady;

	// ── Receipt list from TabMemory ───────────────────────────────────────────
	const tabMemory = getTabMemory(TAB_ID);
	const loadedReceiptIds = useMemo(
		() => tabMemory.loadedReceiptIds ?? [],
		[tabMemory],
	);

	// ── Selected receipt ─────────────────────────────────────────────────────
	// Derive directly from TabMemory so that external changes to activeReceiptId
	// (e.g. openReceiptEditorTab navigating to a new receipt) are reflected
	// immediately without a separate useState + effect indirection.
	const selectedReceiptId = tabMemory.activeReceiptId ?? loadedReceiptIds[0] ?? null;
	const setSelectedReceiptId = useCallback((id: number | null) => {
		setTabMemory(TAB_ID, (prev) => ({ ...prev, activeReceiptId: id }));
	}, [setTabMemory]);

	// ── Remove a receipt from the workspace ──────────────────────────────────
	const removeReceiptFromWorkspace = useCallback(
		(id: number) => {
			setTabMemory(TAB_ID, (prev) => {
				const nextBasePathMap = { ...(prev.receiptBasePathMap ?? {}) };
				delete nextBasePathMap[id];
				return {
					...prev,
					loadedReceiptIds: (prev.loadedReceiptIds ?? []).filter((rid) => rid !== id),
					activeReceiptId: prev.activeReceiptId === id ? null : prev.activeReceiptId,
					receiptBasePathMap: nextBasePathMap,
				};
			});
			releaseWriteLock(TAB_ID, id);
		},
		[setTabMemory, releaseWriteLock],
	);

	// ── useScanReceipt for the editor tab ────────────────────────────────────
	const {
		result,
		status,
		editableData,
		editorValue,
		editorTab,
		isUpdating,
		isHydratingSelection,
		isEditorOpen,
		editorSrc,
		editorPath,
		selectedScanId,
		purchaseDate,
		createdAt,
		categorizeError,
		perImageScanStatus,
		perImageCategorizeStatus,
		initFromRecord,
		handleEditorApply,
		handleEditorCancel,
		revertToOriginal,
		imagePath,
		baseImagePath,
		isScanQueued,
		applyEditableData,
		onJsonChange,
		setEditorTab,
		runManualCategorize,
		cancelActiveCategorize,
		updatePurchaseDate,
		updateCreatedAt,
		activateQueueImage,
		queueScanResults,
		previewSrc,
		previewPath,
		previewSourceKind,
		openEditorForPath,
		fallbackToBlobPreview,
		previewErrorMsg,
		scan,
		cancelActiveScan,
	} = useScanReceipt(TAB_ID, categories);

	// Derive categorizing states from useScanReceipt outputs.
	// Use selectedReceiptId → queueScanResults as the primary path lookup so the
	// disabled checks stay correct during the transient render where baseImagePath
	// hasn't yet synced to the newly selected receipt (e.g. after a thumbnail
	// switch that updates selectedReceiptId before TabMemory's activeBasePath).
	const selectedReceiptBasePath = useMemo(
		() =>
			selectedReceiptId != null
				? (Object.entries(queueScanResults).find(([, e]) => e.scanId === selectedReceiptId)?.[0] ?? null)
				: null,
		[selectedReceiptId, queueScanResults],
	);
	const effectivePath = selectedReceiptBasePath ?? baseImagePath;
	const isCurrentImageCatFromScan = effectivePath != null && perImageScanStatus[effectivePath] === 'categorizing';
	const isCurrentImageCatStandalone = effectivePath != null && perImageCategorizeStatus[effectivePath] === 'categorizing';
	const isCurrentImageCategorizing = isCurrentImageCatFromScan || isCurrentImageCatStandalone;
	const isScanQueued_active = effectivePath != null && isScanQueued[effectivePath];
	const isCurrentImageScanning = effectivePath != null && perImageScanStatus[effectivePath] === 'scanning';

	// ── Hydration: load selected receipt into useScanReceipt ─────────────────
	// Initialise from the tab's already-persisted selectedScanId so that a
	// remount caused by a tab switch does NOT clear the gate and re-run
	// initFromRecord (which would wipe all local scan state for the receipt that
	// is already displayed).
	const hydratedIdRef = useRef<number | null>(getTabMemory(TAB_ID).selectedScanId);
	useEffect(() => {
		if (selectedReceiptId == null) return;
		// When scan state was wiped (e.g. receipts replaced via
		// openReceiptEditorTab), selectedScanId is null even though
		// loadedReceiptIds is non-empty.  Bypass the guard so the receipt
		// re-hydrates from the cache instead of showing blank thumbnails.
		const scanStateWiped =
			getTabMemory(TAB_ID).selectedScanId == null && (getTabMemory(TAB_ID).loadedReceiptIds ?? []).length > 0;
		if (hydratedIdRef.current === selectedReceiptId && !scanStateWiped)
			return;

		const record = getReceipt(selectedReceiptId);
		if (!record)
			return;
		initFromRecord(record, { merge: true });
		hydratedIdRef.current = selectedReceiptId;
	}, [selectedReceiptId, getReceipt, initFromRecord, getTabMemory]);

	// ── Receipt deletion: remove deleted receipt from editor workspace ────────
	const onReceiptDeleted = useCallback(
		({ id }: { id: number }) => {
			if (!loadedReceiptIds.includes(id)) return;
			removeReceiptFromWorkspace(id);
			if (id === selectedReceiptId) {
				const remaining = loadedReceiptIds.filter((rid) => rid !== id);
				setSelectedReceiptId(remaining[0] ?? null);
				hydratedIdRef.current = null;
			}
		},
		[loadedReceiptIds, selectedReceiptId, removeReceiptFromWorkspace, setSelectedReceiptId],
	);
	useAppEvents({ onReceiptDeleted });

	// ── On mount: prune receipts deleted while this tab was unmounted ─────────
	// The Editor tab unmounts on every tab switch, so the real-time
	// onReceiptDeleted listener above silently misses deletion events that fired
	// while the tab was away.  ReceiptCacheContext is always mounted and handles
	// every receipt:deleted event, so getReceipt(id) === undefined is a reliable
	// signal that a receipt no longer exists.  This effect reconciles
	// loadedReceiptIds against the cache each time the page mounts (after the
	// initial cache fetch completes) and evicts any stale IDs.
	useEffect(() => {
		if (cacheInitialLoading) return;
		const currentIds = getTabMemory(TAB_ID).loadedReceiptIds ?? [];
		const staleIds = currentIds.filter((id) => !getReceipt(id));
		if (staleIds.length === 0) return;
		setTabMemory(TAB_ID, (prev) => ({
			...prev,
			loadedReceiptIds: (prev.loadedReceiptIds ?? []).filter((id) => !staleIds.includes(id)),
			activeReceiptId: staleIds.includes(prev.activeReceiptId ?? -1) ? null : prev.activeReceiptId,
		}));
		for (const id of staleIds) releaseWriteLock(TAB_ID, id);
		// Clear the hydration gate if the active receipt was pruned so that
		// initFromRecord fires for the newly-selected receipt on the next render.
		if (selectedReceiptId != null && staleIds.includes(selectedReceiptId)) {
			hydratedIdRef.current = null;
		}
	}, [cacheInitialLoading, getReceipt, getTabMemory, releaseWriteLock, selectedReceiptId, setTabMemory]);

	// ── Clear scan state when all receipts are removed ────────────────────────
	// When the last receipt thumbnail is dismissed (via the × button or via the
	// Dashboard), the data table would otherwise remain visible because the local
	// scan state in useScanReceipt persists beyond the receipt list.  Wiping the
	// TabMemory scan fields zeroes out selectedScanId (which drives the
	// `result && status === 'done' && selectedScanId != null` guard) so the empty
	// picker is shown instead of stale scan results.
	useEffect(() => {
		if (loadedReceiptIds.length > 0) return;
		setTabMemory(TAB_ID, (prev) => ({
			...prev,
			imageQueue: [],
			activeBasePath: null,
			selectedScanId: null,
			jobKeys: {},
			queueScanResults: {},
			queueEdits: {},
			receiptBasePathMap: {},
		}));
		hydratedIdRef.current = null;
	}, [loadedReceiptIds.length, setTabMemory]);

	// ── Inline rename ─────────────────────────────────────────────────────────
	const [renamingReceipt, setRenamingReceipt] = useState(false);
	const [renameValue, setRenameValue] = useState('');

	const activeSavedScan = selectedScanId != null ? (getReceipt(selectedScanId) ?? null) : null;
	const currentReceiptName = selectedScanId != null
		? getReceiptDisplayName(activeSavedScan?.displayName, activeSavedScan?.imagePath ?? baseImagePath ?? imagePath)
		: null;

	const confirmReceiptRename = useCallback(async () => {
		const trimmed = renameValue.trim();
		setRenamingReceipt(false);
		if (selectedScanId == null) return;
		const existing = getReceipt(selectedScanId);
		if (existing) applyOptimistic({ ...existing, displayName: trimmed || null });
		try {
			await TauriApi.renameReceiptScan(selectedScanId, trimmed || null);
			addToast({ type: 'success', title: 'Receipt renamed', duration: 2000 });
		} catch {
			void forceReload();
		}
	}, [renameValue, selectedScanId, getReceipt, applyOptimistic, addToast, forceReload]);

	// ── AddReceiptModal ───────────────────────────────────────────────────────
	const [showAddModal, setShowAddModal] = useState(false);

	const { imageQueue, receiptBasePathMap } = tabMemory;
	const handleChipClick = useCallback((id: number) => {
		if (id === selectedReceiptId) return;
		// Look up the stable tracking basePath for this receipt.
		// Priority:
		//  1. queueScanResults — covers completed scans (has a scanId entry)
		//  2. receiptBasePathMap — stable key registered by initFromRecord; survives
		//     any number of Re-Scans that change the DB record's imagePath (TS1→TS2→…)
		//  3. getReceipt fallback — only for newly-added receipts whose first
		//     initFromRecord hasn't fired yet (receiptBasePathMap not yet populated)
		//
		// Using getReceipt(id).imagePath alone breaks after the first Re-Scan: the
		// DB record has imagePath=TS2 but imageQueue still has TS1 as tracking key.
		// receiptBasePathMap stores TS1 permanently, letting us find the correct
		// queue entry regardless of how many rescans have happened.
		const queueBasePath = Object.entries(queueScanResults).find(([, entry]) => entry.scanId === id)?.[0] ?? null;
		const stableBasePath = receiptBasePathMap?.[id] ?? (getReceipt(id)?.imagePath ?? null);
		const resolvedBasePath = queueBasePath ?? stableBasePath;
		const isInQueue = resolvedBasePath != null && (
			queueBasePath != null || imageQueue.includes(resolvedBasePath)
		);
		if (isInQueue && resolvedBasePath != null) {
			activateQueueImage(resolvedBasePath);
			// Mark as hydrated so the existing scan state is used as-is and
			// initFromRecord does not fire and wipe the rest of the queue.
			hydratedIdRef.current = id;
			setSelectedReceiptId(id);
		} else {
			hydratedIdRef.current = null;
			setSelectedReceiptId(id);
		}
	}, [selectedReceiptId, queueScanResults, imageQueue, receiptBasePathMap, getReceipt, activateQueueImage, setSelectedReceiptId]);

	// ── Thumbnail strip helpers ────────────────────────────────────────────────
	const trackedSizePaths = useMemo(() => {
		const paths: string[] = [];
		for (const id of loadedReceiptIds) {
			const record = getReceipt(id);
			const basePath = receiptBasePathMap?.[id] ?? record?.imagePath ?? null;
			if (!basePath) continue;
			const savedResult = queueScanResults[basePath];
			const displayPath = savedResult?.processedImagePath ?? record?.processedImagePath ?? basePath;
			paths.push(displayPath);
		}
		return Array.from(new Set(paths));
	}, [loadedReceiptIds, getReceipt, queueScanResults, receiptBasePathMap]);

	const fileSizeByPath = useFileSizes(trackedSizePaths);

	const handleRemoveThumbnail = useCallback((id: number) => {
		removeReceiptFromWorkspace(id);
		if (id === selectedReceiptId) {
			const remaining = loadedReceiptIds.filter((rid) => rid !== id);
			setSelectedReceiptId(remaining[0] ?? null);
			hydratedIdRef.current = null;
		}
	}, [removeReceiptFromWorkspace, selectedReceiptId, loadedReceiptIds, setSelectedReceiptId]);

	return (
		<div className="min-h-screen bg-white">
				<main className="container mx-auto px-4 md:px-6 lg:px-8 pt-8 pb-10 max-w-4xl lg:max-w-7xl">
				{/* ── Breadcrumb ──────────────────────────────────────────────── */}
				<div className="mb-5 flex items-center gap-2 text-sm text-slate-400">
					<NavButton
						to={ROUTES.RECEIPTS}
						className="flex items-center gap-1.5 hover:text-slate-700 transition-colors"
					>
						<i className="fas fa-receipt text-xs" aria-hidden="true" />
						Receipts
					</NavButton>
					<i className="fas fa-chevron-right text-[10px]" aria-hidden="true" />
					<span className="font-medium text-slate-700">Editor</span>
				</div>

				{/* ── Page header ─────────────────────────────────────────────── */}
				<div className="mb-6">
					<div className="flex items-center gap-3 mb-1">
						<div className="inline-flex items-center justify-center w-10 h-10 bg-violet-100 rounded-xl flex-shrink-0">
							<i className="fas fa-file-lines text-lg text-violet-600" aria-hidden="true" />
						</div>
						<h1 className="text-2xl font-semibold text-slate-900 tracking-tight">
							Receipts Editor
						</h1>
					</div>
				</div>

				{/* ── Receipt thumbnail strip ────────────────────────────────────── */}
				{loadedReceiptIds.length > 0 && (
					<EditorThumbnailStrip
						loadedReceiptIds={loadedReceiptIds}
						selectedReceiptId={selectedReceiptId}
						previewSrc={previewSrc}
						queueScanResults={queueScanResults}
						perImageScanStatus={perImageScanStatus}
						perImageCategorizeStatus={perImageCategorizeStatus}
						isScanQueued={isScanQueued}
						fileSizeByPath={fileSizeByPath}
						trackedSizePaths={trackedSizePaths}
						receiptBasePathMap={receiptBasePathMap}
						onChipClick={handleChipClick}
						onRemove={handleRemoveThumbnail}
						onAdd={() => setShowAddModal(true)}
					/>
				)}

				{/* ── Empty state: inline receipt picker ──────────────────────── */}
				{loadedReceiptIds.length === 0 && (
					<ReceiptPickerGrid
						receipts={receipts}
						cacheInitialLoading={cacheInitialLoading}
						onOpen={(ids) => openReceiptEditorTab(ids)}
					/>
				)}

				{/* ── Side-by-side layout: image + editor ──────────────────────── */}
				{loadedReceiptIds.length > 0 && (
					<div className="flex flex-col lg:flex-row lg:gap-6 lg:items-start">
						{/* ── Left column: receipt image (sticky on lg+) ──────── */}
						<div className="w-full lg:w-[40%] lg:max-w-md lg:sticky lg:top-8 lg:self-start flex-shrink-0">
							{/* ── Large image preview ───────────────────────────── */}
							{previewSrc && (
								<div className="relative rounded-3xl overflow-hidden border border-slate-200 bg-slate-50 select-none mb-4">
									<img
										src={previewSrc}
										alt="Receipt"
										className="w-full lg:max-h-[70vh] max-h-80 object-contain"
										draggable={false}
										onError={() => {
											if (previewSourceKind === 'path') {
												void fallbackToBlobPreview(previewPath);
											}
										}}
									/>
									<div className="absolute top-3 right-3 flex items-center gap-2">
										{baseImagePath && imagePath !== baseImagePath && (
											<button
												title="Revert to original image"
												aria-label="Revert to original"
												onClick={revertToOriginal}
												className="w-8 h-8 flex items-center justify-center bg-white/90 hover:bg-white rounded-full shadow-sm transition-all cursor-pointer hover:ring-2 hover:ring-amber-400/70 hover:shadow-md"
											>
												<i className="fas fa-rotate-left text-amber-600 text-sm" aria-hidden="true" />
											</button>
										)}
										<button
											title="Crop & adjust for better OCR results"
											aria-label="Edit image"
											onClick={() => {
												const activePath = previewPath ?? imagePath;
												if (activePath) void openEditorForPath(activePath);
											}}
											className="w-8 h-8 flex items-center justify-center bg-white/90 hover:bg-white rounded-full shadow-sm transition-all cursor-pointer hover:ring-2 hover:ring-violet-500/70 hover:shadow-md"
										>
											<i className="fas fa-crop-simple text-slate-600 text-sm" aria-hidden="true" />
										</button>
										{selectedReceiptId != null && (
											<button
												onClick={() => {
													removeReceiptFromWorkspace(selectedReceiptId);
													const remaining = loadedReceiptIds.filter((id) => id !== selectedReceiptId);
													setSelectedReceiptId(remaining[0] ?? null);
													hydratedIdRef.current = null;
												}}
												className="w-8 h-8 flex items-center justify-center bg-white/90 hover:bg-white rounded-full shadow-sm transition-all cursor-pointer hover:ring-2 hover:ring-red-400/70 hover:shadow-md"
												aria-label="Remove receipt from editor"
											>
												<i className="fas fa-times text-slate-600 text-sm" aria-hidden="true" />
											</button>
										)}
									</div>
								</div>
							)}

							{/* Preview error */}
							{previewErrorMsg && (
								<div className="px-4 py-3 rounded-2xl border border-amber-200 bg-amber-50 text-amber-800 text-sm mb-4">
									<i className="fas fa-triangle-exclamation mr-2" aria-hidden="true" />
									{previewErrorMsg}
								</div>
							)}

							{/* ── Re-Scan button ────────────────────────────────── */}
							{imagePath && (
								<div className="flex gap-3 mb-4 lg:mb-0">
									<button
										type="button"
										onClick={() => { scan({ withAutoCat: true }); }}
										disabled={isCurrentImageCategorizing || isCurrentImageScanning || isScanQueued_active || modelsAbsent}
										className="flex-1 inline-flex items-center justify-center gap-2 py-3 bg-violet-600 text-white rounded-full text-sm font-medium hover:bg-violet-700 active:bg-violet-800 active:scale-[0.98] disabled:opacity-40 transition-all cursor-pointer disabled:cursor-not-allowed"
									>
										{isCurrentImageCategorizing ? (
											<><InlineSpinner /> Categorizing…</>
										) : isCurrentImageScanning ? (
											<><InlineSpinner /> Scanning…</>
										) : isScanQueued_active ? (
											<><i className="fas fa-clock" aria-hidden="true" /> Queued…</>
										) : (
											<><i className="fas fa-search" aria-hidden="true" /> Re-Scan Receipt</>
										)}
									</button>
									{isCurrentImageScanning && (
										<button
											type="button"
											onClick={() => { cancelActiveScan(); }}
											className="inline-flex items-center justify-center w-12 h-12 bg-red-100 text-red-600 rounded-full text-sm font-medium hover:bg-red-200 active:scale-[0.98] transition-all cursor-pointer flex-shrink-0"
											title="Cancel scan"
										>
											<i className="fas fa-times" aria-hidden="true" />
										</button>
									)}
								</div>
							)}
						</div>

						{/* ── Right column: receipt editor ─────────────────────── */}
						<div className="w-full lg:flex-1 lg:min-w-0">
				{result && status === 'done' && selectedScanId != null && (
					<div className="mb-10">
						<div className="mb-3 flex items-center justify-between">
							<div className="flex items-center gap-2">
								{renamingReceipt ? (
									<input
										autoFocus
										aria-label="Receipt name"
										value={renameValue}
										onChange={(e) => setRenameValue(e.target.value)}
										onBlur={() => { void confirmReceiptRename(); }}
										onKeyDown={(e) => {
											if (e.key === 'Enter') { e.preventDefault(); void confirmReceiptRename(); }
											if (e.key === 'Escape') { setRenamingReceipt(false); }
										}}
										className="text-lg font-semibold text-slate-900 bg-slate-100 rounded-lg px-2 py-0.5 outline-none ring-2 ring-violet-400 min-w-0 w-48"
									/>
								) : (
									<>
										<h2 className="text-lg font-semibold text-slate-900">
											{currentReceiptName ?? 'Edit Receipt'}
										</h2>
										<button
											type="button"
											aria-label="Rename receipt"
											title="Rename"
											onClick={() => {
												setRenameValue(currentReceiptName ?? '');
												setRenamingReceipt(true);
											}}
											className="inline-flex h-6 w-6 items-center justify-center rounded-full text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-colors cursor-pointer"
										>
											<i className="fas fa-pencil text-xs" aria-hidden="true" />
										</button>
									</>
								)}
							</div>

							{/* Table / Raw JSON tab switcher */}
							<div className="inline-flex rounded-full bg-slate-100 p-1">
								<button
									type="button"
									onClick={() => setEditorTab('table')}
									className={`px-3 py-1 text-xs rounded-full cursor-pointer ${editorTab === 'table'
										? 'bg-white text-slate-800 shadow-sm'
										: 'text-slate-500'
										}`}
								>
									Table
								</button>
								<button
									type="button"
									onClick={() => setEditorTab('json')}
									className={`px-3 py-1 text-xs rounded-full cursor-pointer ${editorTab === 'json'
										? 'bg-white text-slate-800 shadow-sm'
										: 'text-slate-500'
										}`}
								>
									Raw JSON
								</button>
							</div>
						</div>

						{/* Dates row */}
						<div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
							<div className="flex items-center gap-2">
								<span className="text-xs text-slate-500">Purchased</span>
								<div className={purchaseDatePickerStyles.wrapper}>
									<DatePicker
										value={purchaseDate ? new Date(`${purchaseDate.split('T')[0]}T12:00:00`) : null}
										onChange={(value) => {
											const date = Array.isArray(value) ? value[0] : value;
											const dateStr = date instanceof Date
												? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
												: null;
											void updatePurchaseDate(dateStr);
										}}
										locale="en-US"
										calendarIcon={<i className="fas fa-calendar-alt" style={{ fontSize: '10px' }} />}
										clearIcon={purchaseDate ? <i className="fas fa-times" style={{ fontSize: '9px' }} /> : null}
										dayPlaceholder="dd"
										monthPlaceholder="mm"
										yearPlaceholder="yyyy"
									/>
								</div>
							</div>
							{createdAt && (
								<div className="flex items-center gap-2">
									<span className="text-xs text-slate-400">Scanned</span>
									<div className={purchaseDatePickerStyles.wrapper}>
										<DatePicker
											value={new Date(createdAt.replace(' ', 'T'))}
											onChange={(value) => {
												const date = Array.isArray(value) ? value[0] : value;
												if (!(date instanceof Date)) return;
												const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} 00:00:00`;
												void updateCreatedAt(dateStr);
											}}
											locale="en-US"
											calendarIcon={<i className="fas fa-calendar-alt" style={{ fontSize: '10px' }} />}
											clearIcon={null}
											dayPlaceholder="dd"
											monthPlaceholder="mm"
											yearPlaceholder="yyyy"
										/>
									</div>
								</div>
							)}
						</div>

						{isUpdating || isHydratingSelection ? (
							<SkeletonBlock />
						) : (
							<>
								{editorTab === 'table' && editableData && (
									<div className="space-y-3">
										<ReceiptSpreadsheet
											data={editableData}
											onChange={applyEditableData}
											categories={categories}
											getCategoryColor={getCategoryColor}
											useReactSelect={true}
											disabled={isCurrentImageCategorizing || isScanQueued_active}
										/>
										{categorizeError && (
											<p className="text-xs text-red-500">
												<i className="fas fa-exclamation-circle mr-1" aria-hidden="true" />
												{categorizeError}
											</p>
										)}
										<div className="flex flex-wrap gap-2 justify-end">
											<button
												type="button"
												onClick={() => { void runManualCategorize(); }}
												disabled={isCurrentImageCategorizing || modelsAbsent || isScanQueued_active}
												className="inline-flex items-center gap-2 px-3 py-2 rounded-full border border-violet-300 text-sm text-violet-700 hover:bg-violet-50 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed transition-colors"
											>
												{isCurrentImageCategorizing
													? <><InlineSpinner /> Categorizing…</>
													: <><i className="fas fa-tags" aria-hidden="true" /> Auto-categorize</>
												}
											</button>
											{isCurrentImageCategorizing && selectedScanId != null && (
												<button
													type="button"
													onClick={() => { cancelActiveCategorize(); }}
													className="inline-flex items-center gap-1 px-3 py-2 rounded-full border border-red-300 text-sm text-red-600 hover:bg-red-50 active:scale-[0.98] transition-colors cursor-pointer"
													title="Cancel categorization"
												>
													<i className="fas fa-times" aria-hidden="true" /> Cancel
												</button>
											)}
											<ExportCsvButton
												rows={editableData.rows}
												scanId={selectedScanId}
											/>
										</div>
									</div>
								)}
								{editorTab === 'json' && (
									<textarea
										value={editorValue}
										onChange={(e) => onJsonChange(e.target.value)}
										className="w-full min-h-64 rounded-2xl border border-slate-300 p-3 text-sm font-mono text-slate-700"
									/>
								)}
							</>
						)}
					</div>
				)}
						</div>
					</div>
				)}
			</main>

			{/* ── Crop editor overlay ─────────────────────────────────────────── */}
			{isEditorOpen && editorSrc && editorPath && (
				<ImageCropEditor
					imageSrc={editorSrc}
					imagePath={editorPath}
					onApply={handleEditorApply}
					onCancel={handleEditorCancel}
					onRevertToOriginal={baseImagePath && imagePath !== baseImagePath ? () => {
						handleEditorCancel();
						revertToOriginal();
					} : undefined}
				/>
			)}

			{/* ── Add Receipt Modal ───────────────────────────────────────────── */}
			{showAddModal && (
				<AddReceiptModal
					loadedReceiptIds={loadedReceiptIds}
					onClose={() => setShowAddModal(false)}
				/>
			)}
		</div>
	);
}
