import { useState, useEffect, useCallback } from 'react';
import { STORAGE_KEYS, CUSTOM_EVENTS, DEFAULT_LOCATION } from '../constants';

export function useLocationPreference() {
    const [location, setLocation] = useState<string>(() => {
        try {
            const v = localStorage.getItem(STORAGE_KEYS.LOCATION);
            return v || DEFAULT_LOCATION;
        } catch {
            return DEFAULT_LOCATION;
        }
    });

    // Persist to localStorage and notify other same-window hook instances
    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEYS.LOCATION, location);
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent(CUSTOM_EVENTS.LOCATION_CHANGE, { detail: location }));
            }
        } catch {
            // ignore errors setting localStorage (read-only environments, etc.)
        }
    }, [location]);

    // Sync across tabs and same-window custom events
    useEffect(() => {
        function onStorage(e: StorageEvent) {
            if (e.key === STORAGE_KEYS.LOCATION && typeof e.newValue === 'string') {
                setLocation(e.newValue);
            }
        }

        function onCustom(e: Event) {
            const ce = e as CustomEvent<string>;
            if (ce?.detail && ce.detail !== location) {
                setLocation(ce.detail);
            }
        }

        window.addEventListener('storage', onStorage);
        window.addEventListener(CUSTOM_EVENTS.LOCATION_CHANGE, onCustom as EventListener);
        return () => {
            window.removeEventListener('storage', onStorage);
            window.removeEventListener(CUSTOM_EVENTS.LOCATION_CHANGE, onCustom as EventListener);
        };
    }, [location]);

    const set = useCallback((v: string) => setLocation(v), []);

    return { location, setLocation: set };
}
