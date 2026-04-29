import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    useSyncExternalStore,
} from 'react';
import type React from 'react';
import { listen } from '@tauri-apps/api/event';
import type { JobStatusPayload, TabMemory, TabMemoryScanResult } from '../types';
import { AppEvents } from '../constants';
import { receiptDataSignature } from '../utils/receipt-scanner/receiptData';
import { TauriApi } from '../services/api';

// ── Default tab memory ────────────────────────────────────────────────────────

export function getDefaultTabMemory(): TabMemory {
    return {
        imageQueue: [],
        queueEdits: {},
        queueScanResults: {},
        jobKeys: {},
        queueErrors: {},
        selectedScanId: null,
        activeBasePath: null,
    };
}

// ── Context shape ─────────────────────────────────────────────────────────────

interface TabMemoryContextValue {
    /**
     * Get the current memory for a tab (or the default if none exists).
     * The function reference changes on every memory update, so include it in
     * dependency arrays of effects/memos that care about memory changes.
     */
    getTabMemory: (tabId: string) => TabMemory;
    /**
     * Read a tab's memory without subscribing to changes.  For use inside
     * effects or callbacks where you need a one-shot read that does NOT
     * create a reactive dependency.
     */
    getTabMemorySnapshot: (tabId: string) => TabMemory;
    /** Update a tab's memory via an updater function. */
    setTabMemory: (tabId: string, updater: (prev: TabMemory) => TabMemory) => void;
    /** Remove a tab's memory (call when the tab is closed). */
    evictTabMemory: (tabId: string) => void;
    /**
     * Returns the tabId of the first open tab whose `selectedScanId` matches
     * the given receipt ID, or null if no such tab exists.
     * Use this to prevent opening a duplicate tab for a receipt already open elsewhere.
     */
    findTabByReceiptId: (receiptId: number) => string | null;
    /**
     * Claim exclusive write access for a receipt from the given tab.
     * Returns true if the lock was acquired, false if another tab already holds it.
     */
    acquireWriteLock: (tabId: string, receiptId: number) => boolean;
    /** Release write access for a receipt from the given tab. */
    releaseWriteLock: (tabId: string, receiptId: number) => void;
    /** Returns the tabId that holds the write lock for a receipt, or null. */
    getWriteOwner: (receiptId: number) => string | null;
    /**
     * Per-tab version map ref — used by useTabMemorySelector to subscribe
     * only to changes for a specific tab.
     */
    _tabVersionsRef: React.RefObject<Record<string, number>>;
    /**
     * Subscriber registry — used by useTabMemorySelector to receive
     * notifications when a specific tab's memory changes.
     */
    _subscribe: (tabId: string, cb: () => void) => () => void;
}

// ── Context ───────────────────────────────────────────────────────────────────

const TabMemoryContext = createContext<TabMemoryContextValue | null>(null);

