/**
 * useModelDownloadTask — bridges ModelDownloadContext → TaskManagerContext.
 *
 * Mount this hook once inside the TaskManagerProvider (at the app root level)
 * so model download state is mirrored as a task in the global task manager.
 *
 * Uses a stable constant task ID ('model-download') so there is never more
 * than one model-download task in the list at any given time.
 */
import { useEffect, useRef } from 'react';
import { useModelDownload } from './useModelDownload';
import { useTaskManager } from '../context/TaskManagerContext';
import { formatBytes } from '../utils/fileFormatting';

const MODEL_TASK_ID = 'model-download';

export function useModelDownloadTask(): void {
    const { downloading, progress, error, allModelsReady, handleCancel, cancelling } = useModelDownload();
    const { addTask, updateTask, completeTask, removeTask, markTaskCancelling } = useTaskManager();

    const taskExistsRef = useRef(false);
    const wasDownloadingRef = useRef(false);

    // Lifecycle: create task when downloading starts, resolve when it stops.
    useEffect(() => {
        if (downloading) {
            wasDownloadingRef.current = true;
            if (!taskExistsRef.current) {
                taskExistsRef.current = true;
                addTask({
                    id: MODEL_TASK_ID,
                    kind: 'model-download',
                    title: 'Downloading AI Models',
                    phase: 'Downloading…',
                    progress: 0,
                    progressLabel: 'Starting…',
                    canCancel: true,
                    onCancel: () => void handleCancel(),
                });
            }
        } else if (wasDownloadingRef.current) {
            wasDownloadingRef.current = false;
            if (!taskExistsRef.current) return;

            if (error) {
                completeTask(MODEL_TASK_ID, 'error');
            } else if (allModelsReady) {
                completeTask(MODEL_TASK_ID, 'done');
            } else {
                completeTask(MODEL_TASK_ID, 'cancelled');
            }
            taskExistsRef.current = false;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [downloading, error, allModelsReady]);

    // Progress updates while downloading.
    useEffect(() => {
        if (!taskExistsRef.current || !progress) return;
        const pct =
            progress.totalBytes > 0
                ? Math.min(100, Math.round((progress.downloadedBytes / progress.totalBytes) * 100))
                : 0;
        const label =
            progress.totalBytes > 0
                ? `${formatBytes(progress.downloadedBytes)} of ${formatBytes(progress.totalBytes)} · ${pct}%`
                : 'Starting…';
        updateTask(MODEL_TASK_ID, {
            progress: pct,
            progressLabel: label,
            phase: label,
        });
    }, [progress, updateTask]);

    // Keep the onCancel callback current (handleCancel is stable but refresh defensively).
    useEffect(() => {
        if (!taskExistsRef.current) return;
        updateTask(MODEL_TASK_ID, { onCancel: () => void handleCancel() });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [handleCancel]);

    // Mirror ModelDownloadContext.cancelling into the task manager so the task
    // widget shows 'Cancelling…' immediately regardless of which UI surface
    // initiated the cancel (inline banner or the task widget itself).
    useEffect(() => {
        if (!cancelling || !taskExistsRef.current) return;
        markTaskCancelling(MODEL_TASK_ID);
        // markTaskCancelling is stable; cancelling is the only reactive input.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cancelling]);

    // Cleanup: remove orphaned task on unmount.
    useEffect(() => {
        return () => {
            if (taskExistsRef.current) {
                removeTask(MODEL_TASK_ID);
                taskExistsRef.current = false;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
}
