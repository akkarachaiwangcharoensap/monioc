/**
 * TauriEventAdapter — the ONLY module that calls listen() from @tauri-apps/api/event.
 *
 * Responsibilities:
 *  1. Subscribe to all Tauri backend events.
 *  2. Apply the job:status FSM ordering guard (runId / seq) so downstream
 *     bus consumers receive already-validated, in-order events.
 *  3. Enrich raw payloads with `kind` (derived or from backend) and `tabId`.
 *  4. Publish typed events onto the AppBus.
 *
 * Started once by BusAdapterProvider at app startup. Stopped on unmount.
 * Tests skip this adapter entirely and drive the bus directly via appBus.emit().
 */

import { listen } from '@tauri-apps/api/event';
import type { AppBus, BusJobStatusEvent, JobKind } from './bus';
import type { JobStatusPayload, ReceiptScanRecord } from '../types';
import { AppEvents } from '../constants';

// ── Helpers ───────────────────────────────────────────────────────────────────

interface JobFsmState {
    phase: string;
    runId: number;
    seq: number;
}

function isTerminalPhase(phase: string): boolean {
    return phase === 'done' || phase === 'cancelled' || phase === 'error';
}

function detectKind(jobKey: string): JobKind {
    return /^\d+$/.test(jobKey) ? 'categorize' : 'scan';
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class TauriEventAdapter {
    private unlisteners: Array<Promise<() => void>> = [];

    /**
     * Per-job FSM state: phase, runId, seq of the last accepted event.
     * Terminal-phase entries are evicted immediately to free memory.
     */
    private jobStates = new Map<string, JobFsmState>();

    constructor(private readonly bus: AppBus) {}

    start(): void {
        this.unlisteners.push(
            listen<JobStatusPayload>(AppEvents.JOB_STATUS, ({ payload }) =>
                this.handleJobStatus(payload),
            ),
        );

        this.unlisteners.push(
            listen<string>(AppEvents.SCAN_PROGRESS, ({ payload: message }) =>
                this.bus.emit('job:progress', { message }),
            ),
        );

        this.unlisteners.push(
            listen<ReceiptScanRecord>(AppEvents.RECEIPT_SAVED, ({ payload }) =>
                this.bus.emit('receipt:saved', payload),
            ),
        );

        this.unlisteners.push(
            listen<{ id: number }>(AppEvents.RECEIPT_DELETED, ({ payload }) =>
                this.bus.emit('receipt:deleted', payload),
            ),
        );

        this.unlisteners.push(
            listen(AppEvents.DATA_RESTORED, () =>
                this.bus.emit('data:restored', undefined as void),
            ),
        );

        this.unlisteners.push(
            listen(AppEvents.CATEGORY_CHANGED, () =>
                this.bus.emit('category:changed', undefined as void),
            ),
        );

        this.unlisteners.push(
            listen(AppEvents.LIBRARY_CHANGED, () =>
                this.bus.emit('library:changed', undefined as void),
            ),
        );
    }

    /** @internal exposed for unit testing. */
    handleJobStatus(p: JobStatusPayload): void {
        const existing = this.jobStates.get(p.jobKey);

        // Ordering guards — mirrors the logic previously duplicated across
        // JobStatusContext, TabMemoryContext, and TaskManagerContext.
        if (existing) {
            if (p.runId === 0) {
                // run_id=0 is the command-handler "fresh start" sentinel.
                // Reject if an active worker run (runId >= 1) is in progress.
                if (!isTerminalPhase(existing.phase) && existing.runId > 0) return;
                // Reject a stale terminal event (e.g. Cancelled from a prior run)
                // that arrives after a fresh Queued sentinel for a new scan.
                if (isTerminalPhase(p.phase) && !isTerminalPhase(existing.phase) && existing.runId === 0) return;
            } else if (p.runId < existing.runId) {
                return; // stale event from an older worker run
            } else if (p.runId === existing.runId && p.seq < existing.seq) {
                return; // out-of-order within the same run
            }
        }

        // Update FSM tracking.
        if (isTerminalPhase(p.phase)) {
            this.jobStates.delete(p.jobKey);
        } else {
            this.jobStates.set(p.jobKey, { phase: p.phase, runId: p.runId, seq: p.seq });
        }

        // Cast to pick up optional fields added by newer backend versions.
        const extended = p as JobStatusPayload & { kind?: JobKind; tabId?: string | null };

        const event: BusJobStatusEvent = {
            jobKey: p.jobKey,
            phase: p.phase,
            kind: extended.kind ?? detectKind(p.jobKey),
            tabId: extended.tabId ?? null,
            runId: p.runId,
            seq: p.seq,
            record: p.record,
            error: p.error,
        };

        this.bus.emit('job:status', event);
    }

    stop(): void {
        for (const p of this.unlisteners) void p.then((fn) => fn());
        this.unlisteners = [];
        this.jobStates.clear();
    }
}
