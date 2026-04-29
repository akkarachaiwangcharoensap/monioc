import { useCallback } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { SUPPORTED_IMAGE_EXTENSIONS } from '../../constants';
import { isAllowedImagePath, removeEdit } from '../../utils/receipt-scanner/queueUtils';
import { resolveReceiptImageState } from '../../utils/receipt-scanner/receiptSession';
import { resolveScanSourcePath } from '../../utils/receipt-scanner/scanSource';
import { toEditableJson } from '../../utils/receipt-scanner/receiptData';
import { TauriApi } from '../../services/api';
import { parseTauriError } from '../../services/errors';
import type { EditorTab } from '../../types';
import type {
	ScanReceiptRefs,
	SetImageQueueFn,
	SetQueueEditsFn,
	SetQueueScanResultsFn,
} from './scanReceiptTypes';

type SetTabMemoryFn = (
	tabId: string,
	updater: (prev: import('../../types').TabMemory) => import('../../types').TabMemory,
) => void;

interface ImageQueueParams {
	tabId: string;
	categories: string[];
	refs: ScanReceiptRefs;
	imagePath: string | null;
	setImageQueue: SetImageQueueFn;
	setQueueEdits: SetQueueEditsFn;
	setQueueScanResults: SetQueueScanResultsFn;
	setBaseImagePath: (p: string | null) => void;
	setSelectedScanId: (id: number | null) => void;
	storeJobKey: (basePath: string, jobKey: string) => void;
	setTabMemory: SetTabMemoryFn;
	setQueueWarningMsg: (v: string | null) => void;
	setEditableData: (d: import('../../types').ReceiptData | null) => void;
	setEditorValue: (v: string) => void;
	setEditorTab: (t: EditorTab) => void;
	setCreatedAt: (d: string | null) => void;
	setPurchaseDate: (d: string | null) => void;
	setCategorizeError: (v: string | null) => void;
	setPreviewFromPath: (path: string) => void;
	setPreviewSrc: (v: string | null) => void;
	setPreviewPath: (v: string | null) => void;
	setPreviewErrorMsg: (v: string | null) => void;
	revokePreviewObjectUrl: () => void;
	editableData: import('../../types').ReceiptData | null;
}

export interface UseReceiptImageQueueResult {
	restoreActiveImage: (path: string) => void;
	submitScanForPath: (basePath: string, opts?: { withAutoCat?: boolean }) => void;
	pickReceiptImage: () => Promise<void>;
	addImagesToQueue: (paths: string[], activateFirst?: boolean, options?: { noAutoScan?: boolean }) => void;
	activateQueueImage: (path: string) => void;
	removeFromQueue: (path: string) => void;
	revertToOriginal: () => void;
}

/**
 * Manages image queue lifecycle: picking, adding, activating, removing,
 * reverting, and batch-submitting scan jobs to the Rust worker.
 */
