/**
 * useScanPreview — manages image preview state and object-URL lifecycle.
 *
 * Extracted from useScanReceipt to isolate preview rendering concerns
 * (asset-URL vs blob fallback, object-URL cleanup) from scan orchestration.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { readFile } from '@tauri-apps/plugin-fs';

export interface UseScanPreviewResult {
	previewSrc: string | null;
	previewPath: string | null;
	previewSourceKind: 'path' | 'blob';
	previewErrorMsg: string | null;
	setPreviewFromPath: (path: string | null) => void;
	fallbackToBlobPreview: (path: string | null) => Promise<void>;
	revokePreviewObjectUrl: () => void;
	/** Direct setter — used when restoring from tab memory or clearing state. */
	setPreviewSrc: React.Dispatch<React.SetStateAction<string | null>>;
	setPreviewPath: React.Dispatch<React.SetStateAction<string | null>>;
	setPreviewSourceKind: React.Dispatch<React.SetStateAction<'path' | 'blob'>>;
	setPreviewErrorMsg: React.Dispatch<React.SetStateAction<string | null>>;
}

export function useScanPreview(): UseScanPreviewResult {
	const [previewSrc, setPreviewSrc] = useState<string | null>(null);
	const [previewPath, setPreviewPath] = useState<string | null>(null);
	const [previewSourceKind, setPreviewSourceKind] = useState<'path' | 'blob'>('path');
	const [previewErrorMsg, setPreviewErrorMsg] = useState<string | null>(null);
	const previewObjectUrlRef = useRef<string | null>(null);

	const revokePreviewObjectUrl = useCallback(() => {
		if (previewObjectUrlRef.current) {
			URL.revokeObjectURL(previewObjectUrlRef.current);
			previewObjectUrlRef.current = null;
		}
	}, []);

	// Cleanup on unmount
	useEffect(() => {
		return () => { revokePreviewObjectUrl(); };
	}, [revokePreviewObjectUrl]);

	const setPreviewFromPath = useCallback(
		(path: string | null) => {
			revokePreviewObjectUrl();
			setPreviewErrorMsg(null);
			setPreviewPath(path);
			setPreviewSourceKind('path');
			setPreviewSrc(path ? convertFileSrc(path) : null);
		},
		[revokePreviewObjectUrl],
	);

	const fallbackToBlobPreview = useCallback(
		async (path: string | null) => {
			if (!path) return;
			try {
				const bytes = await readFile(path);
				const ext = path.split('.').pop()?.toLowerCase();
				const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
				const blob = new Blob([bytes], { type: mime });
				const objectUrl = URL.createObjectURL(blob);
				revokePreviewObjectUrl();
				previewObjectUrlRef.current = objectUrl;
				setPreviewSourceKind('blob');
				setPreviewSrc(objectUrl);
				setPreviewErrorMsg(null);
			} catch {
				setPreviewErrorMsg(
					'Preview unavailable: the saved image file could not be opened. Re-scan to attach a new file.',
				);
			}
		},
		[revokePreviewObjectUrl],
	);

	return {
		previewSrc,
		previewPath,
		previewSourceKind,
		previewErrorMsg,
		setPreviewFromPath,
		fallbackToBlobPreview,
		revokePreviewObjectUrl,
		setPreviewSrc,
		setPreviewPath,
		setPreviewSourceKind,
		setPreviewErrorMsg,
	};
}
