/**
 * TaskManagerWidget — floating persistent task manager at bottom-right.
 *
 * Always present in the DOM (never returns null).
 *
 * Z-index strategy:
 *   - z-[45]: all collapsed/idle states (below BulkActionBar z-50)
 *   - z-[45]: expanded panel (same — user can always use the navbar above it)
 *
 * Visual states:
 *   A. Expanded: card panel listing all tasks
 *   B. Active: animated status pill (tasks running)
 *   C. Idle: small circular button, slides off to the right when no tasks,
 *      with a peek chevron-tab that brings it back
 */
import { useEffect, useState } from 'react';
import type React from 'react';
import { useTaskManager } from '../../context/TaskManagerContext';
import TaskRow from './TaskRow';

export default function TaskManagerWidget(): React.JSX.Element {
    const { tasks } = useTaskManager();
    const [expanded, setExpanded] = useState<boolean>(() => {
        try {
            return localStorage.getItem('task-manager-expanded') === 'true';
        } catch {
            return false;
        }
    });
    // slideOut: widget is mostly off-screen, only a small peek-arrow is visible.
    const [slideOut, setSlideOut] = useState<boolean>(true);

    const activeTasks = tasks.filter((t) => t.status === 'active' || t.status === 'cancelling');
    const activeCount = activeTasks.length;
    const hasVisibleTasks = tasks.length > 0;

    // Auto-reveal when tasks appear; collapse to pill so the pill is visible.
    useEffect(() => {
        if (hasVisibleTasks) {
            setSlideOut(false);
            if (activeCount > 0) {
                setExpanded(false); // collapse to pill when active tasks appear
            }
        }
    }, [hasVisibleTasks, activeCount]);

    // Auto-minimize (slide off-screen) when all tasks have been evicted.
    useEffect(() => {
        if (!hasVisibleTasks) {
            setSlideOut(true);
            setExpanded(false);
        }
    }, [hasVisibleTasks]);

    const handleToggle = () => {
        setExpanded((prev) => {
            const next = !prev;
            try { localStorage.setItem('task-manager-expanded', String(next)); } catch { /* ignore */ }
            return next;
        });
    };

    // ── A. Expanded panel ─────────────────────────────────────────────────────
    if (expanded) {
        return (
            <div
                className="fixed bottom-5 right-5 z-[45] w-80 bg-white rounded-2xl shadow-2xl shadow-slate-200/60 border border-slate-100 overflow-hidden"
                role="complementary"
                aria-label="Task Manager"
            >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/60">
                    <div className="flex items-center gap-2">
                        {activeCount > 0 ? (
                            <i className="fas fa-circle-notch fa-spin text-violet-500 text-xs" aria-hidden="true" />
                        ) : (
                            <i className="fas fa-check-circle text-emerald-500 text-xs" aria-hidden="true" />
                        )}
                        <span className="text-[13px] font-semibold text-slate-800">
                            {activeCount > 0
                                ? `${activeCount} task${activeCount > 1 ? 's' : ''} running`
                                : 'All tasks complete'}
                        </span>
                    </div>
                    <button
                        type="button"
                        onClick={handleToggle}
                        className="w-6 h-6 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors cursor-pointer"
                        aria-label="Minimise task panel"
                    >
                        <i className="fas fa-chevron-down text-[9px] text-slate-500" aria-hidden="true" />
                    </button>
                </div>

                {/* Task list */}
                <div className="divide-y divide-slate-50 max-h-[28rem] overflow-y-auto">
                    {tasks.length === 0 ? (
                        <p className="py-5 text-center text-[12px] text-slate-400">No recent tasks</p>
                    ) : (
                        tasks.map((task) => <TaskRow key={task.id} task={task} />)
                    )}
                </div>
            </div>
        );
    }

    // ── B. Status pill (tasks visible — active, cancelling, or recently finished) ─
    // Show the pill whenever there are visible tasks so cancel/done feedback is seen.
    if (hasVisibleTasks) {
        // Derive pill content from the most relevant task (active first, then newest terminal).
        const primaryTask = activeTasks[0] ?? tasks[0];
        const isCancelling = primaryTask?.status === 'cancelling';
        const isRunning = activeCount > 0;
        const pillIcon = isCancelling
            ? 'fa-ban text-amber-500'
            : isRunning
                ? 'fa-circle-notch fa-spin text-violet-500'
                : primaryTask?.status === 'done'
                    ? 'fa-check text-emerald-500'
                    : primaryTask?.status === 'cancelled'
                        ? 'fa-minus text-slate-400'
                        : 'fa-xmark text-red-500';
        const pillLabel = isCancelling
            ? 'Cancelling…'
            : isRunning
                ? (activeCount > 1 ? `${activeCount} tasks running` : (primaryTask?.title ?? 'Task running'))
                : (primaryTask?.status === 'done' ? 'Task complete' : primaryTask?.title ?? 'Task finished');

        const singleActiveTask = activeCount === 1 ? activeTasks[0] : null;
        const progressPct = singleActiveTask?.progress ?? 0;

        return (
            <div className="fixed bottom-5 right-5 z-[45]">
                <button
                    type="button"
                    onClick={handleToggle}
                    className="relative flex items-center gap-1 bg-white rounded-full px-4 py-2.5 shadow-xl shadow-slate-200/70 border border-slate-200/80 hover:shadow-2xl transition-shadow cursor-pointer max-w-[260px] overflow-hidden"
                    aria-label={isRunning ? `Show tasks (${activeCount} active)` : 'Show completed tasks'}
                >
                    {/* Thin progress bar along the bottom of the pill */}
                    {isRunning && progressPct > 0 && (
                        <div
                            className="absolute bottom-0 left-0 h-0.5 bg-violet-400 rounded-full transition-all duration-300"
                            style={{ width: `${progressPct}%` }}
                            aria-hidden="true"
                        />
                    )}
                    <i className={`fas ${pillIcon} text-sm flex-shrink-0`} aria-hidden="true" />
                    <div className="min-w-0">
                        <p className="text-[12px] text-left font-semibold text-slate-700 truncate leading-tight">
                            {pillLabel}
                        </p>
                        {isRunning && singleActiveTask && (
                            <p className="text-[11px] text-slate-400 truncate leading-none mt-0.5 pb-1">
                                {singleActiveTask.progressLabel || singleActiveTask.phase}
                            </p>
                        )}
                    </div>
                    {isRunning && activeCount > 1 && (
                        <span className="ml-1 min-w-[20px] h-5 rounded-full bg-violet-500 text-white text-[10px] font-bold flex items-center justify-center px-1 flex-shrink-0">
                            {activeCount}
                        </span>
                    )}
                </button>
            </div>
        );
    }

    // ── C. Idle button — slides off right, peek-arrow to restore ─────────────
    //
    // Layout (right-0, items row): [chevron-tab][circular-button]
    // Hidden: translate-x-[40px] → hides the 40px button, tab peeks ~4px.
    // Visible: translate-x-0 → button at right:0 (touching screen edge).
    //   We offset the button slightly from the edge using padding inside it.
    if (slideOut) {
        return (
            <button
                type="button"
                onClick={() => setSlideOut(false)}
                className="fixed bottom-5 right-0 z-[45] w-4 h-8 bg-white rounded-l-xl border border-r-0 border-slate-200 shadow-md flex items-center justify-center hover:bg-slate-50 transition-colors cursor-pointer"
                aria-label="Show task manager"
            >
                <i className="fas fa-chevron-left text-[9px] text-slate-400" aria-hidden="true" />
            </button>
        );
    }

    // Fully visible idle button
    return (
        <div className="fixed bottom-5 right-3 z-[45] flex items-center gap-0">
            {/* Dismiss tab — slides it back off screen */}
            <button
                type="button"
                onClick={() => setSlideOut(true)}
                className="w-4 h-8 bg-white rounded-l-lg border border-r-0 border-slate-200 shadow flex items-center justify-center hover:bg-slate-50 transition-colors cursor-pointer"
                aria-label="Hide task manager"
            >
                <i className="fas fa-chevron-right text-[9px] text-slate-400" aria-hidden="true" />
            </button>
            <button
                type="button"
                onClick={handleToggle}
                className="w-6 h-8 px-4 rounded-r-lg rounded-l-none bg-white shadow-md border border-slate-200/80 hover:shadow-lg flex items-center justify-center transition-shadow cursor-pointer"
                aria-label="Show tasks"
            >
                {tasks.length > 0 ? (
                    <i className="fas fa-check text-emerald-500 text-sm" aria-hidden="true" />
                ) : (
                    <i className="fas fa-inbox text-slate-400 text-sm" aria-hidden="true" />
                )}
            </button>
        </div>
    );
}
