import { resolveEditedPath } from './queueUtils';

export interface StoredReceiptImageState {
	imagePath: string | null;
	processedImagePath: string | null;
}

export interface ResolvedReceiptImageState {
	imagePath: string;
	processedImagePath: string | null;
	previewPath: string;
	hasTemporaryEdit: boolean;
}

export function getReceiptFallbackName(imagePath: string | null | undefined): string {
	if (!imagePath) return 'Receipt';
	const fileName = imagePath.split(/[\\/]/).pop() ?? '';
	const withoutExtension = fileName.replace(/\.[^.]+$/, '');
	const cleaned = withoutExtension.replace(/[_-]+/g, ' ').trim();
	return cleaned || 'Receipt';
}

export function getReceiptDisplayName(
	displayName: string | null | undefined,
	imagePath: string | null | undefined,
): string {
	return displayName?.trim() || getReceiptFallbackName(imagePath);
}

export function resolveReceiptImageState(
	basePath: string,
	edits: Record<string, string>,
	saved?: StoredReceiptImageState,
): ResolvedReceiptImageState {
	const editedPath = resolveEditedPath(basePath, edits);
	if (editedPath !== basePath) {
		return {
			imagePath: editedPath,
			processedImagePath: null,
			previewPath: editedPath,
			hasTemporaryEdit: true,
		};
	}

	const restoredImagePath = saved?.imagePath ?? basePath;
	const restoredProcessedImagePath = saved?.processedImagePath ?? null;

	return {
		imagePath: restoredImagePath,
		processedImagePath: restoredProcessedImagePath,
		previewPath: restoredProcessedImagePath ?? restoredImagePath,
		hasTemporaryEdit: false,
	};
}