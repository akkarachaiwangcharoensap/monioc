/**
 * useScanReceipt — facade hook for a single receipt scan session.
 *
 * This file owns all state, refs, contexts, effects, and derived values.
 * Action logic is delegated to five focused sub-hooks:
 *  - useReceiptDateMetadata   — purchase date / created-at updates
 *  - useReceiptCropEditor     — crop editor open / apply / cancel
 *  - useReceiptEditorData     — spreadsheet + JSON editor mutations
 *  - useReceiptImageQueue     — image picking, queue management, scan submission
 *  - useReceiptScanJob        — scan / categorize / cancel jobs
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import {
	QUEUE_WARNING_DURATION_MS,
} from '../../constants';

import type {
	ReceiptData,
	ReceiptScanRecord,
	EditorTab,
	TabMemory,
	TabMemoryScanResult,
} from '../../types';
import {
	receiptDataSignature,
	toEditableJson,
} from '../../utils/receipt-scanner/receiptData';
import {
	resolveReceiptImageState,
} from '../../utils/receipt-scanner/receiptSession';

import { TauriApi } from '../../services/api';
import { parseTauriError } from '../../services/errors';
import { useReceiptCache } from '../../context/ReceiptCacheContext';
import { useTabMemory } from '../../context/TabMemoryContext';
import { useJobStatus } from '../../context/JobStatusContext';
import { useTaskManager } from '../../context/TaskManagerContext';
import { useToast } from '../../context/ToastContext';
import { deriveScanStatuses } from './deriveScanStatuses';
import { useScanPreview } from './useScanPreview';
import { useReceiptDateMetadata } from './useReceiptDateMetadata';
import { useReceiptCropEditor } from './useReceiptCropEditor';
import { useReceiptEditorData } from './useReceiptEditorData';
import { useReceiptImageQueue } from './useReceiptImageQueue';
import { useReceiptScanJob } from './useReceiptScanJob';
import type { ScanReceiptRefs, PersistSelectedScanFn, PersistSelectionContext, PersistSelectionOptions } from './scanReceiptTypes';

/** Local UI status for the active image. Derived from JobStatusContext + TabMemory. */
type ScanStatus = 'idle' | 'ocr' | 'saving' | 'done' | 'error' | 'cancelling';

// Re-export for call sites that import the type.
export type { TabMemoryScanResult as PerImageScanResult };

export interface UseScanReceiptResult {
	saveSuccessMsg: string | null;
	imagePath: string | null;
	baseImagePath: string | null;
	queueWarningMsg: string | null;
	imageQueue: string[];
	queueEdits: Record<string, string>;
	processedImagePath: string | null;
	previewSrc: string | null;
	previewPath: string | null;
	previewSourceKind: 'path' | 'blob';
	previewErrorMsg: string | null;
	isEditorOpen: boolean;
	editorSrc: string | null;
	editorPath: string | null;
	status: ScanStatus;
	result: ReceiptData | null;
	errorMsg: string | null;
	selectedScanId: number | null;
	isUpdating: boolean;
	isHydratingSelection: boolean;
	editableData: ReceiptData | null;
	editorValue: string;
	editorTab: EditorTab;
	perImageScanStatus: Record<string, 'scanning' | 'categorizing' | 'done' | 'error' | 'cancelling'>;
	queueScanResults: Record<string, TabMemoryScanResult>;
	perImageCategorizeStatus: Record<string, 'categorizing'>;
	initFromRecord: (record: ReceiptScanRecord, options?: { merge?: boolean }) => void;
	pickReceiptImage: () => Promise<void>;
	/** @deprecated Use ImageLibrary flow instead. */
	addImagesToQueue: (paths: string[], activateFirst?: boolean, options?: { noAutoScan?: boolean }) => void;
	activateQueueImage: (path: string) => void;
	/** @deprecated Use ImageLibrary flow instead. */
	removeFromQueue: (path: string) => void;
	revertToOriginal: () => void;
	openEditorForPath: (path: string) => Promise<void>;
	handleEditorApply: (newPath: string) => void;
	handleEditorCancel: () => void;
	fallbackToBlobPreview: (path: string | null) => Promise<void>;
	scan: (opts?: { withAutoCat?: boolean; imagePath?: string; sourceOverride?: string }) => void;
	runManualCategorize: () => Promise<void>;
	categorizeError: string | null;
	isScanQueued: Record<string, boolean>;
	activeJobKey: string | null;
	cancelActiveScan: () => void;
	cancelActiveCategorize: () => void;
	reset: () => void;
	initBlankEntry: () => void;
	applyEditableData: (next: ReceiptData) => void;
	applyCategorizeResult: (next: ReceiptData, capturedBasePath: string | null, capturedScanId: number | null) => Promise<void>;
	onJsonChange: (nextJson: string) => void;
	setEditorTab: (tab: EditorTab) => void;
	purchaseDate: string | null;
	updatePurchaseDate: (date: string | null) => Promise<void>;
	createdAt: string | null;
	updateCreatedAt: (date: string) => Promise<void>;
}

