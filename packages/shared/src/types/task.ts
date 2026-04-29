/**
 * Task interface shared between the Tauri desktop app (full TaskManagerContext)
 * and the landing page (stub TaskManagerContext).
 */

export interface Task {
	/** Stable identifier: jobKey for queue jobs, 'model-download' for downloads. */
	id: string;
	kind: 'scan' | 'categorize' | 'model-download' | 'generic';
	title: string;
	/** Human-readable current phase label shown in the widget. */
	phase: string;
	/** 0–100 animated progress, updated by the tick loop. */
	progress: number;
	progressLabel: string;
	status: 'active' | 'cancelling' | 'done' | 'error' | 'cancelled';
	canCancel: boolean;
	/** Used internally by cancelTask for non-scan/categorize tasks. */
	onCancel?: () => void;
	createdAt: number;
	completedAt?: number;
	/** Internal: the progress value we're animating toward. Never exposed directly. */
	_progressTarget: number;
	/** The original job key (used for cancel calls). */
	_jobKey: string;
}
