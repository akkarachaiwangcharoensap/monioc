/**
 * Offline access cache — stores the last known access state in localStorage
 * so the app can function during network outages.
 *
 * The cache has a 7-day grace period; after that, the user must re-authenticate.
 */
import type { UserAccess } from './access';

const STORAGE_KEY = 'app.access_cache';
const OFFLINE_GRACE_DAYS = 7;

export function cacheAccessState(access: UserAccess): void {
    try {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({ ...access, cachedAt: Date.now() }),
        );
    } catch {
        // Ignore storage write errors (e.g. quota exceeded)
    }
}

export function getCachedAccess(): UserAccess | null {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;

        const cached = JSON.parse(raw) as UserAccess & { cachedAt: number };
        const ageMs = Date.now() - cached.cachedAt;

        if (ageMs > OFFLINE_GRACE_DAYS * 24 * 60 * 60 * 1000) {
            // Cache expired — clear and require re-auth
            localStorage.removeItem(STORAGE_KEY);
            return null;
        }

        return cached;
    } catch {
        return null;
    }
}

export function clearAccessCache(): void {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch {
        // Ignore
    }
}
