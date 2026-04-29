/**
 * Internal shared types for useScanReceipt sub-hooks.
 * Not exported from the package — only used for the facade decomposition.
 */
import type { MutableRefObject } from 'react';
import type { TabMemory, TabMemoryScanResult, ReceiptData } from '../../types';
import type { ToastItem } from '../../context/ToastContext';

export type AddToastFn = (options: Omit<ToastItem, 'id'>) => string;

export type QueueScanResultsUpdater =
	| Record<string, TabMemoryScanResult>
	| ((prev: Record<string, TabMemoryScanResult>) => Record<string, TabMemoryScanResult>);

export type SetQueueScanResultsFn = (updater: QueueScanResultsUpdater) => void;

export type QueueEditsUpdater =
	| Record<string, string>
	| ((prev: Record<string, string>) => Record<string, string>);

export type SetQueueEditsFn = (updater: QueueEditsUpdater) => void;

export type SetImageQueueFn = (updater: string[] | ((prev: string[]) => string[])) => void;

export interface PersistSelectionContext {
	basePath: string | null;
	imagePath: string | null;
	processedImagePath: string | null;
	scanId: number;
}

export interface PersistSelectionOptions {
	force?: boolean;
	successMessage?: string | null;
	persistImagePath?: string | null;
	persistProcessedImagePath?: string | null;
}

export type PersistSelectedScanFn = (
	nextData: ReceiptData,
	context: PersistSelectionContext,
	options?: PersistSelectionOptions,
) => Promise<void>;

/** Refs that are stable across renders and shared between sub-hooks. */
export interface ScanReceiptRefs {
	tabMemoryRef: MutableRefObject<TabMemory>;
	lastPersistedSignatureRef: MutableRefObject<string | null>;
	persistSelectedScanRef: MutableRefObject<PersistSelectedScanFn>;
	imagePathRef: MutableRefObject<string | null>;
	processedImagePathRef: MutableRefObject<string | null>;
	purchaseDateRef: MutableRefObject<string | null>;
	pendingUserEditRef: MutableRefObject<boolean>;
}
