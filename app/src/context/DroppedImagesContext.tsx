import { createContext, useCallback, useContext, useRef } from 'react';
import type React from 'react';

/**
 * DroppedImagesContext — minimal handoff between the global drag-drop handler
 * (registered in App.tsx) and NewScanPage, which consumes the dropped paths on
 * mount.
 *
 * Using a ref-based approach (not state) avoids triggering re-renders in the
 * provider when paths are added. NewScanPage calls consumeDroppedPaths() in its
 * mount effect and gets whatever was queued, then the buffer is cleared.
 */

interface DroppedImagesContextValue {
    /** Append paths to the pending buffer. Called by the global drop handler. */
    addDroppedPaths: (paths: string[]) => void;
    /**
     * Return all pending paths and clear the buffer. Called by NewScanPage
     * on mount to pick up any paths that were dropped before it rendered.
     */
    consumeDroppedPaths: () => string[];
}

const DroppedImagesContext = createContext<DroppedImagesContextValue | null>(null);

export function DroppedImagesProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
    const pendingRef = useRef<string[]>([]);

    const addDroppedPaths = useCallback((paths: string[]) => {
        pendingRef.current = [...pendingRef.current, ...paths];
    }, []);

    const consumeDroppedPaths = useCallback((): string[] => {
        const result = pendingRef.current;
        pendingRef.current = [];
        return result;
    }, []);

    return (
        <DroppedImagesContext.Provider value={{ addDroppedPaths, consumeDroppedPaths }}>
            {children}
        </DroppedImagesContext.Provider>
    );
}

export function useDroppedImages(): DroppedImagesContextValue {
    const ctx = useContext(DroppedImagesContext);
    if (!ctx) throw new Error('useDroppedImages must be used within DroppedImagesProvider');
    return ctx;
}
