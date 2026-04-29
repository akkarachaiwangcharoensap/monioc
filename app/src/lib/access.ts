/**
 * User access types — shared between the client and the access API response.
 *
 * Two independent axes:
 *   isPro        — one-time lifetime purchase
 *   isSubscribed — monthly Cloud Pass add-on (any user can subscribe)
 *
 * All other capabilities are derived from those two booleans.
 */
export interface UserAccess {
    /** One-time Pro purchase active. */
    isPro: boolean;
    /** Cloud Pass subscription active. */
    isSubscribed: boolean;

    canExport: boolean;
    canCustomCategories: boolean;
    canAdvancedAnalytics: boolean;
    canCloudCompute: boolean;
    canCloudSync: boolean;
    canEncryptedBackup: boolean;
    hasEarlyAccess: boolean;
    supportPriority: 'standard' | 'priority';
    deviceLimit: number;
}

// ── Device limits ─────────────────────────────────────────────────────────────
const DEVICE_LIMIT_FREE = 1;
const DEVICE_LIMIT_PRO = 3;
const DEVICE_LIMIT_FREE_SUB = 3;
const DEVICE_LIMIT_PRO_SUB = 5;

/** Build a complete UserAccess from the two independent axes. */
export function buildAccess(isPro: boolean, isSubscribed: boolean): UserAccess {
    const deviceLimit = isPro
        ? (isSubscribed ? DEVICE_LIMIT_PRO_SUB : DEVICE_LIMIT_PRO)
        : (isSubscribed ? DEVICE_LIMIT_FREE_SUB : DEVICE_LIMIT_FREE);

    return {
        isPro,
        isSubscribed,
        canExport: isPro,
        canCustomCategories: isPro,
        canAdvancedAnalytics: isPro,
        canCloudCompute: isSubscribed,
        canCloudSync: isSubscribed,
        canEncryptedBackup: isSubscribed,
        hasEarlyAccess: isSubscribed,
        supportPriority: isSubscribed ? 'priority' : 'standard',
        deviceLimit,
    };
}

/** Default access for free / unauthenticated users. */
export const FREE_ACCESS: UserAccess = buildAccess(false, false);

/** Access for Pro-only users (no subscription). */
export const PRO_ACCESS: UserAccess = buildAccess(true, false);

/** Access for free users with an active Cloud Pass subscription. */
export const FREE_SUBSCRIBED_ACCESS: UserAccess = buildAccess(false, true);

/** Access for Pro users with an active Cloud Pass subscription. */
export const PRO_SUBSCRIBED_ACCESS: UserAccess = buildAccess(true, true);