export function TabMemoryProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
    const memoryMapRef = useRef(new Map<string, TabMemory>());
    /** Write-lock registry: receiptId → tabId that owns write access. */
    const writeLocksRef = useRef(new Map<number, string>());
    const [version, setVersion] = useState(0);
    /** Per-tab version counters for fine-grained subscriptions. */
    const tabVersionsRef = useRef<Record<string, number>>({});
    /** Per-tab subscriber sets for useTabMemorySelector. */
    const tabSubscribersRef = useRef(new Map<string, Set<() => void>>());

    const bumpTab = useCallback((tabId: string) => {
        tabVersionsRef.current[tabId] = (tabVersionsRef.current[tabId] ?? 0) + 1;
        // Notify per-tab subscribers.
        const subs = tabSubscribersRef.current.get(tabId);
        if (subs) for (const cb of subs) cb();
    }, []);

    const bump = useCallback(() => setVersion((v) => v + 1), []);

    const _subscribe = useCallback((tabId: string, cb: () => void) => {
        let subs = tabSubscribersRef.current.get(tabId);
        if (!subs) {
            subs = new Set();
            tabSubscribersRef.current.set(tabId, subs);
        }
        subs.add(cb);
        return () => { subs!.delete(cb); };
    }, []);

    // Listen to job:status events, updating tab memory on terminal events.
    // This is one of three independent job:status listeners — see the
    // architecture comment in JobStatusContext for the full design rationale.
    useEffect(() => {
        const unlisten = listen<JobStatusPayload>(AppEvents.JOB_STATUS, (event) => {
            const p = event.payload;

            if (p.phase === 'done' && p.record) {
                const record = p.record;
                let updated = false;

                let owningTabId: string | null = null;
                for (const [tabId, memory] of memoryMapRef.current) {
                    for (const [basePath, jobKey] of Object.entries(memory.jobKeys)) {
                        if (jobKey !== p.jobKey) continue;

                        const scanResult: TabMemoryScanResult = {
                            result: record.data,
                            editableData: record.data,
                            scanId: record.id,
                            persistedSignature: receiptDataSignature(record.data),
                            imagePath: record.imagePath,
                            processedImagePath: record.processedImagePath,
                            purchaseDate: record.purchaseDate,
                            createdAt: record.createdAt,
                        };

                        // Clear stale queueEdit for this basePath.  The staging file
                        // was deleted when the scan completed, so preserving the edit
                        // reference would cause "Image file not found" on the next scan.
                        const updatedEdits = { ...memory.queueEdits };
                        delete updatedEdits[basePath];

                        const updatedResults = {
                            ...memory.queueScanResults,
                            [basePath]: scanResult,
                        };

                        // ── Track completed scan IDs ───────────────────────────────────
                        // For scanner tabs (no loadedReceiptIds), track completed scan
                        // IDs so the "All Done" CTA survives tab switch / remount.
                        const isEditorTab = memory.loadedReceiptIds !== undefined;
                        const prevCompletedIds = memory.completedScanIds ?? [];
                        const completedScanIds = !isEditorTab
                            ? prevCompletedIds.includes(record.id)
                                ? prevCompletedIds
                                : [...prevCompletedIds, record.id]
                            : prevCompletedIds;

                        memoryMapRef.current.set(tabId, {
                            ...memory,
                            queueEdits: updatedEdits,
                            queueScanResults: updatedResults,
                            // Remap jobKey → receipt ID for post-Done status lookups.
                            jobKeys: {
                                ...memory.jobKeys,
                                [basePath]: record.id.toString(),
                            },
                            // Update selectedScanId / activeBasePath when the completed
                            // job was the currently active one.
                            ...(memory.activeBasePath === basePath
                                ? { selectedScanId: record.id }
                                : {}),
                            completedScanIds,
                            // Clear cancellingPaths if the job finished despite a cancel request.
                            ...(memory.cancellingPaths?.has(basePath) ? {
                                cancellingPaths: (() => {
                                    const s = new Set(memory.cancellingPaths);
                                    s.delete(basePath);
                                    return s;
                                })(),
                            } : {}),
                            // Clear any stale error for this path (successful scan supersedes).
                            queueErrors: (() => {
                                const e = { ...(memory.queueErrors ?? {}) };
                                delete e[basePath];
                                return e;
                            })(),
                        });
                        owningTabId = tabId;
                        updated = true;
                        break;
                    }
                    if (updated) break;
                }

                if (updated && owningTabId) {
                    bumpTab(owningTabId);

                    // Eagerly set the default purchase date for new scans so it
                    // persists even if the scanner page is not mounted (e.g. user
                    // switched tabs before the scan completed).  The
                    // savedResultForActive effect in useScanReceipt does the same
                    // but only when the scanner page is mounted.
                    if (!record.purchaseDate) {
                        const defaultDate = record.createdAt?.split(/[T ]/)[0] ?? null;
                        if (defaultDate) {
                            void TauriApi.updateReceiptPurchaseDate(record.id, defaultDate).then((updated) => {
                                if (!updated) return;
                                // Patch the in-memory scan result so useScanReceipt
                                // doesn't re-trigger the same API call.
                                for (const [tid, mem] of memoryMapRef.current) {
                                    for (const [bp, sr] of Object.entries(mem.queueScanResults)) {
                                        if (sr.scanId !== record.id) continue;
                                        memoryMapRef.current.set(tid, {
                                            ...mem,
                                            queueScanResults: {
                                                ...mem.queueScanResults,
                                                [bp]: { ...sr, purchaseDate: defaultDate },
                                            },
                                        });
                                        bumpTab(tid);
                                    }
                                }
                                bump();
                            });
                        }
                    }

                    // Piggyback: propagate the fresh scan result to any other tab that
                    // references the same receipt but did not own the scan job.
                    // This covers the case where the receipt was already open in a
                    // named tab (e.g. /receipt-scanner?receiptId=42) while the generic
                    // scanner tab performed the rescan.  The savedResultForActive effect
                    // in useScanReceipt will pick up the new queueScanResults entry and
                    // sync local state, but only if the user has no unsaved edits
                    // (guarded by the signature check in that effect).
                    for (const [siblingTabId, siblingMemory] of memoryMapRef.current) {
                        if (siblingTabId === owningTabId) continue;
                        if (siblingMemory.selectedScanId !== record.id) continue;
                        const siblingBase = siblingMemory.activeBasePath;
                        if (siblingBase == null) continue;
                        // Skip if the sibling has an active scan job for this path.
                        // Non-numeric key = image-path-based job still in flight;
                        // the activeJobPhase effect in useScanReceipt owns it.
                        const siblingJobKey = siblingMemory.jobKeys[siblingBase];
                        if (siblingJobKey && !/^\d+$/.test(siblingJobKey)) continue;
                        const siblingResult: TabMemoryScanResult = {
                            result: record.data,
                            editableData: record.data,
                            scanId: record.id,
                            persistedSignature: receiptDataSignature(record.data),
                            imagePath: record.imagePath,
                            processedImagePath: record.processedImagePath,
                            purchaseDate: record.purchaseDate,
                            createdAt: record.createdAt,
                        };
                        memoryMapRef.current.set(siblingTabId, {
                            ...siblingMemory,
                            queueScanResults: {
                                ...siblingMemory.queueScanResults,
                                [siblingBase]: siblingResult,
                            },
                            // Remap to receipt ID so perImageScanStatus shows 'done'.
                            jobKeys: {
                                ...siblingMemory.jobKeys,
                                [siblingBase]: record.id.toString(),
                            },
                            selectedScanId: record.id,
                        });
                    }
                    bump();
                    // Also bump sibling tabs that were updated.
                    for (const [siblingTabId] of memoryMapRef.current) {
                        if (siblingTabId === owningTabId) continue;
                        bumpTab(siblingTabId);
                    }
                }

            } else if (p.phase === 'error') {
                // ── Error handler (ALL images, including active) ─────────
                //
                // When a scan or categorize job errors, clean up the stale
                // jobKey and — for scan errors — persist the error message in
                // queueErrors so it survives tab switches and can be derived
                // by useScanReceipt instead of being tracked as local state.
                //
                // Categorize errors only delete the jobKey; the scan result
                // remains 'done' and the hook derives categorizeError locally
                // from the jobs map (briefly visible before auto-eviction).
                //
                // Exception: categorize-error jobKeys are KEPT so the hook's
                // effect can detect the error phase before JobStatusContext's
                // 5-second auto-eviction clears it.  The stale numeric key is
                // harmless — perImageScanStatus skips numeric keys entirely.
                let updated = false;

                for (const [tabId, memory] of memoryMapRef.current) {
                    for (const [basePath, jobKey] of Object.entries(memory.jobKeys)) {
                        if (jobKey !== p.jobKey) continue;

                        const isScanKey = !/^\d+$/.test(jobKey);

                        if (isScanKey) {
                            const nextJobKeys = { ...memory.jobKeys };
                            delete nextJobKeys[basePath];
                            memoryMapRef.current.set(tabId, {
                                ...memory,
                                jobKeys: nextJobKeys,
                                queueErrors: {
                                    ...(memory.queueErrors ?? {}),
                                    [basePath]: p.error ?? 'Scan failed',
                                },
                            });
                            updated = true;
                            bumpTab(tabId);
                        }
                        // else: categorize error — keep jobKey so the hook can
                        // detect the error phase; no TabMemory mutation needed.
                        break;
                    }
                    if (updated) break;
                }

                if (updated) bump();

            } else if (p.phase === 'cancelled') {
                // ── Cancelled handler (ALL images, including active) ─────
                //
                // Clean up stale job keys and — for scan cancels — discard the
                // stale result, clear cancellingPaths, and record the cancel
                // message in queueErrors so the UI shows an actionable error.
                let updated = false;

                for (const [tabId, memory] of memoryMapRef.current) {
                    for (const [basePath, jobKey] of Object.entries(memory.jobKeys)) {
                        if (jobKey !== p.jobKey) continue;

                        const nextJobKeys = { ...memory.jobKeys };
                        delete nextJobKeys[basePath];

                        const isScanKey = !/^\d+$/.test(jobKey);

                        if (isScanKey) {
                            const nextResults = { ...memory.queueScanResults };
                            delete nextResults[basePath];
                            const nextCancelling = memory.cancellingPaths
                                ? new Set(memory.cancellingPaths)
                                : undefined;
                            nextCancelling?.delete(basePath);
                            memoryMapRef.current.set(tabId, {
                                ...memory,
                                jobKeys: nextJobKeys,
                                queueScanResults: nextResults,
                                queueErrors: {
                                    ...(memory.queueErrors ?? {}),
                                    [basePath]: 'Scan was cancelled',
                                },
                                ...(nextCancelling !== undefined ? { cancellingPaths: nextCancelling } : {}),
                            });
                        } else {
                            memoryMapRef.current.set(tabId, { ...memory, jobKeys: nextJobKeys });
                        }
                        updated = true;
                        bumpTab(tabId);
                        break;
                    }
                    if (updated) break;
                }

                if (updated) bump();
            }
        });

        return () => {
            unlisten.then((fn) => fn());
        };
    }, [bump, bumpTab]);

    // getTabMemory reference changes on each bump so consumers can react to changes.
    const getTabMemory = useMemo(
        () =>
            (tabId: string): TabMemory =>
                memoryMapRef.current.get(tabId) ?? getDefaultTabMemory(),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [version],
    );

    /** Read a tab's memory without subscribing (one-shot read). */
    const getTabMemorySnapshot = useCallback(
        (tabId: string): TabMemory =>
            memoryMapRef.current.get(tabId) ?? getDefaultTabMemory(),
        [],
    );

    const setTabMemory = useCallback(
        (tabId: string, updater: (prev: TabMemory) => TabMemory) => {
            const prev = memoryMapRef.current.get(tabId) ?? getDefaultTabMemory();
            memoryMapRef.current.set(tabId, updater(prev));
            bumpTab(tabId);
            bump();
        },
        [bump, bumpTab],
    );

    const evictTabMemory = useCallback(
        (tabId: string) => {
            if (memoryMapRef.current.delete(tabId)) {
                // Release all write locks held by this tab.
                for (const [receiptId, owner] of writeLocksRef.current) {
                    if (owner === tabId) writeLocksRef.current.delete(receiptId);
                }
                // Clean up per-tab tracking.
                delete tabVersionsRef.current[tabId];
                tabSubscribersRef.current.delete(tabId);
                bump();
            }
        },
        [bump],
    );

    const findTabByReceiptId = useCallback(
        (receiptId: number): string | null => {
            for (const [tabId, memory] of memoryMapRef.current) {
                if (memory.selectedScanId === receiptId) return tabId;
                // Also check every receipt in the tab's queue — a receipt
                // that is queued but not currently selected should still
                // prevent a duplicate tab from being opened.
                for (const entry of Object.values(memory.queueScanResults)) {
                    if (entry.scanId === receiptId) return tabId;
                }
            }
            return null;
        },
        [],
    );

    const acquireWriteLock = useCallback(
        (tabId: string, receiptId: number): boolean => {
            const existing = writeLocksRef.current.get(receiptId);
            if (existing && existing !== tabId) return false;
            writeLocksRef.current.set(receiptId, tabId);
            return true;
        },
        [],
    );

    const releaseWriteLock = useCallback(
        (tabId: string, receiptId: number): void => {
            if (writeLocksRef.current.get(receiptId) === tabId) {
                writeLocksRef.current.delete(receiptId);
            }
        },
        [],
    );

    const getWriteOwner = useCallback(
        (receiptId: number): string | null => writeLocksRef.current.get(receiptId) ?? null,
        [],
    );

    const value = useMemo<TabMemoryContextValue>(
        () => ({
            getTabMemory,
            getTabMemorySnapshot,
            setTabMemory,
            evictTabMemory,
            findTabByReceiptId,
            acquireWriteLock,
            releaseWriteLock,
            getWriteOwner,
            _tabVersionsRef: tabVersionsRef,
            _subscribe,
        }),
        [getTabMemory, getTabMemorySnapshot, setTabMemory, evictTabMemory, findTabByReceiptId, acquireWriteLock, releaseWriteLock, getWriteOwner, _subscribe],
    );

    return <TabMemoryContext.Provider value={value}>{children}</TabMemoryContext.Provider>;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useTabMemory(): TabMemoryContextValue {
    const ctx = useContext(TabMemoryContext);
    if (!ctx) throw new Error('useTabMemory must be used within <TabMemoryProvider>');
    return ctx;
}

/**
 * Subscribe to a specific tab's memory with a selector.  Only re-renders
 * when the selected value changes (shallow compare).  This is the preferred
 * way to read TabMemory — it avoids the cascade re-render problem where
 * every consumer re-renders on every unrelated tab's memory change.
 */
export function useTabMemorySelector<T>(
    tabId: string,
    selector: (m: TabMemory) => T,
): T {
    const { _subscribe, getTabMemorySnapshot } = useTabMemory();
    const selectorRef = useRef(selector);
    selectorRef.current = selector;

    const subscribe = useCallback(
        (cb: () => void) => _subscribe(tabId, cb),
        [_subscribe, tabId],
    );

    const getSnapshot = useCallback(
        () => selectorRef.current(getTabMemorySnapshot(tabId)),
        [getTabMemorySnapshot, tabId],
    );

    return useSyncExternalStore(subscribe, getSnapshot);
}
