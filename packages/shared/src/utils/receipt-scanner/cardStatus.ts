import type { Task } from '../../types/task';

export type CardStatus = 'idle' | 'queued' | 'scanning' | 'categorizing' | 'cancelling' | 'error' | 'check' | 'exit';

export function getCardStatus(
	path: string,
	donePhase: Record<string, 'check' | 'exit'>,
	taskForPath: Record<string, Task>,
	perImageScanStatus: Record<string, string | undefined>,
): CardStatus {
	if (donePhase[path] === 'exit') return 'exit';
	if (donePhase[path] === 'check') return 'check';
	const task = taskForPath[path];
	if (task) {
		if (task.status === 'done') return 'check';
		if (task.status === 'error' || task.status === 'cancelled') return 'error';
		if (task.status === 'cancelling') return 'cancelling';
		const pl = task.phase.toLowerCase();
		if (pl.includes('queued')) return 'queued';
		if (pl.includes('categoriz')) return 'categorizing';
		return 'scanning';
	}
	const s = perImageScanStatus[path];
	if (s === 'done') return 'check';
	if (s === 'scanning') return 'scanning';
	if (s === 'categorizing') return 'categorizing';
	if (s === 'cancelling') return 'cancelling';
	if (s === 'error') return 'error';
	if (s === 'queued') return 'queued';
	return 'idle';
}

export function getCardPhaseLabel(path: string, taskForPath: Record<string, Task>): string | null {
	const task = taskForPath[path];
	return task && task.status === 'active' ? task.phase : null;
}

export function getCardProgress(path: string, taskForPath: Record<string, Task>): number | null {
	const task = taskForPath[path];
	if (!task || task.status !== 'active') return null;
	if (task.progress <= 0) return null;
	return task.progress;
}
