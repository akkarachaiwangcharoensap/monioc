/**
 * Pure derivation of per-image scan/categorize statuses from TabMemory + JobStatus.
 *
 * Extracted from useScanReceipt to make the logic independently testable and
 * to reduce the size of the orchestration hook.
 */

import type { JobStatus, TabMemoryScanResult } from '../../types';

export type PerImageScanStatusValue = 'scanning' | 'categorizing' | 'done' | 'error' | 'cancelling';

export interface DerivedScanStatuses {
	perImageScanStatus: Record<string, PerImageScanStatusValue>;
	isScanQueued: Record<string, boolean>;
	perImageCategorizeStatus: Record<string, 'categorizing'>;
}

/**
 * Derives the per-image scan status map from tab memory state and active jobs.
 *
 * Resolution order (later wins):
 *  1. queueScanResults — all paths default to 'done' (or 'error' if errorMsg set)
 *  2. queueErrors — overrides to 'error'
 *  3. Active jobs — overrides with live phase from JobStatusContext
 *  4. cancellingPaths — overrides with 'cancelling'
 */
export function deriveScanStatuses(
	queueScanResults: Record<string, TabMemoryScanResult>,
	jobKeys: Record<string, string>,
	jobs: ReadonlyMap<string, JobStatus>,
	cancellingPaths: Set<string> | undefined,
	queueErrors: Record<string, string> | undefined,
): DerivedScanStatuses {
	// ── perImageScanStatus ────────────────────────────────────────────────
	const perImageScanStatus: Record<string, PerImageScanStatusValue> = {};

	// Start with scan results (all are 'done' unless overridden below)
	for (const [path, saved] of Object.entries(queueScanResults)) {
		perImageScanStatus[path] = saved.errorMsg ? 'error' : 'done';
	}
	// Override with persisted errors from queueErrors
	for (const path of Object.keys(queueErrors ?? {})) {
		perImageScanStatus[path] = 'error';
	}
	// Override with active job status (takes precedence).
	for (const [path, jkey] of Object.entries(jobKeys)) {
		if (/^\d+$/.test(jkey)) {
			if (!perImageScanStatus[path]) perImageScanStatus[path] = 'done';
			continue;
		}
		if (cancellingPaths?.has(path)) {
			perImageScanStatus[path] = 'cancelling';
			continue;
		}
		const job = jobs.get(jkey);
		if (!job) {
			perImageScanStatus[path] = 'scanning';
			continue;
		}
		if (job.phase === 'error' || job.phase === 'cancelled') {
			perImageScanStatus[path] = 'error';
		} else if (job.phase === 'done') {
			perImageScanStatus[path] = 'done';
		} else if (job.phase === 'categorizing') {
			perImageScanStatus[path] = 'categorizing';
		} else {
			perImageScanStatus[path] = 'scanning';
		}
	}

	// ── isScanQueued ──────────────────────────────────────────────────────
	const isScanQueued: Record<string, boolean> = {};
	for (const [path, jkey] of Object.entries(jobKeys)) {
		if (/^\d+$/.test(jkey)) continue;
		if (jobs.get(jkey)?.phase === 'queued') isScanQueued[path] = true;
	}

	// ── perImageCategorizeStatus ──────────────────────────────────────────
	const perImageCategorizeStatus: Record<string, 'categorizing'> = {};
	for (const [path, jkey] of Object.entries(jobKeys)) {
		const job = jobs.get(jkey);
		if (!job) continue;
		const isCatJob = /^\d+$/.test(jkey);
		if (isCatJob && (job.phase === 'queued' || job.phase === 'categorizing')) {
			perImageCategorizeStatus[path] = 'categorizing';
		}
	}

	return { perImageScanStatus, isScanQueued, perImageCategorizeStatus };
}
