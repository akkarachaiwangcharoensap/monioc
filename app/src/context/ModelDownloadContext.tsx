import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import type React from 'react';
import { TauriApi } from '../services/api';
import type { ModelStatus, ModelDownloadProgress } from '../services/api';

export interface ModelDownloadContextValue {
	checking: boolean;
	modelStatus: ModelStatus | null;
	/** True once both OCR and LLM models are confirmed present on disk. */
	allModelsReady: boolean;
	downloading: boolean;
	/** True for the duration of the async handleCancel call — set before any await. */
	cancelling: boolean;
	progress: ModelDownloadProgress | null;
	removing: boolean;
	error: string | null;
	handleDownload: () => Promise<void>;
	handleCancel: () => Promise<void>;
	handleRemove: () => Promise<void>;
	clearError: () => void;
	recheckStatus: () => void;
}

const ModelDownloadContext = createContext<ModelDownloadContextValue | null>(null);

/**
 * Global provider that owns AI model download state.
 *
 * Mounting this at the app root (above the router) means the download survives
 * route changes — the Tauri/Python process keeps running and progress polling
 * continues even when the user navigates away from receipt pages.
 */
export function ModelDownloadProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
	const [modelStatus, setModelStatus] = useState<ModelStatus | null>(null);
	const [checking, setChecking] = useState(true);
	const [downloading, setDownloading] = useState(false);
	const [cancelling, setCancelling] = useState(false);
	const [removing, setRemoving] = useState(false);
	const [progress, setProgress] = useState<ModelDownloadProgress | null>(null);
	const [error, setError] = useState<string | null>(null);
	const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const cancelledRef = useRef(false);

	const recheckStatus = useCallback(() => {
		setChecking(true);
		TauriApi.checkModelStatus()
			.then((s) => { setModelStatus(s); setChecking(false); })
			.catch(() => { setChecking(false); });
	}, []);

	// Initial status check on app startup
	useEffect(() => {
		let cancelled = false;
		TauriApi.checkModelStatus()
			.then((s) => { if (!cancelled) { setModelStatus(s); setChecking(false); } })
			.catch(() => { if (!cancelled) setChecking(false); });
		return () => { cancelled = true; };
	}, []);

	// Poll disk progress while downloading (400 ms for snappy updates)
	useEffect(() => {
		if (!downloading) {
			if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
			return;
		}
		const poll = () => {
			TauriApi.modelDownloadProgress()
				.then(setProgress)
				.catch(() => { /* polling failure is non-fatal */ });
		};
		poll(); // immediate first hit
		pollRef.current = setInterval(poll, 400);
		return () => {
			if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
		};
	}, [downloading]);

	const handleDownload = useCallback(async () => {
		setDownloading(true);
		setProgress(null);
		setError(null);
		cancelledRef.current = false;
		try {
			const result = await TauriApi.downloadModels();
			if (!cancelledRef.current) {
				setModelStatus(result);
				if (!result.ocr || !result.llm) {
					setError(result.error?.trim() || 'Download failed. Please check your internet connection and try again.');
				}
			}
		} catch (e) {
			if (!cancelledRef.current) {
				const detail = e instanceof Error ? e.message : (typeof e === 'string' ? e : '');
				setError(detail.trim() || 'Download failed. Please check your internet connection and try again.');
			}
		} finally {
			setDownloading(false);
			setProgress(null);
		}
	}, []);

	const handleCancel = useCallback(async () => {
		// Signal cancelling state immediately — before any await — so the task
		// manager widget can transition to 'Cancelling…' without delay whether
		// cancel was triggered from the banner or the task widget.
		setCancelling(true);
		cancelledRef.current = true;
		try { await TauriApi.cancelModelDownload(); } catch { /* best effort */ }
		setDownloading(false);
		setProgress(null);
		// Remove partially-downloaded files so the user gets a clean slate
		// and the banner correctly shows "AI models required" again.
		try { await TauriApi.removeModels(); } catch { /* best effort */ }
		setModelStatus({ ocr: false, llm: false });
		setCancelling(false);
	}, []);

	const handleRemove = useCallback(async () => {
		setRemoving(true);
		setError(null);
		try {
			await TauriApi.removeModels();
			setModelStatus({ ocr: false, llm: false });
		} catch {
			setError('Failed to remove models.');
		} finally {
			setRemoving(false);
		}
	}, []);

	const value: ModelDownloadContextValue = {
		checking,
		modelStatus,
		allModelsReady: !!(modelStatus?.ocr && modelStatus?.llm),
		downloading,
		cancelling,
		progress,
		removing,
		error,
		handleDownload,
		handleCancel,
		handleRemove,
		clearError: () => setError(null),
		recheckStatus,
	};

	return (
		<ModelDownloadContext.Provider value={value}>
			{children}
		</ModelDownloadContext.Provider>
	);
}

export function useModelDownload(): ModelDownloadContextValue {
	const ctx = useContext(ModelDownloadContext);
	if (!ctx) throw new Error('useModelDownload must be used within a ModelDownloadProvider');
	return ctx;
}
