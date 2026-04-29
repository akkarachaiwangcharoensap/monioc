/**
 * Typed in-process event bus.
 *
 * The single pub/sub hub for the app. All Tauri backend events are
 * translated here by TauriEventAdapter — no other module calls listen()
 * from @tauri-apps/api/event.
 */

import type { ReceiptScanRecord } from '../types';
import type { JobPhase } from '../types';

// ── Event payload types ───────────────────────────────────────────────────────

export type JobKind = 'scan' | 'categorize';

/** Enriched job status event published on the bus (translated from Tauri job:status). */
export interface BusJobStatusEvent {
    /** Stable job key (imagePath for scans, receiptId.toString() for categorize). */
    jobKey: string;
    phase: JobPhase;
    kind: JobKind;
    /** Originating tab ID, or null when not attributed (legacy backend or global). */
    tabId: string | null;
    runId: number;
    seq: number;
    record: ReceiptScanRecord | null;
    error: string | null;
}

/** Progress message from scan_receipt.py, published while phase === 'scanning'. */
export interface BusJobProgressEvent {
    message: string;
}

/** All events on the application bus with their payload types. */
export interface AppBusEventMap {
    'job:status': BusJobStatusEvent;
    'job:progress': BusJobProgressEvent;
    'receipt:saved': ReceiptScanRecord;
    'receipt:deleted': { id: number };
    'data:restored': void;
    'category:changed': void;
    'library:changed': void;
}

// ── Bus implementation ────────────────────────────────────────────────────────

type Handler<T> = (payload: T) => void;

export class AppBus {
    /** @internal exposed for testing only. */
    readonly _handlers = new Map<string, Set<Handler<unknown>>>();

    on<K extends keyof AppBusEventMap>(
        event: K,
        handler: Handler<AppBusEventMap[K]>,
    ): () => void {
        let set = this._handlers.get(event as string);
        if (!set) {
            set = new Set();
            this._handlers.set(event as string, set);
        }
        const h = handler as Handler<unknown>;
        set.add(h);
        return () => { set!.delete(h); };
    }

    emit<K extends keyof AppBusEventMap>(event: K, payload: AppBusEventMap[K]): void {
        const set = this._handlers.get(event as string);
        if (!set) return;
        for (const h of set) h(payload as unknown);
    }

    /**
     * Subscribe to events filtered by tabId.
     * Events that carry a non-null `tabId` field are only delivered if it matches.
     * Events with `tabId === null` are delivered to all tab-scoped subscribers.
     */
    onForTab<K extends keyof AppBusEventMap>(
        event: K,
        tabId: string,
        handler: Handler<AppBusEventMap[K]>,
    ): () => void {
        return this.on(event, (payload) => {
            if (
                payload !== null &&
                payload !== undefined &&
                typeof payload === 'object' &&
                'tabId' in payload
            ) {
                const payloadTabId = (payload as unknown as Record<string, unknown>).tabId;
                if (payloadTabId !== null && payloadTabId !== tabId) return;
            }
            handler(payload);
        });
    }

    /** Returns a scoped view whose on() calls auto-filter by tabId. */
    scope(tabId: string): ScopedAppBus {
        return new ScopedAppBus(this, tabId);
    }
}

/**
 * A scoped view of AppBus that filters all subscriptions to a single tabId.
 * Used by per-tab stores so they only receive events intended for their tab.
 */
export class ScopedAppBus {
    constructor(
        private readonly _bus: AppBus,
        readonly tabId: string,
    ) {}

    on<K extends keyof AppBusEventMap>(
        event: K,
        handler: Handler<AppBusEventMap[K]>,
    ): () => void {
        return this._bus.onForTab(event, this.tabId, handler);
    }

    emit<K extends keyof AppBusEventMap>(event: K, payload: AppBusEventMap[K]): void {
        this._bus.emit(event, payload);
    }
}

/** Global singleton bus — the single pub/sub hub for the app. */
export const appBus = new AppBus();
