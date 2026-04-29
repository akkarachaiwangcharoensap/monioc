// Open-source edition: no auth, no payments, no licensing.

/** Whether we're running inside a Tauri WebView. */
export const IS_TAURI: boolean =
    typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

// Retained for compatibility with imports that reference these — all are no-ops.
export const API_URL = '';
export const AUTH_ENABLED = false;
export const SUBSCRIPTION_ENABLED = false;
export function getTierOverride(): null { return null; }
