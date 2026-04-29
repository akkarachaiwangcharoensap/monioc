import { useCallback } from 'react';
import { makeRow } from '../../domain/receipt';
import type { ReceiptData, EditorTab, TabMemoryScanResult, ReceiptScanRecord } from '../../types';
import {
	receiptDataSignature,
	toEditableJson,
	parseEditableJson,
} from '../../utils/receipt-scanner/receiptData';
import { getDefaultTabMemory } from '../../context/TabMemoryContext';
import type {
	ScanReceiptRefs,
	SetQueueScanResultsFn,
} from './scanReceiptTypes';

type SetTabMemoryFn = (
	tabId: string,
	updater: (prev: import('../../types').TabMemory) => import('../../types').TabMemory,
) => void;

interface EditorDataParams {
	tabId: string;
	refs: ScanReceiptRefs;
	setEditableData: (d: ReceiptData | null) => void;
	setEditorValue: (v: string) => void;
	setEditorTab: (t: EditorTab) => void;
	setQueueScanResults: SetQueueScanResultsFn;
	getReceipt: (id: number) => ReceiptScanRecord | undefined;
	applyOptimistic: (r: ReceiptScanRecord) => void;
	revokePreviewObjectUrl: () => void;
	setPreviewSrc: (v: string | null) => void;
	setPreviewPath: (v: string | null) => void;
	setPreviewErrorMsg: (v: string | null) => void;
	setTabMemory: SetTabMemoryFn;
	releaseWriteLock: (tabId: string, scanId: number) => void;
}

export interface UseReceiptEditorDataResult {
	applyEditableData: (next: ReceiptData) => void;
	onJsonChange: (nextJson: string) => void;
	initBlankEntry: () => void;
	reset: () => void;
}

/**
 * Manages the receipt data editor state: spreadsheet edits, JSON editor,
 * blank entry init, and full reset. All mutations optimistically update
 * TabMemory (queueScanResults) and mark pendingUserEditRef for auto-save.
 */
export function useReceiptEditorData({
	tabId,
	refs,
	setEditableData,
	setEditorValue,
	setEditorTab,
	setQueueScanResults,
	getReceipt,
	applyOptimistic,
	revokePreviewObjectUrl,
	setPreviewSrc,
	setPreviewPath,
	setPreviewErrorMsg,
	setTabMemory,
	releaseWriteLock,
}: EditorDataParams): UseReceiptEditorDataResult {
	const applyEditableData = useCallback((next: ReceiptData) => {
		refs.pendingUserEditRef.current = true;
		setEditableData(next);
		setEditorValue(toEditableJson(next));

		const activeBp = refs.tabMemoryRef.current.activeBasePath;
		const activeScanId = refs.tabMemoryRef.current.selectedScanId;
		if (!activeBp || activeScanId == null) return;

		const cached = getReceipt(activeScanId);
		if (cached) applyOptimistic({ ...cached, data: next });

		setQueueScanResults((prev) => {
			const current = prev[activeBp];
			return {
				...prev,
				[activeBp]: {
					result: next,
					editableData: next,
					scanId: activeScanId,
					persistedSignature: current?.persistedSignature ?? refs.lastPersistedSignatureRef.current ?? receiptDataSignature(next),
					imagePath: current?.imagePath ?? refs.imagePathRef.current,
					processedImagePath: current?.processedImagePath ?? refs.processedImagePathRef.current,
					purchaseDate: current?.purchaseDate,
					createdAt: current?.createdAt,
				} satisfies TabMemoryScanResult,
			};
		});
	}, [refs, getReceipt, applyOptimistic, setEditableData, setEditorValue, setQueueScanResults]);

	const onJsonChange = useCallback((nextJson: string) => {
		refs.pendingUserEditRef.current = true;
		setEditorValue(nextJson);
		try {
			const parsed = parseEditableJson(nextJson);
			setEditableData(parsed);
			const activeBp = refs.tabMemoryRef.current.activeBasePath;
			const activeScanId = refs.tabMemoryRef.current.selectedScanId;
			if (!activeBp || activeScanId == null) return;
			setQueueScanResults((prev) => {
				const current = prev[activeBp];
				return {
					...prev,
					[activeBp]: {
						result: parsed,
						editableData: parsed,
						scanId: activeScanId,
						persistedSignature: current?.persistedSignature ?? refs.lastPersistedSignatureRef.current ?? receiptDataSignature(parsed),
						imagePath: current?.imagePath ?? refs.imagePathRef.current,
						processedImagePath: current?.processedImagePath ?? refs.processedImagePathRef.current,
						purchaseDate: current?.purchaseDate,
						createdAt: current?.createdAt,
					} satisfies TabMemoryScanResult,
				};
			});
		} catch {
			// Hold invalid JSON until the user corrects it.
		}
	}, [refs, setEditableData, setEditorValue, setQueueScanResults]);

	const initBlankEntry = useCallback(() => {
		revokePreviewObjectUrl();
		setTabMemory(tabId, (prev) => ({ ...prev, ...getDefaultTabMemory() }));
		setPreviewSrc(null);
		setPreviewPath(null);
		setPreviewErrorMsg(null);
		const blank: ReceiptData = { rows: [makeRow()] };
		setEditableData(blank);
		setEditorValue(toEditableJson(blank));
		setEditorTab('table');
	}, [tabId, revokePreviewObjectUrl, setPreviewSrc, setPreviewPath, setPreviewErrorMsg, setEditableData, setEditorValue, setEditorTab, setTabMemory]);

	const reset = useCallback(() => {
		const currentScanId = refs.tabMemoryRef.current.selectedScanId;
		if (currentScanId != null) releaseWriteLock(tabId, currentScanId);
		revokePreviewObjectUrl();
		setTabMemory(tabId, (prev) => ({ ...prev, ...getDefaultTabMemory() }));
		setPreviewSrc(null);
		setPreviewPath(null);
		setPreviewErrorMsg(null);
		setEditableData(null);
		setEditorValue('');
	}, [tabId, refs, releaseWriteLock, revokePreviewObjectUrl, setTabMemory, setPreviewSrc, setPreviewPath, setPreviewErrorMsg, setEditableData, setEditorValue]);

	return { applyEditableData, onJsonChange, initBlankEntry, reset };
}