export function useReceiptImageQueue({
	tabId,
	categories,
	refs,
	imagePath,
	setImageQueue,
	setQueueEdits,
	setQueueScanResults,
	setBaseImagePath,
	setSelectedScanId,
	storeJobKey,
	setTabMemory,
	setQueueWarningMsg,
	setEditableData,
	setEditorValue,
	setEditorTab,
	setCreatedAt,
	setPurchaseDate,
	setCategorizeError,
	setPreviewFromPath,
	setPreviewSrc,
	setPreviewPath,
	setPreviewErrorMsg,
	revokePreviewObjectUrl,
	editableData,
}: ImageQueueParams): UseReceiptImageQueueResult {
	const restoreActiveImage = useCallback((path: string) => {
		const mem = refs.tabMemoryRef.current;
		const saved = mem.queueScanResults[path];
		const resolved = resolveReceiptImageState(path, mem.queueEdits, saved);

		setCategorizeError(null);

		if (mem.activeBasePath !== path) setBaseImagePath(path);
		setPreviewFromPath(resolved.previewPath);

		const isCancelling = mem.cancellingPaths?.has(path);
		if (saved && !isCancelling) {
			setEditableData(saved.editableData);
			setSelectedScanId(saved.scanId);
			setEditorValue(toEditableJson(saved.editableData));
			setEditorTab('table');
			refs.lastPersistedSignatureRef.current = saved.persistedSignature;
			setCreatedAt(saved.createdAt ?? null);
			setPurchaseDate(saved.purchaseDate ?? saved.createdAt?.split(/[T ]/)[0] ?? null);
		} else {
			setEditableData(null);
			setSelectedScanId(saved?.scanId ?? null);
			setEditorValue('');
			setEditorTab('table');
			refs.lastPersistedSignatureRef.current = null;
			setCreatedAt(null);
			setPurchaseDate(null);
		}
	}, [refs, setCategorizeError, setBaseImagePath, setPreviewFromPath, setEditableData, setSelectedScanId, setEditorValue, setEditorTab, setCreatedAt, setPurchaseDate]);

	const submitScanForPath = useCallback((basePath: string, opts?: { withAutoCat?: boolean }) => {
		const existingKey = refs.tabMemoryRef.current.jobKeys[basePath];
		if (existingKey && !/^\d+$/.test(existingKey)) {
			const existingError = refs.tabMemoryRef.current.queueErrors?.[basePath];
			const existingResult = refs.tabMemoryRef.current.queueScanResults[basePath];
			if (!existingError && !existingResult) return;
		}

		const scanSourcePath = resolveScanSourcePath(basePath, basePath, refs.tabMemoryRef.current.queueEdits);
		if (!scanSourcePath) return;

		setTabMemory(tabId, (prev) => {
			const nextResults = { ...prev.queueScanResults };
			delete nextResults[basePath];
			const nextErrors = { ...(prev.queueErrors ?? {}) };
			delete nextErrors[basePath];
			return { ...prev, queueScanResults: nextResults, queueErrors: nextErrors, jobKeys: { ...prev.jobKeys, [basePath]: scanSourcePath } };
		});

		void TauriApi.scanReceipt({
			imagePath: scanSourcePath,
			receiptId: null,
			withAutoCat: opts?.withAutoCat ?? false,
			categories,
		}).then((jobKey) => {
			const currentKey = refs.tabMemoryRef.current.jobKeys[basePath];
			if (!currentKey || !/^\d+$/.test(currentKey)) storeJobKey(basePath, jobKey);
		}).catch((err) => {
			setTabMemory(tabId, (prev) => {
				const n = { ...prev.jobKeys };
				delete n[basePath];
				return { ...prev, jobKeys: n, queueErrors: { ...(prev.queueErrors ?? {}), [basePath]: parseTauriError(err) } };
			});
		});
	}, [tabId, categories, refs, storeJobKey, setTabMemory]);

	const pickReceiptImage = useCallback(async () => {
		const selected = await open({
			title: 'Select receipt image(s)',
			filters: [{ name: 'Images', extensions: [...SUPPORTED_IMAGE_EXTENSIONS] }],
			multiple: true,
		});
		if (!selected) return;
		const paths = Array.isArray(selected) ? selected : [selected];
		if (paths.length === 0) return;
		setQueueEdits({});
		setQueueScanResults({});
		setImageQueue(paths);
		setBaseImagePath(paths[0]);
		setPreviewFromPath(paths[0]);
		setEditableData(null);
		setSelectedScanId(null);
	}, [setPreviewFromPath, setImageQueue, setQueueEdits, setQueueScanResults, setBaseImagePath, setSelectedScanId, setEditableData]);

	const addImagesToQueue = useCallback(
		(paths: string[], activateFirst = false, options?: { noAutoScan?: boolean }) => {
			const imagePaths = paths.filter(isAllowedImagePath);
			const unsupportedCount = paths.length - imagePaths.length;

			if (imagePaths.length === 0) {
				if (unsupportedCount > 0) setQueueWarningMsg('No supported image files found (PNG, JPG, WEBP, BMP).');
				return;
			}

			const currentQueue = refs.tabMemoryRef.current.imageQueue;
			const blockedDuplicatePaths = imagePaths.filter((p) => currentQueue.includes(p));
			const toAdd = imagePaths.filter((p) => !blockedDuplicatePaths.includes(p));
			const firstNew = toAdd[0] ?? null;

			const existingNames = new Set(currentQueue.map((p) => p.split('/').pop()?.toLowerCase()));
			const sameNameCount = toAdd.filter((p) => existingNames.has(p.split('/').pop()?.toLowerCase())).length;
			const dupCount = blockedDuplicatePaths.length;

			const warnParts: string[] = [];
			if (unsupportedCount > 0) warnParts.push(`${unsupportedCount} unsupported file${unsupportedCount > 1 ? 's' : ''} skipped`);
			if (dupCount > 0) warnParts.push(`${dupCount} duplicate${dupCount > 1 ? 's' : ''} already in queue`);
			if (sameNameCount > 0 && sameNameCount !== dupCount) warnParts.push(`${sameNameCount} file${sameNameCount > 1 ? 's have' : ' has'} same name as existing item`);
			if (warnParts.length > 0) setQueueWarningMsg(warnParts.join(' · '));

			if (toAdd.length === 0) return;

			setImageQueue((prev) => {
				const deduped = toAdd.filter((p) => !prev.includes(p));
				return [...prev, ...deduped];
			});

			if (!imagePath) {
				setBaseImagePath(imagePaths[0]);
				setPreviewFromPath(imagePaths[0]);
			} else if (activateFirst && firstNew) {
				setBaseImagePath(firstNew);
				setPreviewFromPath(firstNew);
				setEditableData(null);
				setSelectedScanId(null);
			}

			if (!options?.noAutoScan) {
				for (const path of toAdd) submitScanForPath(path, { withAutoCat: true });
			} else {
				setTabMemory(tabId, (prev) => {
					const nextResults = { ...prev.queueScanResults };
					for (const path of toAdd) delete nextResults[path];
					return { ...prev, queueScanResults: nextResults };
				});
			}
		},
		[tabId, refs, imagePath, setImageQueue, setBaseImagePath, setPreviewFromPath, setSelectedScanId, setQueueWarningMsg, submitScanForPath, setTabMemory, setEditableData],
	);

	const activateQueueImage = useCallback(
		(path: string) => restoreActiveImage(path),
		[restoreActiveImage],
	);

	const removeFromQueue = useCallback((path: string) => {
		let queueAfterRemoval: string[] = [];
		setTabMemory(tabId, (prev) => {
			queueAfterRemoval = prev.imageQueue.filter((p) => p !== path);
			const queueEdits = removeEdit(prev.queueEdits, path);
			const queueScanResults = { ...prev.queueScanResults };
			delete queueScanResults[path];
			const jobKeys = { ...prev.jobKeys };
			delete jobKeys[path];
			return { ...prev, imageQueue: queueAfterRemoval, queueEdits, queueScanResults, jobKeys };
		});

		if (imagePath !== path && refs.tabMemoryRef.current.activeBasePath !== path) return;

		if (queueAfterRemoval.length > 0) {
			restoreActiveImage(queueAfterRemoval[0]);
		} else {
			revokePreviewObjectUrl();
			setBaseImagePath(null);
			setPreviewSrc(null);
			setPreviewPath(null);
			setPreviewErrorMsg(null);
			setEditableData(null);
		}
	}, [tabId, refs, imagePath, restoreActiveImage, revokePreviewObjectUrl, setBaseImagePath, setPreviewSrc, setPreviewPath, setPreviewErrorMsg, setTabMemory, setEditableData]);

	const revertToOriginal = useCallback(() => {
		const bp = refs.tabMemoryRef.current.activeBasePath;
		if (!bp) return;
		setQueueEdits((prev) => removeEdit(prev, bp));
		setQueueScanResults((prev) => {
			const current = prev[bp];
			if (!current) return prev;
			return { ...prev, [bp]: { ...current, processedImagePath: null } };
		});
		setPreviewFromPath(bp);

		const activeScanId = refs.tabMemoryRef.current.selectedScanId;
		if (activeScanId != null && editableData) {
			void refs.persistSelectedScanRef.current(
				editableData,
				{ basePath: bp, imagePath: bp, processedImagePath: null, scanId: activeScanId },
				{ force: true, successMessage: 'Image updated', persistImagePath: bp, persistProcessedImagePath: null },
			);
		}
	}, [refs, editableData, setPreviewFromPath, setQueueEdits, setQueueScanResults]);

	return { restoreActiveImage, submitScanForPath, pickReceiptImage, addImagesToQueue, activateQueueImage, removeFromQueue, revertToOriginal };
}
