import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import type React from 'react';
import { listen } from '@tauri-apps/api/event';
import type { JobStatus, JobStatusPayload, ReceiptScanCompletedDetail } from '../types';
import { AppEvents, CUSTOM_EVENTS } from '../constants';
import { useReceiptCache } from './ReceiptCacheContext';

// ── Helpers ───────────────────────────────────────────────────────────────────

const TERMINAL_PHASES = new Set(['done', 'error', 'cancelled']);

function isTerminal(phase: string): boolean {
    return TERMINAL_PHASES.has(phase);
}

// ── Context shape ─────────────────────────────────────────────────────────────

interface JobStatusContextValue {
    /** Map of jobKey → last-seen job status. Includes terminal entries until auto-evicted. */
    jobs: ReadonlyMap<string, JobStatus>;
    /** Manually dismiss a terminal job from the map. */
    dismiss: (jobKey: string) => void;
    /** True when at least one non-terminal job exists. */
    hasActiveJobs: boolean;
    /** Look up the current status for a job key. */
    getStatus: (jobKey: string) => JobStatus | undefined;
    /** True if any of the given receipt IDs has an active (non-terminal) job. */
    activeJobsForReceipts: (receiptIds: number[]) => boolean;
}

const JobStatusContext = createContext<JobStatusContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

export function JobStatusProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
    const { applyUpdate } = useReceiptCache();
    const mapRef = useRef(new Map<string, JobStatus>());
    const [version, setVersion] = useState(0);
    const bump = useCallback(() => setVersion((v) => v + 1), []);

    // ── Architecture: three-listener pattern ──────────────────────────────
    // job:status events are consumed by three independent listeners:
    //   1. JobStatusContext (here) — canonical job map with ordering guards,
    //      receipt cache push, key remap (imagePath→receiptId) on Done.
    //   2. TabMemoryContext — per-tab state updates (queueScanResults, jobKeys,
    //      queueErrors) on terminal events (done/error/cancelled).
    //   3. TaskManagerContext — reacts to `jobs` (from here) via useEffect,
    //      NOT via its own listener, so it always sees post-remap state.
    // Each listener operates on its own data store; no cross-listener
    // ordering is required.  This is intentional — see Phase 2 RF-TS1.
    useEffect(() => {
        const unlisten = listen<JobStatusPayload>(AppEvents.JOB_STATUS, (event) => {
            const p = event.payload;
            const existing = mapRef.current.get(p.jobKey);

            // Accept or reject this event based on run_id + seq to guard against
            // out-of-order delivery and stale events from previous runs.
            if (existing) {
                if (p.runId === 0) {
                    // run_id=0 is the command-handler "fresh start" sentinel.
                    // Only accept it if no active worker run is already in progress
                    // for this key (i.e. the existing entry is terminal or also at
                    // run_id=0).  This lets cancel+rescan reset stale cancelled state
                    // while ignoring a stray queued event during an active scan.
                    if (!isTerminal(existing.phase) && existing.runId > 0) return;
                    // Reject a stale Cancelled event (runId=0, seq=1) that arrives
                    // after a fresh Queued sentinel (runId=0, seq=0) for a new scan.
                    // The Cancelled belongs to the previous job; accepting it would
                    // overwrite the new scan's queued state with cancelled.
                    if (isTerminal(p.phase) && !isTerminal(existing.phase) && existing.runId === 0) return;
                } else if (p.runId < existing.runId) {
                    return; // stale event from an older run
                } else if (p.runId === existing.runId && p.seq < existing.seq) {
                    return; // out-of-order within the same run
                }
            }

            const status: JobStatus = {
                jobKey: p.jobKey,
                phase: p.phase,
                runId: p.runId,
                record: p.record,
                error: p.error,
                seq: p.seq,
            };

            if (p.phase === 'done' && p.record) {
                // Push the completed record into the cache immediately.
                applyUpdate(p.record);

                // Broadcast a typed in-process event so other pages can re-derive aggregates.
                const detail: ReceiptScanCompletedDetail = {
                    receiptId: p.record.id,
                    data: p.record.data,
                    imagePath: p.record.imagePath,
                    processedImagePath: p.record.processedImagePath,
                    purchaseDate: p.record.purchaseDate,
                    createdAt: p.record.createdAt,
                };
                window.dispatchEvent(new CustomEvent(CUSTOM_EVENTS.RECEIPT_SCAN_COMPLETED, { detail }));

                // Remap key: imagePath-based jobKey → receiptId-based key.
                const receiptKey = p.record.id.toString();
                mapRef.current.delete(p.jobKey);
                status.jobKey = receiptKey;
                mapRef.current.set(receiptKey, status);

                // Auto-evict after 5 seconds.
                const evictSeq = p.seq;
                setTimeout(() => {
                    if (mapRef.current.get(receiptKey)?.seq === evictSeq) {
                        mapRef.current.delete(receiptKey);
                        bump();
                    }
                }, 5000);
            } else {
                mapRef.current.set(p.jobKey, status);

                if (isTerminal(p.phase)) {
                    // Auto-evict non-done terminal statuses (error, cancelled) after 5 seconds.
                    const evictSeq = p.seq;
                    setTimeout(() => {
                        if (mapRef.current.get(p.jobKey)?.seq === evictSeq) {
                            mapRef.current.delete(p.jobKey);
                            bump();
                        }
                    }, 5000);
                }
            }

            bump();
        });

        return () => {
            unlisten.then((fn) => fn());
        };
    }, [bump, applyUpdate]);

    const dismiss = useCallback(
        (jobKey: string) => {
            mapRef.current.delete(jobKey);
            bump();
        },
        [bump],
    );

    const jobs = useMemo(
        () => new Map(mapRef.current) as ReadonlyMap<string, JobStatus>,
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [version],
    );

    const hasActiveJobs = useMemo(
        () => Array.from(mapRef.current.values()).some((j) => !isTerminal(j.phase)),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [version],
    );

    const value = useMemo<JobStatusContextValue>(
        () => ({
            jobs,
            dismiss,
            hasActiveJobs,
            getStatus: (jobKey: string) => mapRef.current.get(jobKey),
            activeJobsForReceipts: (receiptIds: number[]) => {
                const idSet = new Set(receiptIds.map(String));
                return Array.from(mapRef.current.entries()).some(
                    ([key, s]) =>
                        !isTerminal(s.phase) &&
                        (idSet.has(key) || (s.record != null && idSet.has(s.record.id.toString()))),
                );
            },
        }),
        [jobs, dismiss, hasActiveJobs],
    );

    return <JobStatusContext.Provider value={value}>{children}</JobStatusContext.Provider>;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useJobStatus(): JobStatusContextValue {
    const ctx = useContext(JobStatusContext);
    if (!ctx) throw new Error('useJobStatus must be used within <JobStatusProvider>');
    return ctx;
}
