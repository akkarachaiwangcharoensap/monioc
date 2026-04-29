/**
 * TaskManagerContext — global registry of long-running background tasks.
 *
 * Replaces the per-toast progress system. The context:
 *  - Watches JobStatusContext.jobs to track scan/categorize lifecycle
 *  - Subscribes to 'scan-progress' Tauri events globally to drive animated progress
 *  - Runs a 300 ms tick to creep progress toward the next waypoint
 *  - Exposes addTask / updateTask / completeTask / cancelTask for external use
 *
 * Cancel semantics:
 *  - cancelTask() transitions the task to 'cancelling' synchronously, then
 *    calls TauriApi.cancelJob / task.onCancel asynchronously. If the cancel
 *    call rejects, the task transitions to 'error'.
 *  - Per-task auto-remove timers are tracked in taskTimersRef and cleared via
 *    clearTaskTimers() whenever a task is cancelled, completed, or removed.
 */
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
import { AppEvents } from '../constants';
import { useJobStatus } from './JobStatusContext';
import type { JobPhase } from '../types';
import type { Task } from '@monioc/shared';
import { parseTauriError } from '../services/errors';

export type { Task };

interface TaskManagerContextValue {
    tasks: Task[];
    addTask: (opts: AddTaskOptions) => string;
    updateTask: (id: string, patch: Partial<Omit<Task, 'id'>>) => void;
    completeTask: (id: string, status: 'done' | 'error' | 'cancelled') => void;
    removeTask: (id: string) => void;
    /** Immediately transition task to 'cancelling', then fire the async cancel. */
    cancelTask: (id: string) => void;
    /**
     * Optimistically mark a task as 'cancelling' without firing the backend
     * cancel call.  Use this when the caller is responsible for calling
     * TauriApi.cancelJob directly (e.g. the page-level cancel button), so
     * the widget reflects the same cancelling state without a double API call.
     */
    markTaskCancelling: (id: string) => void;
}

interface AddTaskOptions {
    id?: string;
    kind: Task['kind'];
    title: string;
    phase?: string;
    /** Seed value for _progressTarget only. progress always starts at 0. */
    progress?: number;
    progressLabel?: string;
    canCancel?: boolean;
    onCancel?: () => void;
}

const TaskManagerContext = createContext<TaskManagerContextValue | null>(null);

interface TaskManagerProviderProps {
    children: React.ReactNode;
    /** Injected cancel function — callers pass TauriApi.cancelJob so this context never imports TauriApi directly. */
    onCancelJob: (jobKey: string) => Promise<void>;
}

// ── Progress waypoints ────────────────────────────────────────────────────────

const ACTIVE_JOB_PHASES = new Set<JobPhase>(['queued', 'scanning', 'saving', 'categorizing']);

/**
 * Unified waypoint resolver — single source of truth for progress targets.
 * Called by both the job:status listener and the scan-progress listener.
 * Returns the progress target (0–100), or null if no waypoint applies.
 */
export function resolveWaypoint(message: string, phase: JobPhase): number | null {
    switch (phase) {
        case 'queued': return 0;
        case 'saving': return 90;
        case 'categorizing': return 92;
        case 'done': return 100;
        case 'cancelled':
        case 'error': return null;
        case 'scanning':
            if (/preparing image/i.test(message)) return 8;
            if (/step\s+1\/3/i.test(message) || /recogni[sz]ing text/i.test(message)) return 33;
            if (/step\s+2\/3/i.test(message) || /ai model/i.test(message) || /analy[sz]/i.test(message)) return 55;
            if (/step\s+3\/3/i.test(message) || /saving results/i.test(message)) return 82;
            if (/\bdone\b/i.test(message)) return 100;
            return 2; // default for scanning phase
    }
}

function phaseToPhaseLabel(phase: JobPhase | 'cancelling', kind: Task['kind']): string {
    switch (phase) {
        case 'queued': return 'Queued…';
        case 'scanning': return 'Preparing image…';
        case 'saving': return 'Saving…';
        case 'categorizing': return 'Categorizing items…';
        case 'cancelling': return 'Cancelling…';
        case 'done': return kind === 'scan' ? 'Scan complete' : 'Categorized';
        case 'error': return 'Failed';
        case 'cancelled': return 'Cancelled';
        default: return '';
    }
}

