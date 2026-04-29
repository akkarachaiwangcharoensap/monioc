import { useCallback } from 'react';
import { TauriApi } from '../../services/api';
import { parseTauriError } from '../../services/errors';
import { receiptDataSignature } from '../../utils/receipt-scanner/receiptData';
import { resolveScanSourcePath } from '../../utils/receipt-scanner/scanSource';
import type { ReceiptData } from '../../types';
import type { ScanReceiptRefs, SetQueueScanResultsFn } from './scanReceiptTypes';

type SetTabMemoryFn = (
	tabId: string,
	updater: (prev: import('../../types').TabMemory) => import('../../types').TabMemory,
) => void;

type ApplyEditableDataFn = (next: ReceiptData) => void;

interface ScanJobParams {
	tabId: string;
	categories: string[];
	refs: ScanReceiptRefs;
	editableData: ReceiptData | null;
	storeJobKey: (basePath: string, jobKey: string) => void;
	setTabMemory: SetTabMemoryFn;
	markTaskCancelling: (jobKey: string) => void;
	setEditableData: (d: ReceiptData | null) => void;
	setEditorValue: (v: string) => void;
	setPurchaseDate: (d: string | null) => void;
	setCreatedAt: (d: string | null) => void;
	setCategorizeError: (v: string | null) => void;
	setQueueScanResults: SetQueueScanResultsFn;
	applyEditableData: ApplyEditableDataFn;
}

export interface UseReceiptScanJobResult {
	scan: (opts?: { withAutoCat?: boolean; imagePath?: string; sourceOverride?: string }) => void;
	cancelActiveScan: () => void;
	cancelActiveCategorize: () => void;
	runManualCategorize: () => Promise<void>;
	applyCategorizeResult: (next: ReceiptData, capturedBasePath: string | null, capturedScanId: number | null) => Promise<void>;
}

/**
 * Manages scan and categorize job submission, cancellation, and result application.
 * Coordinates with the Rust job queue via TauriApi and with TabMemory for job key tracking.
 */
