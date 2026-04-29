/**
 * Unit tests for TauriEventAdapter.
 *
 * The adapter is the single listen() call site. Tests verify:
 *  - Correct translation of Tauri payloads to bus events
 *  - FSM ordering guards (runId / seq based)
 *  - kind detection when backend doesn't send it
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppBus } from './bus';
import { TauriEventAdapter } from './TauriEventAdapter';
import type { JobStatusPayload } from '../types';

// Build a JobStatusPayload with sensible defaults.
function makePayload(overrides: Partial<JobStatusPayload & { kind?: string; tabId?: string | null }> = {}): JobStatusPayload {
    return {
        jobKey: '/tmp/receipt.jpg',
        phase: 'queued',
        runId: 0,
        seq: 0,
        record: null,
        error: null,
        ...overrides,
    } as JobStatusPayload;
}

describe('TauriEventAdapter.handleJobStatus', () => {
    let bus: AppBus;
    let adapter: TauriEventAdapter;
    let handler: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        bus = new AppBus();
        adapter = new TauriEventAdapter(bus);
        handler = vi.fn();
        bus.on('job:status', handler);
    });

    it('publishes a valid queued event', () => {
        adapter.handleJobStatus(makePayload({ phase: 'queued', runId: 0, seq: 0 }));
        expect(handler).toHaveBeenCalledOnce();
        expect(handler.mock.calls[0][0]).toMatchObject({ phase: 'queued', runId: 0, seq: 0 });
    });

    it('detects scan kind from non-numeric jobKey', () => {
        adapter.handleJobStatus(makePayload({ jobKey: '/path/to/image.jpg', phase: 'queued' }));
        expect(handler.mock.calls[0][0].kind).toBe('scan');
    });

    it('detects categorize kind from numeric jobKey', () => {
        adapter.handleJobStatus(makePayload({ jobKey: '42', phase: 'queued' }));
        expect(handler.mock.calls[0][0].kind).toBe('categorize');
    });

    it('uses kind from payload when provided by backend', () => {
        adapter.handleJobStatus(makePayload({ jobKey: '42', phase: 'queued', kind: 'scan' } as never));
        expect(handler.mock.calls[0][0].kind).toBe('scan');
    });

    it('sets tabId to null when not in payload', () => {
        adapter.handleJobStatus(makePayload({ phase: 'queued' }));
        expect(handler.mock.calls[0][0].tabId).toBeNull();
    });

    it('propagates tabId from payload', () => {
        adapter.handleJobStatus(makePayload({ phase: 'queued', tabId: 'tab-A' } as never));
        expect(handler.mock.calls[0][0].tabId).toBe('tab-A');
    });

    // ── FSM ordering guards ───────────────────────────────────────────────────

    it('rejects a worker event (runId > 0) when a higher runId was already accepted', () => {
        adapter.handleJobStatus(makePayload({ phase: 'scanning', runId: 2, seq: 1 }));
        adapter.handleJobStatus(makePayload({ phase: 'scanning', runId: 1, seq: 1 }));
        expect(handler).toHaveBeenCalledOnce(); // second call dropped
    });

    it('rejects out-of-order seq within the same run', () => {
        adapter.handleJobStatus(makePayload({ phase: 'scanning', runId: 1, seq: 3 }));
        adapter.handleJobStatus(makePayload({ phase: 'saving', runId: 1, seq: 2 }));
        expect(handler).toHaveBeenCalledOnce();
    });

    it('accepts higher seq within the same run', () => {
        adapter.handleJobStatus(makePayload({ phase: 'scanning', runId: 1, seq: 1 }));
        adapter.handleJobStatus(makePayload({ phase: 'saving', runId: 1, seq: 2 }));
        expect(handler).toHaveBeenCalledTimes(2);
    });

    it('rejects runId=0 queued sentinel when active worker run is in progress', () => {
        // Worker run in progress (runId=1)
        adapter.handleJobStatus(makePayload({ phase: 'scanning', runId: 1, seq: 1 }));
        // Stale queued sentinel (runId=0) — e.g. delayed delivery
        adapter.handleJobStatus(makePayload({ phase: 'queued', runId: 0, seq: 0 }));
        expect(handler).toHaveBeenCalledOnce();
    });

    it('accepts runId=0 queued sentinel when previous job has terminated', () => {
        adapter.handleJobStatus(makePayload({ phase: 'queued', runId: 0, seq: 0 }));
        // Terminal event clears the state
        adapter.handleJobStatus(makePayload({ phase: 'done', runId: 1, seq: 1 }));
        // New queued sentinel for a rescan
        adapter.handleJobStatus(makePayload({ phase: 'queued', runId: 0, seq: 0 }));
        expect(handler).toHaveBeenCalledTimes(3);
    });

    it('rejects stale Cancelled (runId=0) after fresh Queued (runId=0) for a new scan', () => {
        // Fresh queued sentinel for new scan
        adapter.handleJobStatus(makePayload({ phase: 'queued', runId: 0, seq: 0 }));
        // Stale Cancelled from previous scan, arriving late
        adapter.handleJobStatus(makePayload({ phase: 'cancelled', runId: 0, seq: 1 }));
        expect(handler).toHaveBeenCalledOnce(); // Cancelled is dropped
    });

    it('evicts FSM state on terminal events so next scan starts fresh', () => {
        adapter.handleJobStatus(makePayload({ phase: 'scanning', runId: 1, seq: 1 }));
        adapter.handleJobStatus(makePayload({ phase: 'done', runId: 1, seq: 2 }));
        // Fresh scan of the same image path
        adapter.handleJobStatus(makePayload({ phase: 'queued', runId: 0, seq: 0 }));
        expect(handler).toHaveBeenCalledTimes(3);
    });

    it('forwards error events and clears state', () => {
        adapter.handleJobStatus(makePayload({ phase: 'scanning', runId: 1, seq: 1 }));
        adapter.handleJobStatus(makePayload({ phase: 'error', runId: 1, seq: 2, error: 'failed' }));
        expect(handler).toHaveBeenCalledTimes(2);
        expect(handler.mock.calls[1][0]).toMatchObject({ phase: 'error', error: 'failed' });
    });

    it('handles independent jobs concurrently', () => {
        adapter.handleJobStatus(makePayload({ jobKey: '/a.jpg', phase: 'scanning', runId: 1, seq: 1 }));
        adapter.handleJobStatus(makePayload({ jobKey: '/b.jpg', phase: 'queued', runId: 0, seq: 0 }));
        adapter.handleJobStatus(makePayload({ jobKey: '/a.jpg', phase: 'done', runId: 1, seq: 2 }));
        expect(handler).toHaveBeenCalledTimes(3);
    });
});
