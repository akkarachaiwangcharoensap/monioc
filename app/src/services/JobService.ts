/**
 * JobService — unified facade for job submission and cancellation.
 *
 * Wraps TauriApi scan/categorize commands and tracks tab→jobKey attribution
 * so callers can cancel all jobs belonging to a closing tab in one call.
 *
 * The registry is automatically cleaned up when terminal job:status events
 * arrive on the bus.
 */

import { TauriApi } from './api';
import { appBus } from './bus';
import type { ReceiptData } from '../types';

// ── Attribution registry ──────────────────────────────────────────────────────

const tabJobKeys = new Map<string, Set<string>>();
const jobKeyToTabId = new Map<string, string>();

function registerJob(jobKey: string, tabId: string | null): void {
    if (!tabId) return;
    let keys = tabJobKeys.get(tabId);
    if (!keys) {
        keys = new Set();
        tabJobKeys.set(tabId, keys);
    }
    keys.add(jobKey);
    jobKeyToTabId.set(jobKey, tabId);
}

function unregisterJob(jobKey: string): void {
    const tabId = jobKeyToTabId.get(jobKey);
    if (tabId) {
        tabJobKeys.get(tabId)?.delete(jobKey);
        jobKeyToTabId.delete(jobKey);
    }
}

// Auto-clean registry on terminal events.
appBus.on('job:status', (e) => {
    if (e.phase === 'done' || e.phase === 'cancelled' || e.phase === 'error') {
        unregisterJob(e.jobKey);
    }
});

// ── Public API ────────────────────────────────────────────────────────────────

export interface ScanJobSpec {
    imagePath: string;
    receiptId?: number | null;
    withAutoCat: boolean;
    categories: string[];
    tabId?: string | null;
}

export interface CategorizeJobSpec {
    receiptId: number;
    items: string[];
    categories: string[];
    data: ReceiptData;
    tabId?: string | null;
}

export const JobService = {
    /** Submit a scan job and record its tab attribution. Returns the jobKey. */
    async submitScan(spec: ScanJobSpec): Promise<string> {
        const jobKey = await TauriApi.scanReceipt({
            imagePath: spec.imagePath,
            receiptId: spec.receiptId,
            withAutoCat: spec.withAutoCat,
            categories: spec.categories,
            tabId: spec.tabId,
        });
        registerJob(jobKey, spec.tabId ?? null);
        return jobKey;
    },

    /** Submit a categorize-only job and record its tab attribution. Returns the jobKey. */
    async submitCategorize(spec: CategorizeJobSpec): Promise<string> {
        const jobKey = await TauriApi.inferItemCategories({
            receiptId: spec.receiptId,
            items: spec.items,
            categories: spec.categories,
            data: spec.data,
            tabId: spec.tabId,
        });
        registerJob(jobKey, spec.tabId ?? null);
        return jobKey;
    },

    /** Cancel a specific job by key. */
    cancel(jobKey: string): Promise<void> {
        return TauriApi.cancelJob(jobKey);
    },

    /** Cancel all active jobs attributed to a tab (e.g. when the tab is closed). */
    async cancelByTab(tabId: string): Promise<void> {
        const keys = tabJobKeys.get(tabId);
        if (!keys || keys.size === 0) return;
        await Promise.allSettled(Array.from(keys).map((k) => TauriApi.cancelJob(k)));
    },

    /** Returns the job keys currently attributed to a tab (read-only). */
    getJobKeysForTab(tabId: string): ReadonlySet<string> {
        return tabJobKeys.get(tabId) ?? new Set();
    },

    /** Returns the tabId that submitted a job, or null if unknown / unattributed. */
    getTabIdForJob(jobKey: string): string | null {
        return jobKeyToTabId.get(jobKey) ?? null;
    },

    /** @internal For testing only — resets all attribution state. */
    _reset(): void {
        tabJobKeys.clear();
        jobKeyToTabId.clear();
    },
};