/** Detect whether a job key represents a categorize (numeric) or scan (file path) job. */
function detectKind(jobKey: string): 'scan' | 'categorize' {
    return /^\d+$/.test(jobKey) ? 'categorize' : 'scan';
}

// ── Smooth-tick constants ─────────────────────────────────────────────────────

const TICK_MS = 300;
/** Max progress added per tick when creeping toward the next waypoint. */
const CREEP_STEP = 0.4;
/** Progress stops this many percentage points below _progressTarget (visual gap). */
const CREEP_CAP = 0.5;

// ── Provider ──────────────────────────────────────────────────────────────────

export function TaskManagerProvider({ children, onCancelJob }: TaskManagerProviderProps): React.JSX.Element {
    const { jobs } = useJobStatus();
    const onCancelJobRef = useRef(onCancelJob);
    onCancelJobRef.current = onCancelJob;

    // Mutable task map; version counter triggers re-renders.
    const mapRef = useRef(new Map<string, Task>());
    const [version, setVersion] = useState(0);
    const bump = useCallback(() => setVersion((v) => v + 1), []);

    // nextId for generic/model tasks with pre-defined IDs.
    const nextIdRef = useRef(0);

    // Per-task auto-remove timer IDs, keyed by task id.
    const taskTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

    // Stable ref so cancelTask can read current job phases without stale closures.
    const jobsRef = useRef(jobs);
    jobsRef.current = jobs;

    const clearTaskTimers = useCallback((id: string) => {
        const t = taskTimersRef.current.get(id);
        if (t !== undefined) {
            clearTimeout(t);
            taskTimersRef.current.delete(id);
        }
    }, []);

    // ── External API ──────────────────────────────────────────────────────────

    const addTask = useCallback((opts: AddTaskOptions): string => {
        const id = opts.id ?? `task-${nextIdRef.current++}`;
        const task: Task = {
            id,
            kind: opts.kind,
            title: opts.title,
            phase: opts.phase ?? '',
            progress: 0, // Always start at 0 — no exceptions
            progressLabel: opts.progressLabel ?? opts.phase ?? '',
            status: 'active',
            canCancel: opts.canCancel ?? false,
            onCancel: opts.onCancel,
            createdAt: Date.now(),
            _progressTarget: opts.progress ?? 0,
            _jobKey: id,
        };
        mapRef.current.set(id, task);
        bump();
        return id;
    }, [bump]);

    const updateTask = useCallback((id: string, patch: Partial<Omit<Task, 'id'>>) => {
        const existing = mapRef.current.get(id);
        if (!existing) return;
        const updated: Task = { ...existing, ...patch };
        // Progress never decreases — enforce monotonicity.
        if (patch.progress != null) {
            updated._progressTarget = Math.max(existing._progressTarget, patch.progress);
            updated.progress = Math.max(existing.progress, patch.progress);
        }
        mapRef.current.set(id, updated);
        bump();
    }, [bump]);

    const completeTask = useCallback((id: string, completionStatus: 'done' | 'error' | 'cancelled') => {
        clearTaskTimers(id);
        const t = mapRef.current.get(id);
        if (!t) return;
        mapRef.current.set(id, {
            ...t,
            status: completionStatus,
            progress: completionStatus === 'done' ? 100 : t.progress,
            _progressTarget: completionStatus === 'done' ? 100 : t._progressTarget,
            completedAt: Date.now(),
        });
        bump();
        // Auto-remove after 5 seconds.
        const timer = setTimeout(() => {
            const current = mapRef.current.get(id);
            if (current && current.status !== 'active' && current.status !== 'cancelling') {
                mapRef.current.delete(id);
                taskTimersRef.current.delete(id);
                bump();
            }
        }, 5000);
        taskTimersRef.current.set(id, timer);
    }, [bump, clearTaskTimers]);

    const removeTask = useCallback((id: string) => {
        clearTaskTimers(id);
        mapRef.current.delete(id);
        bump();
    }, [bump, clearTaskTimers]);

    const markTaskCancelling = useCallback((id: string) => {
        let task = mapRef.current.get(id);
        let resolvedId = id;

        // Fallback: if the direct ID lookup misses (e.g. after a key remap),
        // search all tasks by _jobKey so the cancel still takes effect.
        if (!task) {
            for (const [key, t] of mapRef.current) {
                if (t._jobKey === id) {
                    task = t;
                    resolvedId = key;
                    break;
                }
            }
        }

        if (!task || task.status !== 'active') return;
        clearTaskTimers(resolvedId);
        mapRef.current.set(resolvedId, {
            ...task,
            status: 'cancelling',
            phase: phaseToPhaseLabel('cancelling', task.kind),
            progressLabel: phaseToPhaseLabel('cancelling', task.kind),
        });
        bump();
    }, [bump, clearTaskTimers]);

    const cancelTask = useCallback((id: string) => {
        const task = mapRef.current.get(id);
        if (!task || (task.status !== 'active' && task.status !== 'cancelling')) return;

        // Clear any pending auto-remove timers before transitioning.
        clearTaskTimers(id);

        // Look up the job's current phase without depending on `jobs` in the
        // callback dep array (jobs changes on every status update, which would
        // recreate cancelTask constantly and cause stale-closure bugs).
        const currentJobs = jobsRef.current;
        const jobPhase =
            currentJobs.get(task._jobKey)?.phase ??
            currentJobs.get(id)?.phase;

        // If the job hasn't started yet (still queued in the FIFO queue), we
        // can resolve it as cancelled immediately — the Rust worker will also
        // emit Cancelled when it eventually dequeues, which will be ignored by
        // JobStatusContext as a stale terminal event for an already-evicted key.
        const isQueueWaiting = jobPhase === 'queued';

        if (isQueueWaiting) {
            mapRef.current.set(id, {
                ...task,
                status: 'cancelled',
                phase: 'Cancelled',
                progressLabel: 'Cancelled',
                completedAt: Date.now(),
            });
            bump();
            const timer = setTimeout(() => {
                mapRef.current.delete(id);
                taskTimersRef.current.delete(id);
                bump();
            }, 3000);
            taskTimersRef.current.set(id, timer);
        } else {
            // Immediately reflect 'cancelling' in the UI — do not wait for the async call.
            mapRef.current.set(id, {
                ...task,
                status: 'cancelling',
                phase: 'Cancelling…',
                progressLabel: 'Cancelling…',
            });
            bump();
        }

        const doCancel = async () => {
            try {
                if (task.kind === 'scan' || task.kind === 'categorize') {
                    await onCancelJobRef.current(task._jobKey);
                } else if (task.onCancel) {
                    await task.onCancel();
                }
                // On success: the confirming job:status event drives the terminal
                // transition (for cancelling tasks). Queued tasks are already done.
            } catch (err) {
                if (isQueueWaiting) return; // already marked cancelled; ignore
                const current = mapRef.current.get(id);
                if (current) {
                    clearTaskTimers(id);
                    mapRef.current.set(id, {
                        ...current,
                        status: 'error',
                        phase: 'Cancel failed',
                        progressLabel: parseTauriError(err) || 'Cancel failed',
                        completedAt: Date.now(),
                    });
                    bump();
                    const timer = setTimeout(() => {
                        mapRef.current.delete(id);
                        taskTimersRef.current.delete(id);
                        bump();
                    }, 5000);
                    taskTimersRef.current.set(id, timer);
                }
            }
        };
        void doCancel();
    }, [bump, clearTaskTimers]);

    // ── Watch JobStatusContext for scan / categorize jobs ─────────────────────
    // This is NOT a direct job:status listener — it reacts to the `jobs` map
    // from JobStatusContext via useEffect, so it always sees post-remap state.
    // See the architecture comment in JobStatusContext for the full design.

    useEffect(() => {
        const taskMap = mapRef.current;

        for (const [jobKey, jobStatus] of jobs) {
            const isJobActive = ACTIVE_JOB_PHASES.has(jobStatus.phase);
            const isJobTerminal = !isJobActive;

            // For done-phase scan jobs, the job key may have been remapped to receiptId.
            // Recover the original imagePath to find the correct task entry.
            const originalKey =
                jobStatus.phase === 'done' && jobStatus.record?.imagePath
                    ? jobStatus.record.imagePath
                    : jobKey;

            const taskKey = taskMap.has(originalKey)
                ? originalKey
                : taskMap.has(jobKey)
                    ? jobKey
                    : originalKey;

            const existing = taskMap.get(taskKey);
            const kind = detectKind(jobKey);

            if (isJobActive) {
                const waypoint = resolveWaypoint('', jobStatus.phase);
                const target = waypoint ?? 0;
                const label = phaseToPhaseLabel(jobStatus.phase, kind);

                // Create a fresh task when none exists yet, or when an older
                // completed/cancelled/errored task exists for the same key (rescan).
                const needsCreate = !existing || existing.status === 'cancelled' || existing.status === 'error' || existing.status === 'done';

                if (needsCreate) {
                    // Clear any stale timers for the old completed task, if any.
                    if (existing) clearTaskTimers(taskKey);
                    const task: Task = {
                        id: taskKey,
                        kind,
                        title: kind === 'scan' ? 'Scanning Receipt' : 'Categorizing Items',
                        phase: label,
                        progress: 0, // always start at 0 — tick will animate up
                        progressLabel: label,
                        status: 'active',
                        canCancel: true,
                        createdAt: Date.now(),
                        _progressTarget: target,
                        _jobKey: jobKey,
                    };
                    taskMap.set(taskKey, task);
                    bump();
                } else if (existing.status === 'active') {
                    // Update phase; advance _progressTarget but do NOT snap progress —
                    // the smooth-tick loop will creep the bar to the new target.
                    const newTarget = Math.max(existing._progressTarget, target);
                    // Always update the label when the job phase changes, even if
                    // the numeric target hasn't advanced (e.g. categorizing after saving).
                    const phaseChanged = label !== existing.phase;
                    taskMap.set(taskKey, {
                        ...existing,
                        phase: phaseChanged ? label : existing.phase,
                        progressLabel: phaseChanged ? label : existing.progressLabel,
                        // Keep current animated progress; only move the target forward.
                        _progressTarget: newTarget,
                        _jobKey: jobKey,
                    });
                    bump();
                }
                // Do NOT update tasks in 'cancelling' status from active events —
                // only the terminal event should transition them.
            } else if (isJobTerminal && existing && (existing.status === 'active' || existing.status === 'cancelling')) {
                // Terminal phase — transition task to completed state.
                const terminalStatus: Task['status'] =
                    jobStatus.phase === 'done' ? 'done'
                        : jobStatus.phase === 'cancelled' ? 'cancelled'
                            : 'error';
                clearTaskTimers(taskKey);
                taskMap.set(taskKey, {
                    ...existing,
                    status: terminalStatus,
                    phase: phaseToPhaseLabel(jobStatus.phase, existing.kind),
                    progressLabel: phaseToPhaseLabel(jobStatus.phase, existing.kind),
                    progress: terminalStatus === 'done' ? 100 : existing.progress,
                    _progressTarget: terminalStatus === 'done' ? 100 : existing._progressTarget,
                    completedAt: Date.now(),
                });
                bump();
                // Auto-remove after 5 seconds.
                const thisTaskKey = taskKey;
                const timer = setTimeout(() => {
                    const t = taskMap.get(thisTaskKey);
                    if (t && t.status !== 'active') {
                        taskMap.delete(thisTaskKey);
                        taskTimersRef.current.delete(thisTaskKey);
                        bump();
                    }
                }, 5000);
                taskTimersRef.current.set(thisTaskKey, timer);
            }
        }

        // Clean up tasks for jobs that vanished without a terminal event.
        for (const [taskId, task] of taskMap) {
            if (task.status !== 'active' && task.status !== 'cancelling') continue;
            if (task.kind !== 'scan' && task.kind !== 'categorize') continue;
            const jobStillPresent =
                jobs.has(taskId) ||
                Array.from(jobs.values()).some(
                    (j) => j.record?.imagePath === taskId || j.jobKey === taskId,
                );
            if (!jobStillPresent) {
                clearTaskTimers(taskId);
                taskMap.set(taskId, { ...task, status: 'cancelled', completedAt: Date.now() });
                bump();
                const timer = setTimeout(() => {
                    taskMap.delete(taskId);
                    taskTimersRef.current.delete(taskId);
                    bump();
                }, 3000);
                taskTimersRef.current.set(taskId, timer);
            }
        }
    }, [jobs, bump, clearTaskTimers]);

    // ── Global scan-progress listener ─────────────────────────────────────────

    useEffect(() => {
        const unlisten = listen<string>(AppEvents.SCAN_PROGRESS, ({ payload: msg }) => {
            const taskMap = mapRef.current;
            const trimmed = msg.trim();

            // Find the active scan task that is currently running (oldest in
            // the FIFO queue — i.e. the one with the smallest createdAt).
            let activeTask: Task | undefined;
            for (const t of taskMap.values()) {
                if (t.kind === 'scan' && t.status === 'active') {
                    if (!activeTask || t.createdAt < activeTask.createdAt) {
                        activeTask = t;
                    }
                }
            }
            if (!activeTask) return;

            const waypoint = resolveWaypoint(trimmed, 'scanning');
            if (waypoint == null) return;

            const newTarget = Math.max(activeTask._progressTarget, waypoint);
            if (newTarget === activeTask._progressTarget && trimmed === activeTask.progressLabel) return;

            taskMap.set(activeTask.id, {
                ...activeTask,
                progressLabel: trimmed,
                phase: trimmed,
                _progressTarget: newTarget,
                // Snap progress directly to the waypoint — it represents real work done.
                progress: Math.max(activeTask.progress, newTarget),
            });
            bump();
        });
        return () => { void unlisten.then((fn) => fn()); };
    }, [bump]);

    // ── Categorize creep: add +5% every 2 seconds when categorizing ──────────

    useEffect(() => {
        const interval = setInterval(() => {
            let changed = false;
            for (const [id, task] of mapRef.current) {
                if (task.kind !== 'categorize' || task.status !== 'active') continue;
                const cap = 80;
                if (task._progressTarget >= cap) continue;
                const newTarget = Math.min(task._progressTarget + 5, cap);
                mapRef.current.set(id, { ...task, _progressTarget: newTarget });
                changed = true;
            }
            if (changed) bump();
        }, 2000);
        return () => clearInterval(interval);
    }, [bump]);

    // ── Smooth progress ticker ────────────────────────────────────────────────

    useEffect(() => {
        const interval = setInterval(() => {
            let changed = false;
            for (const [id, task] of mapRef.current) {
                if (task.status !== 'active') continue;
                if (task.progress >= task._progressTarget) continue;
                const cap = task._progressTarget === 100 ? 100 : task._progressTarget - CREEP_CAP;
                if (task.progress >= cap) continue;
                const newProgress = Math.min(task.progress + CREEP_STEP, cap);
                if (newProgress <= task.progress) continue;
                mapRef.current.set(id, { ...task, progress: newProgress });
                changed = true;
            }
            if (changed) bump();
        }, TICK_MS);
        return () => clearInterval(interval);
    }, [bump]);

    // ── Derived task list (sorted: active first, then by createdAt desc) ──────

    const tasks = useMemo(
        () =>
            Array.from(mapRef.current.values()).sort((a, b) => {
                const aRunning = a.status === 'active' || a.status === 'cancelling';
                const bRunning = b.status === 'active' || b.status === 'cancelling';
                if (aRunning && !bRunning) return -1;
                if (!aRunning && bRunning) return 1;
                // Active tasks: oldest first (FIFO — the earliest-submitted job is running).
                // Terminal tasks: newest first (most recent result on top).
                if (aRunning && bRunning) return a.createdAt - b.createdAt;
                return b.createdAt - a.createdAt;
            }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [version],
    );

    const value = useMemo<TaskManagerContextValue>(
        () => ({ tasks, addTask, updateTask, completeTask, removeTask, cancelTask, markTaskCancelling }),
        [tasks, addTask, updateTask, completeTask, removeTask, cancelTask, markTaskCancelling],
    );

    return (
        <TaskManagerContext.Provider value={value}>
            {children}
        </TaskManagerContext.Provider>
    );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useTaskManager(): TaskManagerContextValue {
    const ctx = useContext(TaskManagerContext);
    if (!ctx) throw new Error('useTaskManager must be used within <TaskManagerProvider>');
    return ctx;
}
