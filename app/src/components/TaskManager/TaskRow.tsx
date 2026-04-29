/**
 * A single task row inside the expanded TaskManagerWidget panel.
 * Shows: icon, title, animated progress bar, phase label, cancel or dismiss button.
 */
import type React from 'react';
import type { Task } from '../../context/TaskManagerContext';
import { useTaskManager } from '../../context/TaskManagerContext';

interface Props {
    task: Task;
}

function kindIcon(kind: Task['kind']): string {
    switch (kind) {
        case 'scan': return 'fa-receipt';
        case 'categorize': return 'fa-tags';
        case 'model-download': return 'fa-download';
        default: return 'fa-clock';
    }
}

function statusIcon(status: Task['status']): { icon: string; color: string } {
    switch (status) {
        case 'done': return { icon: 'fa-check', color: 'text-emerald-500' };
        case 'error': return { icon: 'fa-xmark', color: 'text-red-500' };
        case 'cancelled': return { icon: 'fa-minus', color: 'text-slate-400' };
        case 'cancelling': return { icon: 'fa-circle-notch fa-spin', color: 'text-amber-400' };
        default: return { icon: 'fa-circle-notch fa-spin', color: 'text-blue-500' };
    }
}

export default function TaskRow({ task }: Props): React.JSX.Element {
    const { tasks, cancelTask, removeTask } = useTaskManager();
    const { icon: stIcon, color: stColor } = statusIcon(task.status);
    const isTerminal = task.status !== 'active' && task.status !== 'cancelling';

    // Compute FIFO position among active/cancelling tasks.
    // tasks are already sorted oldest-first for active tasks (FIFO order from context).
    const activeTasks = tasks.filter((t) => t.status === 'active' || t.status === 'cancelling');
    const queueIndex = activeTasks.findIndex((t) => t.id === task.id);
    // queueIndex 0 = oldest = currently running; 1+ = waiting in queue
    const isWaitingInQueue = queueIndex > 0;

    return (
        <div className="flex items-start gap-3 p-4 first:pt-3 last:pb-3">
            {/* Kind icon */}
            <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <i className={`fas ${kindIcon(task.kind)} text-slate-500 text-sm`} aria-hidden="true" />
            </div>

            {/* Main content */}
            <div className="flex-1 min-w-0 space-y-1.5">
                {/* Title row */}
                <div className="flex items-center justify-between gap-2">
                    <p className="text-[13px] font-semibold text-slate-800 leading-tight truncate">
                        {task.title}
                    </p>
                    {/* Status indicator */}
                    <i className={`fas ${stIcon} ${stColor} text-[11px] flex-shrink-0`} aria-hidden="true" />
                </div>

                {/* Progress bar */}
                <div className="h-[6px] w-full rounded-full bg-slate-100 overflow-hidden">
                    {task.status === 'active' ? (
                        <div
                            className="h-full rounded-full bg-blue-500 transition-all duration-300 ease-out"
                            style={{ width: `${Math.max(0, Math.min(100, task.progress))}%` }}
                        />
                    ) : task.status === 'cancelling' ? (
                        <div
                            className="h-full rounded-full bg-amber-400 transition-all duration-300 ease-out"
                            style={{ width: `${Math.max(0, Math.min(100, task.progress))}%` }}
                        />
                    ) : task.status === 'done' ? (
                        <div className="h-full w-full rounded-full bg-emerald-400" />
                    ) : task.status === 'error' ? (
                        <div className="h-full w-full rounded-full bg-red-400" />
                    ) : (
                        <div className="h-full w-full rounded-full bg-slate-300" />
                    )}
                </div>

                {/* Phase label — surfaces progress text so E2E selectors can find it */}
                <p
                    className={`text-[11px] leading-none truncate mt-1.5 ${isWaitingInQueue ? 'text-amber-500' : 'text-slate-400'}`}
                    title={task.progressLabel}
                >
                    {isWaitingInQueue
                        ? `In queue · #${queueIndex + 1}`
                        : (task.progressLabel || task.phase)}
                </p>

                {/* Cancel button — only when actively running */}
                {task.canCancel && task.status === 'active' && (
                    <button
                        type="button"
                        onClick={() => cancelTask(task.id)}
                        className="mt-1 inline-flex items-center gap-1 text-[11px] bg-slate-100 hover:bg-red-50 border border-slate-200 hover:border-red-200 text-slate-500 hover:text-red-600 rounded-md px-2 py-0.5 transition-colors cursor-pointer"
                    >
                        <i className="fas fa-times text-[9px]" aria-hidden="true" />
                        Cancel
                    </button>
                )}

                {/* Cancelling label */}
                {task.status === 'cancelling' && (
                    <span className="mt-1 inline-block text-[11px] text-amber-600">
                        Cancelling…
                    </span>
                )}

                {/* Dismiss button — for terminal tasks */}
                {isTerminal && (
                    <button
                        type="button"
                        onClick={() => removeTask(task.id)}
                        className="mt-1 inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                        aria-label="Dismiss"
                    >
                        <i className="fas fa-times text-[9px]" aria-hidden="true" />
                        Dismiss
                    </button>
                )}
            </div>
        </div>
    );
}
