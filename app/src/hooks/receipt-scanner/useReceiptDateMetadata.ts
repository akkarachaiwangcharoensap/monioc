import { useCallback } from 'react';
import { TauriApi } from '../../services/api';
import type { ReceiptScanRecord } from '../../types';
import type { ScanReceiptRefs, SetQueueScanResultsFn, AddToastFn } from './scanReceiptTypes';

interface DateMetadataParams {
	refs: ScanReceiptRefs;
	getReceipt: (id: number) => ReceiptScanRecord | undefined;
	applyOptimistic: (r: ReceiptScanRecord) => void;
	setQueueScanResults: SetQueueScanResultsFn;
	setPurchaseDate: (d: string | null) => void;
	setCreatedAt: (d: string | null) => void;
	addToast: AddToastFn;
}

export interface UseReceiptDateMetadataResult {
	updatePurchaseDate: (date: string | null) => Promise<void>;
	updateCreatedAt: (date: string) => Promise<void>;
}

/**
 * Manages receipt date metadata (purchase date, created-at).
 * Each update optimistically reflects in the receipt cache and tab memory
 * before the IPC call completes.
 */
export function useReceiptDateMetadata({
	refs,
	getReceipt,
	applyOptimistic,
	setQueueScanResults,
	setPurchaseDate,
	setCreatedAt,
	addToast,
}: DateMetadataParams): UseReceiptDateMetadataResult {
	const updatePurchaseDate = useCallback(async (date: string | null) => {
		const id = refs.tabMemoryRef.current.selectedScanId;
		if (id === null) return;
		const existing = getReceipt(id);
		if (existing) applyOptimistic({ ...existing, purchaseDate: date });
		await TauriApi.updateReceiptPurchaseDate(id, date);
		setPurchaseDate(date);
		const bp = refs.tabMemoryRef.current.activeBasePath;
		if (bp) {
			setQueueScanResults((prev) => {
				const current = prev[bp];
				if (!current) return prev;
				return { ...prev, [bp]: { ...current, purchaseDate: date } };
			});
		}
		addToast({ type: 'success', title: 'Saved', duration: 2000 });
	}, [refs, getReceipt, applyOptimistic, setQueueScanResults, setPurchaseDate, addToast]);

	const updateCreatedAt = useCallback(async (date: string) => {
		const id = refs.tabMemoryRef.current.selectedScanId;
		if (id === null) return;
		const existing = getReceipt(id);
		if (existing) applyOptimistic({ ...existing, createdAt: date });
		await TauriApi.updateReceiptCreatedAt(id, date);
		setCreatedAt(date);
		const bp = refs.tabMemoryRef.current.activeBasePath;
		if (bp) {
			setQueueScanResults((prev) => {
				const current = prev[bp];
				if (!current) return prev;
				return { ...prev, [bp]: { ...current, createdAt: date } };
			});
		}
		addToast({ type: 'success', title: 'Saved', duration: 2000 });
	}, [refs, getReceipt, applyOptimistic, setQueueScanResults, setCreatedAt, addToast]);

	return { updatePurchaseDate, updateCreatedAt };
}