export function useScanReceipt(
	tabId: string,
	categories: string[] = [],
): UseScanReceiptResult {
	// ── Contexts ──────────────────────────────────────────────────────────────
	const { getTabMemory, setTabMemory, acquireWriteLock, releaseWriteLock, getWriteOwner } = useTabMemory();
	const { jobs } = useJobStatus();
	const { applyOptimistic, getReceipt } = useReceiptCache();
	const { tasks, markTaskCancelling } = useTaskManager();
	const { addToast } = useToast();

	// ── Tab memory derivation ─────────────────────────────────────────────────
	const tabMemory = getTabMemory(tabId);
	const { imageQueue, queueEdits, queueScanResults, jobKeys, selectedScanId, activeBasePath: baseImagePath } = tabMemory;
	const queueErrors = tabMemory.queueErrors;
	const { cancellingPaths } = tabMemory;

	// Always-current ref so async callbacks always read the latest tab memory.
	const tabMemoryRef = useRef<TabMemory>(tabMemory);
	tabMemoryRef.current = tabMemory;

	// ── Local state ───────────────────────────────────────────────────────────
	const [isEditorOpen, setIsEditorOpen] = useState(false);
	const [editorSrc, setEditorSrc] = useState<string | null>(null);
	const [editorPath, setEditorPath] = useState<string | null>(null);
	const [queueWarningMsg, setQueueWarningMsg] = useState<string | null>(null);
	const [categorizeError, setCategorizeError] = useState<string | null>(null);
	const [isHydratingSelection, setIsHydratingSelection] = useState(false);
	const isUpdating = false;
	const saveSuccessMsg: string | null = null;

	const [purchaseDate, setPurchaseDate] = useState<string | null>(() => {
		const mem = getTabMemory(tabId);
		if (!mem.activeBasePath) return null;
		return mem.queueScanResults[mem.activeBasePath]?.purchaseDate ?? null;
	});
	const [createdAt, setCreatedAt] = useState<string | null>(() => {
		const mem = getTabMemory(tabId);
		if (!mem.activeBasePath) return null;
		return mem.queueScanResults[mem.activeBasePath]?.createdAt ?? null;
	});
	const [editableData, setEditableData] = useState<ReceiptData | null>(() => {
		const mem = getTabMemory(tabId);
		if (!mem.activeBasePath) return null;
		return mem.queueScanResults[mem.activeBasePath]?.editableData ?? null;
	});
	const [editorValue, setEditorValue] = useState<string>(() => {
		const mem = getTabMemory(tabId);
		if (!mem.activeBasePath) return '';
		const data = mem.queueScanResults[mem.activeBasePath]?.editableData;
		return data ? toEditableJson(data) : '';
	});
	const [editorTab, setEditorTab] = useState<EditorTab>('table');

	const result = editableData;

	// ── Refs ──────────────────────────────────────────────────────────────────
	const lastPersistedSignatureRef = useRef<string | null>(
		(() => {
			const mem = tabMemoryRef.current;
			const bp = mem.activeBasePath;
			if (!bp) return null;
			return mem.queueScanResults[bp]?.persistedSignature ?? null;
		})(),
	);
	const pendingUserEditRef = useRef(false);
	const persistSelectedScanRef = useRef<PersistSelectedScanFn>(async () => { });
	const imagePathRef = useRef<string | null>(null);
	const processedImagePathRef = useRef<string | null>(null);
	const purchaseDateRef = useRef<string | null>(purchaseDate);
	purchaseDateRef.current = purchaseDate;

	const refs: ScanReceiptRefs = useMemo(() => ({
		tabMemoryRef, lastPersistedSignatureRef, persistSelectedScanRef,
		imagePathRef, processedImagePathRef, purchaseDateRef, pendingUserEditRef,
	}), []);

	// ── TabMemory setters ─────────────────────────────────────────────────────
	const setImageQueue = useCallback(
		(updater: string[] | ((prev: string[]) => string[])) =>
			setTabMemory(tabId, (prev) => ({
				...prev,
				imageQueue: typeof updater === 'function' ? updater(prev.imageQueue) : updater,
			})),
		[setTabMemory, tabId],
	);
	const setQueueEdits = useCallback(
		(updater: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) =>
			setTabMemory(tabId, (prev) => ({
				...prev,
				queueEdits: typeof updater === 'function' ? updater(prev.queueEdits) : updater,
			})),
		[setTabMemory, tabId],
	);
	const setQueueScanResults = useCallback(
		(updater: Record<string, TabMemoryScanResult> | ((prev: Record<string, TabMemoryScanResult>) => Record<string, TabMemoryScanResult>)) =>
			setTabMemory(tabId, (prev) => ({
				...prev,
				queueScanResults: typeof updater === 'function' ? updater(prev.queueScanResults) : updater,
			})),
		[setTabMemory, tabId],
	);
	const setBaseImagePath = useCallback(
		(path: string | null) => setTabMemory(tabId, (prev) => ({ ...prev, activeBasePath: path })),
		[setTabMemory, tabId],
	);
	const setSelectedScanId = useCallback(
		(id: number | null) => setTabMemory(tabId, (prev) => ({ ...prev, selectedScanId: id })),
		[setTabMemory, tabId],
	);
	const storeJobKey = useCallback(
		(basePath: string, jobKey: string) =>
			setTabMemory(tabId, (prev) => ({
				...prev,
				jobKeys: { ...prev.jobKeys, [basePath]: jobKey },
			})),
		[setTabMemory, tabId],
	);

	// ── Derived image state ────────────────────────────────────────────────────
	const resolvedImageState = useMemo(() => {
		if (!baseImagePath) return null;
		return resolveReceiptImageState(baseImagePath, queueEdits, queueScanResults[baseImagePath]);
	}, [baseImagePath, queueEdits, queueScanResults]);

	const imagePath = resolvedImageState?.imagePath ?? null;
	const processedImagePath = resolvedImageState?.processedImagePath ?? null;

	imagePathRef.current = imagePath;
	processedImagePathRef.current = processedImagePath;

	const {
		previewSrc, previewPath, previewSourceKind, previewErrorMsg,
		setPreviewFromPath, fallbackToBlobPreview, revokePreviewObjectUrl,
		setPreviewSrc, setPreviewPath, setPreviewSourceKind, setPreviewErrorMsg,
	} = useScanPreview();

	// ── Derived statuses ──────────────────────────────────────────────────────
	const { perImageScanStatus, isScanQueued, perImageCategorizeStatus } = useMemo(
		() => deriveScanStatuses(queueScanResults, jobKeys, jobs, cancellingPaths, queueErrors),
		[queueScanResults, jobKeys, jobs, cancellingPaths, queueErrors],
	);

	const status: ScanStatus = useMemo(() => {
		if (baseImagePath) {
			const s = perImageScanStatus[baseImagePath];
			if (s === 'scanning') return 'ocr';
			if (s === 'categorizing') return 'ocr';
			if (s) return s;
		}
		return result != null ? 'done' : 'idle';
	}, [baseImagePath, perImageScanStatus, result]);

	const errorMsg: string | null = useMemo(() => {
		if (!baseImagePath) return null;
		const queueError = queueErrors?.[baseImagePath];
		if (queueError) return queueError;
		const saved = queueScanResults[baseImagePath];
		if (saved?.errorMsg) return saved.errorMsg;
		return null;
	}, [baseImagePath, queueErrors, queueScanResults]);

	const activeJobKey = baseImagePath ? (jobKeys[baseImagePath] ?? null) : null;

	const activeScanTaskStatus = useMemo((): string | null => {
		const jkey = baseImagePath ? jobKeys[baseImagePath] : null;
		if (!jkey || /^\d+$/.test(jkey)) return null;
		return tasks.find((t) => t.id === jkey)?.status ?? null;
	}, [tasks, baseImagePath, jobKeys]);

	const activeCatTaskStatus = useMemo((): string | null => {
		const jkey = baseImagePath ? jobKeys[baseImagePath] : null;
		if (!jkey || !/^\d+$/.test(jkey)) return null;
		return tasks.find((t) => t.id === jkey)?.status ?? null;
	}, [tasks, baseImagePath, jobKeys]);

	// ── getPersistablePaths ───────────────────────────────────────────────────
	const getPersistablePaths = useCallback(
		(basePath: string | null, activeImagePath: string | null, activeProcessedImagePath: string | null) => {
			if (basePath) {
				const editedPath = tabMemoryRef.current.queueEdits[basePath];
				if (editedPath) return { imagePath: basePath, processedImagePath: editedPath };
			}
			return { imagePath: activeImagePath, processedImagePath: activeProcessedImagePath };
		},
		[],
	);

	// ── Sub-hooks ─────────────────────────────────────────────────────────────
	const editorData = useReceiptEditorData({
		tabId, refs, setEditableData, setEditorValue, setEditorTab,
		setQueueScanResults, getReceipt, applyOptimistic,
		revokePreviewObjectUrl, setPreviewSrc, setPreviewPath, setPreviewErrorMsg,
		setTabMemory, releaseWriteLock,
	});

	const imageQueue_ = useReceiptImageQueue({
		tabId, categories, refs, imagePath,
		setImageQueue, setQueueEdits, setQueueScanResults,
		setBaseImagePath, setSelectedScanId, storeJobKey, setTabMemory,
		setQueueWarningMsg, setEditableData, setEditorValue, setEditorTab,
		setCreatedAt, setPurchaseDate, setCategorizeError,
		setPreviewFromPath, setPreviewSrc, setPreviewPath, setPreviewErrorMsg,
		revokePreviewObjectUrl, editableData,
	});

	const scanJob = useReceiptScanJob({
		tabId, categories, refs, editableData,
		storeJobKey, setTabMemory, markTaskCancelling,
		setEditableData, setEditorValue, setPurchaseDate, setCreatedAt,
		setCategorizeError,
		setQueueScanResults, applyEditableData: editorData.applyEditableData,
	});

	const cropEditor = useReceiptCropEditor({
		refs, editorSrc,
		setIsEditorOpen, setEditorSrc, setEditorPath,
		setPreviewFromPath, setQueueEdits, setQueueScanResults,
		editableData, addToast,
	});

	const dateMeta = useReceiptDateMetadata({
		refs, getReceipt, applyOptimistic,
		setQueueScanResults, setPurchaseDate, setCreatedAt, addToast,
	});

	// ── persistSelectedScan ───────────────────────────────────────────────────
	// Defined in the facade because it's cross-cutting: it reads editableData,
	// calls setQueueScanResults, setSelectedScanId, setEditableData, setEditorValue,
	// addToast, and applyOptimistic — crossing editor, queue, and persist layers.
	const persistSelectedScan = useCallback(
		async (nextData: ReceiptData, context: PersistSelectionContext, options?: PersistSelectionOptions) => {
			if (context.scanId == null) return;
			const lockOwner = getWriteOwner(context.scanId);
			if (lockOwner != null && lockOwner !== tabId) return;

			const nextSignature = receiptDataSignature(nextData);
			if (!options?.force && nextSignature === lastPersistedSignatureRef.current) return;

			const persistablePaths =
				options?.persistImagePath !== undefined || options?.persistProcessedImagePath !== undefined
					? { imagePath: options?.persistImagePath ?? null, processedImagePath: options?.persistProcessedImagePath ?? null }
					: getPersistablePaths(context.basePath, context.imagePath, context.processedImagePath);

			try {
				const updated = await TauriApi.updateReceiptScan({
					id: context.scanId,
					imagePath: persistablePaths.imagePath,
					processedImagePath: persistablePaths.processedImagePath,
					data: nextData,
				});

				applyOptimistic(updated);
				const updatedSignature = receiptDataSignature(updated.data);

				if (context.basePath != null) {
					const basePath = context.basePath;
					setQueueScanResults((prev) => ({
						...prev,
						[basePath]: {
							result: updated.data,
							editableData: updated.data,
							scanId: updated.id,
							persistedSignature: updatedSignature,
							imagePath: updated.imagePath,
							processedImagePath: updated.processedImagePath,
							purchaseDate: updated.purchaseDate ?? prev[basePath]?.purchaseDate,
							createdAt: updated.createdAt ?? prev[basePath]?.createdAt,
						},
					}));
				}

				const isStillActive =
					tabMemoryRef.current.activeBasePath === context.basePath &&
					tabMemoryRef.current.selectedScanId === context.scanId;

				if (isStillActive) {
					lastPersistedSignatureRef.current = updatedSignature;
					if (!editableData || updatedSignature !== receiptDataSignature(editableData)) {
						setEditableData(updated.data);
						setEditorValue(toEditableJson(updated.data));
					}
					setSelectedScanId(updated.id);
					if (options?.successMessage !== null) {
						addToast({ type: 'success', title: options?.successMessage ?? 'Saved', duration: 2000 });
					}
				}
			} catch (err) {
				if (
					context.basePath != null &&
					tabMemoryRef.current.activeBasePath === context.basePath &&
					tabMemoryRef.current.selectedScanId === context.scanId
				) {
					setTabMemory(tabId, (prev) => ({
						...prev,
						queueErrors: { ...(prev.queueErrors ?? {}), [context.basePath!]: parseTauriError(err) },
					}));
				}
			}
		},
		[editableData, getPersistablePaths, applyOptimistic, setQueueScanResults, setSelectedScanId, addToast, getWriteOwner, tabId, setTabMemory, setEditableData, setEditorValue],
	);
	persistSelectedScanRef.current = persistSelectedScan;

	// ── initFromRecord ────────────────────────────────────────────────────────
	const initFromRecord = useCallback(
		(record: ReceiptScanRecord, options?: { merge?: boolean }) => {
			acquireWriteLock(tabId, record.id);
			const signature = receiptDataSignature(record.data);
			const path = record.imagePath;
			const newEntry: TabMemoryScanResult | undefined = path
				? {
					result: record.data, editableData: record.data, scanId: record.id,
					persistedSignature: signature, imagePath: record.imagePath,
					processedImagePath: record.processedImagePath,
					purchaseDate: record.purchaseDate, createdAt: record.createdAt,
				}
				: undefined;

			if (options?.merge) {
				setTabMemory(tabId, (prev) => ({
					...prev,
					imageQueue: path && !prev.imageQueue.includes(path) ? [...prev.imageQueue, path] : prev.imageQueue,
					queueScanResults: path && newEntry && !prev.queueScanResults[path]
						? { ...prev.queueScanResults, [path]: newEntry }
						: prev.queueScanResults,
					selectedScanId: record.id,
					activeBasePath: path ?? null,
					receiptBasePathMap: path && !prev.receiptBasePathMap?.[record.id]
						? { ...(prev.receiptBasePathMap ?? {}), [record.id]: path }
						: prev.receiptBasePathMap,
				}));
			} else {
				setTabMemory(tabId, (prev) => ({
					...prev,
					imageQueue: path ? [path] : [],
					queueEdits: {},
					queueScanResults: path && newEntry ? { [path]: newEntry } : {},
					jobKeys: {},
					selectedScanId: record.id,
					activeBasePath: path ?? null,
				}));
			}

			setIsHydratingSelection(true);
			setCategorizeError(null);
			setEditableData(record.data);
			lastPersistedSignatureRef.current = signature;
			setPreviewFromPath(record.processedImagePath ?? record.imagePath);
			setEditorValue(toEditableJson(record.data));
			setEditorTab('table');
			setPurchaseDate(record.purchaseDate ?? record.createdAt.split(/[T ]/)[0]);
			setCreatedAt(record.createdAt ?? null);
			setTimeout(() => setIsHydratingSelection(false), 0);
		},
		[setTabMemory, tabId, setPreviewFromPath, acquireWriteLock, setEditableData, setEditorValue, setEditorTab, setPurchaseDate, setCreatedAt],
	);

	// ── Mount effect: restore preview from tab memory ─────────────────────────
	useEffect(() => {
		const mem = tabMemoryRef.current;
		const bp = mem.activeBasePath;
		if (!bp) return;
		const editedPath = mem.queueEdits[bp];
		const saved = mem.queueScanResults[bp];
		const previewTarget = saved?.processedImagePath ?? editedPath ?? bp;
		setPreviewPath(previewTarget);
		setPreviewSourceKind('path');
		setPreviewSrc(convertFileSrc(previewTarget));
		if (saved?.persistedSignature) lastPersistedSignatureRef.current = saved.persistedSignature;
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []); // intentional: runs once on mount

	// ── Sync display state when TabMemory updates the active scan result ──────
	const savedResultForActive = queueScanResults[baseImagePath ?? ''];
	useEffect(() => {
		if (!savedResultForActive || !baseImagePath) return;
		if (isHydratingSelection) return;
		if (editableData && receiptDataSignature(editableData) !== lastPersistedSignatureRef.current) return;
		const incomingSignature = savedResultForActive.persistedSignature;
		if (incomingSignature === lastPersistedSignatureRef.current) return;
		setEditableData(savedResultForActive.editableData);
		setEditorValue(toEditableJson(savedResultForActive.editableData));
		lastPersistedSignatureRef.current = incomingSignature;
		if (savedResultForActive.createdAt) setCreatedAt(savedResultForActive.createdAt);
		const defaultDate = savedResultForActive.purchaseDate ?? savedResultForActive.createdAt?.split(/[T ]/)[0] ?? null;
		if (defaultDate && !purchaseDateRef.current) {
			setPurchaseDate(defaultDate);
			const scanId = savedResultForActive.scanId;
			if (scanId != null) {
				void TauriApi.updateReceiptPurchaseDate(scanId, defaultDate);
				const cached = getReceipt(scanId);
				if (cached) applyOptimistic({ ...cached, purchaseDate: defaultDate });
			}
		}
	}, [savedResultForActive, baseImagePath, isHydratingSelection, editableData, getReceipt, applyOptimistic, setEditableData, setEditorValue, setCreatedAt, setPurchaseDate]);

	// ── Detect categorize errors from the jobs map ────────────────────────────
	const activeCatJob = useMemo(() => {
		if (!activeJobKey || !/^\d+$/.test(activeJobKey)) return undefined;
		return jobs.get(activeJobKey);
	}, [activeJobKey, jobs]);

	useEffect(() => {
		if (activeCatJob?.phase === 'error') setCategorizeError(activeCatJob.error ?? 'Categorization failed');
	}, [activeCatJob?.phase, activeCatJob?.error]);

	// ── Auto-dismiss queue warning ─────────────────────────────────────────────
	useEffect(() => {
		if (!queueWarningMsg) return;
		const timer = window.setTimeout(() => setQueueWarningMsg(null), QUEUE_WARNING_DURATION_MS);
		return () => window.clearTimeout(timer);
	}, [queueWarningMsg]);

	// ── Clear per-receipt categorize state on image change ────────────────────
	useEffect(() => {
		setCategorizeError(null);
	}, [baseImagePath]);

	// ── Sync external scan cancellations (widget cancel button) ──────────────
	useEffect(() => {
		if (activeScanTaskStatus !== 'cancelling') return;
		const bp = tabMemoryRef.current.activeBasePath;
		if (!bp) return;
		if (tabMemoryRef.current.cancellingPaths?.has(bp)) return;
		setTabMemory(tabId, (prev) => {
			const nextResults = { ...prev.queueScanResults };
			delete nextResults[bp];
			const nextCancelling = new Set(prev.cancellingPaths ?? []);
			nextCancelling.add(bp);
			return { ...prev, queueScanResults: nextResults, cancellingPaths: nextCancelling };
		});
		lastPersistedSignatureRef.current = null;
		setEditableData(null);
		setEditorValue('');
	}, [activeScanTaskStatus, tabId, setTabMemory, setEditableData, setEditorValue]);

	// ── Sync external categorize cancellations ────────────────────────────────
	useEffect(() => {
		if (activeCatTaskStatus !== 'cancelling') return;
		const bp = tabMemoryRef.current.activeBasePath;
		if (!bp) return;
		const jkey = tabMemoryRef.current.jobKeys[bp];
		if (!jkey || !/^\d+$/.test(jkey)) return;
		setTabMemory(tabId, (prev) => {
			const n = { ...prev.jobKeys };
			delete n[bp];
			return { ...prev, jobKeys: n };
		});
	}, [activeCatTaskStatus, tabId, setTabMemory]);

	// ── Sync local display state when baseImagePath advances ──────────────────
	const prevBaseImagePathRef = useRef<string | null>(baseImagePath);
	useEffect(() => {
		if (baseImagePath === prevBaseImagePathRef.current) return;
		prevBaseImagePathRef.current = baseImagePath;
		if (!baseImagePath) return;
		imageQueue_.restoreActiveImage(baseImagePath);
	}, [baseImagePath, imageQueue_.restoreActiveImage]); // eslint-disable-line react-hooks/exhaustive-deps

	// ── Auto-save debounce ────────────────────────────────────────────────────
	useEffect(() => {
		const activeScanId = selectedScanId;
		if (activeScanId == null || !editableData || isHydratingSelection) return;
		if (!pendingUserEditRef.current) return;
		pendingUserEditRef.current = false;
		const capturedContext = {
			basePath: tabMemoryRef.current.activeBasePath,
			imagePath: imagePathRef.current,
			processedImagePath: processedImagePathRef.current,
			scanId: activeScanId,
		};
		const timer = window.setTimeout(() => {
			void persistSelectedScan(editableData, capturedContext);
		}, 500);
		return () => window.clearTimeout(timer);
	}, [editableData, isHydratingSelection, persistSelectedScan, selectedScanId]);

	return {
		saveSuccessMsg,
		imagePath,
		baseImagePath,
		imageQueue,
		queueEdits,
		queueWarningMsg,
		processedImagePath,
		previewSrc,
		previewPath,
		previewSourceKind,
		previewErrorMsg,
		isEditorOpen,
		editorSrc,
		editorPath,
		status,
		result,
		errorMsg,
		selectedScanId,
		isUpdating,
		isHydratingSelection,
		editableData,
		editorValue,
		editorTab,
		perImageScanStatus,
		queueScanResults,
		perImageCategorizeStatus,
		isScanQueued,
		activeJobKey,
		categorizeError,
		purchaseDate,
		createdAt,
		initFromRecord,
		fallbackToBlobPreview,
		setEditorTab,
		...editorData,
		...imageQueue_,
		...scanJob,
		...cropEditor,
		...dateMeta,
	};
}
