import { useEffect, useLayoutEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { AppEvents } from '../constants';
import type { ReceiptDeletedPayload, ReceiptScanRecord } from '../types';

export interface AppEventHandlers {
    onReceiptSaved?: (record: ReceiptScanRecord) => void;
    onReceiptDeleted?: (payload: ReceiptDeletedPayload) => void;
    onScanProgress?: (msg: string) => void;
}

/**
 * Subscribes to Tauri app-level events for the lifetime of the calling component.
 * Uses a stable handler ref pattern so callers can safely capture fresh state
 * (e.g. via useCallback) without causing the listeners to be re-registered on
 * every render.
 */
export function useAppEvents(handlers: AppEventHandlers): void {
    const handlersRef = useRef<AppEventHandlers>(handlers);

    // Keep the ref current on every render without re-registering listeners.
    useLayoutEffect(() => {
        handlersRef.current = handlers;
    });

    useEffect(() => {
        const unlistens: Array<Promise<() => void>> = [];

        if (handlers.onReceiptSaved !== undefined) {
            unlistens.push(
                listen<ReceiptScanRecord>(AppEvents.RECEIPT_SAVED, ({ payload }) =>
                    handlersRef.current.onReceiptSaved?.(payload),
                ),
            );
        }

        if (handlers.onReceiptDeleted !== undefined) {
            unlistens.push(
                listen<ReceiptDeletedPayload>(AppEvents.RECEIPT_DELETED, ({ payload }) =>
                    handlersRef.current.onReceiptDeleted?.(payload),
                ),
            );
        }

        if (handlers.onScanProgress !== undefined) {
            unlistens.push(
                listen<string>(AppEvents.SCAN_PROGRESS, ({ payload }) =>
                    handlersRef.current.onScanProgress?.(payload),
                ),
            );
        }

        return () => {
            for (const p of unlistens) void p.then((fn) => fn());
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
}
