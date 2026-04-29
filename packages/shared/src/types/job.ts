/**
 * Job lifecycle types (mirrors Rust events.rs).
 */

import type { ReceiptScanRecord } from './receipt';

export type JobPhase =
	| 'queued'
	| 'scanning'
	| 'saving'
	| 'categorizing'
	| 'done'
	| 'error'
	| 'cancelled';

/** Payload of `job:status` events emitted by the Rust job queue. */
export interface JobStatusPayload {
	jobKey: string;
	phase: JobPhase;
	/** 0 = command-handler sentinel (queued, not yet running); 1+ = unique per worker run. */
	runId: number;
	record: ReceiptScanRecord | null;
	error: string | null;
	seq: number;
}

/**
 * Derived per-job status object stored in `JobStatusContext`.
 * Keeps the last-seen payload plus a convenience `terminal` flag.
 */
export interface JobStatus {
	jobKey: string;
	phase: JobPhase;
	runId: number;
	record: ReceiptScanRecord | null;
	error: string | null;
	seq: number;
}

/** Payload of `receipt:deleted` events. */
export interface ReceiptDeletedPayload {
	id: number;
}
