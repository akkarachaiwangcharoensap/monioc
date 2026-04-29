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
import { TauriApi } from '../services/api';
import { listen } from '@tauri-apps/api/event';
import { useAppEvents } from '../hooks/useAppEvents';
import type { ReceiptScanRecord, ReceiptDeletedPayload } from '../types';
import { receiptDataSignature } from '../utils/receipt-scanner/receiptData';
import { AppEvents } from '../constants';

// ── Context shape ─────────────────────────────────────────────────────────────

interface ReceiptCacheContextValue {
    /** All receipts, sorted newest-first by createdAt. Reactive on every cache patch. */
    receipts: ReceiptScanRecord[];
    /** True while the initial list fetch is in-flight. */
    isInitialLoading: boolean;
    /** O(1) lookup by id. */
    getReceipt: (id: number) => ReceiptScanRecord | undefined;
    /** Optimistically write one record into the cache (patches a single entry). */
    applyOptimistic: (record: ReceiptScanRecord) => void;
    /** Alias for applyOptimistic, used by JobStatusContext on scan completion. */
    applyUpdate: (record: ReceiptScanRecord) => void;
    /** Optimistically remove one record from the cache. */
    applyOptimisticDelete: (id: number) => void;
    /** Re-fetch the full list from the backend (recovery path after errors). */
    forceReload: () => Promise<void>;
}

const ReceiptCacheContext = createContext<ReceiptCacheContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

export function ReceiptCacheProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
    const mapRef = useRef(new Map<number, ReceiptScanRecord>());
    const [version, setVersion] = useState(0);
    const [isInitialLoading, setIsInitialLoading] = useState(true);

    const bump = useCallback(() => setVersion((v) => v + 1), []);

    const receipts = useMemo(
        () =>
            Array.from(mapRef.current.values()).sort(
                (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
            ),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [version],
    );

    const getReceipt = useCallback((id: number) => mapRef.current.get(id), []);

    const applyOptimistic = useCallback(
        (record: ReceiptScanRecord) => {
            mapRef.current.set(record.id, record);
            bump();
        },
        [bump],
    );

    const applyOptimisticDelete = useCallback(
        (id: number) => {
            if (mapRef.current.delete(id)) bump();
        },
        [bump],
    );

    const forceReload = useCallback(async () => {
        const scans = await TauriApi.listReceiptScans();
        mapRef.current.clear();
        for (const s of scans) mapRef.current.set(s.id, s);
        bump();
    }, [bump]);

    // Initial load — runs once on mount.
    useEffect(() => {
        void (async () => {
            try {
                const scans = await TauriApi.listReceiptScans();
                for (const s of scans) mapRef.current.set(s.id, s);
                bump();
            } finally {
                setIsInitialLoading(false);
            }
        })();
    }, [bump]);

    // Tauri event listeners — registered once for the app lifetime.
    useAppEvents({
        onReceiptSaved: useCallback(
            (payload: ReceiptScanRecord) => {
                const existing = mapRef.current.get(payload.id);
                if (
                    existing &&
                    existing.updatedAt === payload.updatedAt &&
                    receiptDataSignature(existing.data) === receiptDataSignature(payload.data)
                ) {
                    return; // deduplicate identical updates
                }
                mapRef.current.set(payload.id, payload);
                bump();
            },
            [bump],
        ),
        onReceiptDeleted: useCallback(
            ({ id }: ReceiptDeletedPayload) => {
                if (mapRef.current.delete(id)) bump();
            },
            [bump],
        ),
    });

    // Reload all receipts after a backup restore replaces the entire database.
    useEffect(() => {
        const unlisten = listen(AppEvents.DATA_RESTORED, () => void forceReload());
        return () => { void unlisten.then((fn) => fn()); };
    }, [forceReload]);

    const value = useMemo<ReceiptCacheContextValue>(
        () => ({ receipts, isInitialLoading, getReceipt, applyOptimistic, applyUpdate: applyOptimistic, applyOptimisticDelete, forceReload }),
        [receipts, isInitialLoading, getReceipt, applyOptimistic, applyOptimisticDelete, forceReload],
    );

    return <ReceiptCacheContext.Provider value={value}>{children}</ReceiptCacheContext.Provider>;
}

export function useReceiptCache(): ReceiptCacheContextValue {
    const ctx = useContext(ReceiptCacheContext);
    if (!ctx) throw new Error('useReceiptCache must be used within ReceiptCacheProvider');
    return ctx;
}
