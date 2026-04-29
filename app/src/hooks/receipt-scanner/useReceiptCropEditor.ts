import { useCallback } from 'react';
import { readFile } from '@tauri-apps/plugin-fs';
import type { ReceiptData } from '../../types';
import type {
	ScanReceiptRefs,
	SetQueueEditsFn,
	SetQueueScanResultsFn,
	AddToastFn,
} from './scanReceiptTypes';

interface CropEditorParams {
	refs: ScanReceiptRefs;
	editorSrc: string | null;
	setIsEditorOpen: (v: boolean) => void;
	setEditorSrc: (v: string | null) => void;
	setEditorPath: (v: string | null) => void;
	setPreviewFromPath: (path: string) => void;
	setQueueEdits: SetQueueEditsFn;
	setQueueScanResults: SetQueueScanResultsFn;
	editableData: ReceiptData | null;
	addToast: AddToastFn;
}

export interface UseReceiptCropEditorResult {
	openEditorForPath: (path: string) => Promise<void>;
	handleEditorApply: (newPath: string) => void;
	handleEditorCancel: () => void;
}

/**
 * Manages the crop-editor lifecycle: opening, applying a cropped result,
 * and cancelling without changes.
 *
 * Applies the crop result optimistically by updating TabMemory's queueEdits
 * and firing a deferred persist via persistSelectedScanRef if a scan exists.
 */
export function useReceiptCropEditor({
	refs,
	editorSrc,
	setIsEditorOpen,
	setEditorSrc,
	setEditorPath,
	setPreviewFromPath,
	setQueueEdits,
	setQueueScanResults,
	editableData,
	addToast,
}: CropEditorParams): UseReceiptCropEditorResult {
	const openEditorForPath = useCallback(async (path: string) => {
		const bytes = await readFile(path);
		const ext = path.split('.').pop()?.toLowerCase();
		const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
		const blob = new Blob([bytes], { type: mime });
		const url = URL.createObjectURL(blob);
		setEditorSrc(url);
		setEditorPath(path);
		setIsEditorOpen(true);
	}, [setEditorSrc, setEditorPath, setIsEditorOpen]);

	const handleEditorApply = useCallback((newPath: string) => {
		setIsEditorOpen(false);
		if (editorSrc) URL.revokeObjectURL(editorSrc);
		setEditorSrc(null);
		setEditorPath(null);
		setPreviewFromPath(newPath);

		const bp = refs.tabMemoryRef.current.activeBasePath;
		if (bp) {
			setQueueEdits((prev) => ({ ...prev, [bp]: newPath }));
			setQueueScanResults((prev) => {
				const current = prev[bp];
				if (!current) return prev;
				return {
					...prev,
					[bp]: {
						...current,
						imagePath: current.imagePath ?? bp,
						processedImagePath: newPath,
					},
				};
			});
		}

		const activeScanId = refs.tabMemoryRef.current.selectedScanId;
		addToast({
			type: 'success',
			title: activeScanId != null ? 'Image updated' : 'Image ready to scan',
			duration: 2000,
		});

		if (bp && activeScanId != null && editableData) {
			void refs.persistSelectedScanRef.current(
				editableData,
				{ basePath: bp, imagePath: newPath, processedImagePath: null, scanId: activeScanId },
				{ force: true, successMessage: 'Image updated', persistImagePath: bp, persistProcessedImagePath: newPath },
			);
		}
	}, [refs, editorSrc, editableData, setIsEditorOpen, setEditorSrc, setEditorPath, setPreviewFromPath, setQueueEdits, setQueueScanResults, addToast]);

	const handleEditorCancel = useCallback(() => {
		setIsEditorOpen(false);
		if (editorSrc) URL.revokeObjectURL(editorSrc);
		setEditorSrc(null);
		setEditorPath(null);
	}, [editorSrc, setIsEditorOpen, setEditorSrc, setEditorPath]);

	return { openEditorForPath, handleEditorApply, handleEditorCancel };
}