export function useReceiptScanJob({
	tabId,
	categories,
	refs,
	editableData,
	storeJobKey,
	setTabMemory,
	markTaskCancelling,
	setEditableData,
	setEditorValue,
	setPurchaseDate,
	setCreatedAt,
	setCategorizeError,
	setQueueScanResults,
	applyEditableData,
}: ScanJobParams): UseReceiptScanJobResult {
	const applyCategorizeResult = useCallback(
		async (next: ReceiptData, capturedBasePath: string | null, capturedScanId: number | null): Promise<void> => {
			const isStillActive = refs.tabMemoryRef.current.activeBasePath === capturedBasePath;
			if (isStillActive) {
				applyEditableData(next);
			} else if (capturedBasePath != null) {
				setQueueScanResults((prev) => {
					const existing = prev[capturedBasePath];
					if (!existing) return prev;
					return { ...prev, [capturedBasePath]: { ...existing, result: next, editableData: next } };
				});
			}
			const scanId = capturedScanId;
			if (scanId == null) return;
			await refs.persistSelectedScanRef.current(
				next,
				{
					basePath: capturedBasePath,
					imagePath: capturedBasePath
						? (refs.tabMemoryRef.current.queueScanResults[capturedBasePath]?.imagePath ?? capturedBasePath)
						: refs.imagePathRef.current,
					processedImagePath: capturedBasePath
						? (refs.tabMemoryRef.current.queueScanResults[capturedBasePath]?.processedImagePath ?? null)
						: refs.processedImagePathRef.current,
					scanId,
				},
				{ successMessage: 'Categories saved' },
			);
		},
		[refs, applyEditableData, setQueueScanResults],
	);

	const scan = useCallback((opts?: { withAutoCat?: boolean; imagePath?: string; sourceOverride?: string }) => {
		const explicitPath = opts?.imagePath;
		const capturedBasePath = explicitPath ?? refs.tabMemoryRef.current.activeBasePath;
		if (!capturedBasePath) return;

		if (!explicitPath) {
			if (!refs.tabMemoryRef.current.imageQueue.includes(capturedBasePath)) return;
			const existingJobKey = refs.tabMemoryRef.current.jobKeys[capturedBasePath];
			if (existingJobKey && !/^\d+$/.test(existingJobKey)) {
				const existingError = refs.tabMemoryRef.current.queueErrors?.[capturedBasePath];
				const existingResult = refs.tabMemoryRef.current.queueScanResults[capturedBasePath];
				if (!existingError && !existingResult) return;
			}
		} else {
			const existingJobKey = refs.tabMemoryRef.current.jobKeys[capturedBasePath];
			if (existingJobKey && !/^\d+$/.test(existingJobKey)) {
				const existingError = refs.tabMemoryRef.current.queueErrors?.[capturedBasePath];
				const existingResult = refs.tabMemoryRef.current.queueScanResults[capturedBasePath];
				if (!existingError && !existingResult) return;
			}
		}

		const savedQueueResult = refs.tabMemoryRef.current.queueScanResults[capturedBasePath];
		const capturedScanSourcePath = opts?.sourceOverride ?? (explicitPath
			? explicitPath
			: resolveScanSourcePath(capturedBasePath, savedQueueResult?.imagePath ?? capturedBasePath, refs.tabMemoryRef.current.queueEdits));
		const withCat = opts?.withAutoCat ?? false;
		if (!capturedScanSourcePath) return;

		if (capturedBasePath) {
			setTabMemory(tabId, (prev) => {
				const nextResults = { ...prev.queueScanResults };
				delete nextResults[capturedBasePath];
				const nextErrors = { ...(prev.queueErrors ?? {}) };
				delete nextErrors[capturedBasePath];
				return { ...prev, queueScanResults: nextResults, queueErrors: nextErrors, jobKeys: { ...prev.jobKeys, [capturedBasePath]: capturedScanSourcePath } };
			});
		}

		refs.lastPersistedSignatureRef.current = null;
		setEditableData(null);
		setEditorValue('');

		if (refs.tabMemoryRef.current.selectedScanId == null) {
			setPurchaseDate(null);
			setCreatedAt(null);
		}

		void TauriApi.scanReceipt({
			imagePath: capturedScanSourcePath,
			receiptId: refs.tabMemoryRef.current.selectedScanId,
			withAutoCat: withCat,
			categories,
		}).then((jobKey) => {
			if (capturedBasePath) {
				const currentKey = refs.tabMemoryRef.current.jobKeys[capturedBasePath];
				if (!currentKey || !/^\d+$/.test(currentKey)) storeJobKey(capturedBasePath, jobKey);
			}
		}).catch((err) => {
			if (capturedBasePath) {
				setTabMemory(tabId, (prev) => {
					const n = { ...prev.jobKeys };
					delete n[capturedBasePath];
					return { ...prev, jobKeys: n, queueErrors: { ...(prev.queueErrors ?? {}), [capturedBasePath]: parseTauriError(err) } };
				});
			}
		});
	}, [tabId, categories, refs, storeJobKey, setTabMemory, setEditableData, setEditorValue, setPurchaseDate, setCreatedAt]);

	const cancelActiveScan = useCallback(() => {
		const bp = refs.tabMemoryRef.current.activeBasePath;
		if (!bp) return;
		const jkey = refs.tabMemoryRef.current.jobKeys[bp];
		if (!jkey) return;

		setTabMemory(tabId, (prev) => {
			const nextResults = { ...prev.queueScanResults };
			delete nextResults[bp];
			const nextCancelling = new Set(prev.cancellingPaths ?? []);
			nextCancelling.add(bp);
			return { ...prev, queueScanResults: nextResults, cancellingPaths: nextCancelling };
		});

		refs.lastPersistedSignatureRef.current = null;
		setEditableData(null);
		setEditorValue('');

		markTaskCancelling(jkey);
		void TauriApi.cancelJob(jkey);
	}, [tabId, refs, setTabMemory, markTaskCancelling, setEditableData, setEditorValue]);

	const cancelActiveCategorize = useCallback(() => {
		const bp = refs.tabMemoryRef.current.activeBasePath;
		if (!bp) return;
		const jkey = refs.tabMemoryRef.current.jobKeys[bp];
		const cancelKey =
			jkey ?? (refs.tabMemoryRef.current.selectedScanId != null ? String(refs.tabMemoryRef.current.selectedScanId) : null);
		if (!cancelKey) return;

		if (jkey) {
			setTabMemory(tabId, (prev) => {
				const n = { ...prev.jobKeys };
				delete n[bp];
				return { ...prev, jobKeys: n };
			});
		}

		markTaskCancelling(cancelKey);
		void TauriApi.cancelJob(cancelKey);
	}, [tabId, refs, setTabMemory, markTaskCancelling]);

	const runManualCategorize = useCallback(async () => {
		const capturedBase = refs.tabMemoryRef.current.activeBasePath;
		const capturedScanId = refs.tabMemoryRef.current.selectedScanId;
		if (!editableData || !capturedScanId) return;

		setCategorizeError(null);

		const itemNames = editableData.rows.map((r) => r.name);
		if (itemNames.every((n) => !n.trim())) return;

		try {
			const jobKey = await TauriApi.inferItemCategories({
				receiptId: capturedScanId,
				items: itemNames,
				categories,
				data: editableData,
			});
			refs.lastPersistedSignatureRef.current = receiptDataSignature(editableData);
			if (capturedBase) storeJobKey(capturedBase, jobKey);
		} catch (err) {
			setCategorizeError(parseTauriError(err));
		}
	}, [refs, editableData, categories, storeJobKey, setCategorizeError]);

	return { scan, cancelActiveScan, cancelActiveCategorize, runManualCategorize, applyCategorizeResult };
}
