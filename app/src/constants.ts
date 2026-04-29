/**
 * Application-wide constants.
 *
 * Framework-independent values (categories, colors, price thresholds, etc.) are
 * the canonical source-of-truth in @monioc/shared and re-exported here so that
 * existing `import { X } from '../constants'` paths continue to work unchanged.
 *
 * App-specific values (env vars, ROUTES, Tauri event names, STORAGE_KEYS) are
 * defined below and are NOT present in the shared package.
 */

export * from '@monioc/shared';

// ── App-specific: env-dependent ───────────────────────────────────────────────

export const APP_VERSION = import.meta.env?.VITE_APP_VERSION ?? '0.0.0';
export const APP_URL = import.meta.env?.VITE_APP_URL ?? 'https://monioc.app';

// ── App-specific: chart timing (desktop optimised) ────────────────────────────

export const CHART_ANIMATION_DURATION_MS = 850;
export const CHART_TRANSITION_DURATION_MS = 180;

// ── App-specific: route paths ─────────────────────────────────────────────────

export const ROUTES = {
	DASHBOARD: '/',
	GROCERY: '/grocery',
	PRODUCTS: '/products',
	CATEGORY: '/products/:category',
	PRODUCT_DETAIL: '/products/:category/:product',
	RECEIPT_SCANNER: '/receipt-scanner',
	RECEIPT_SCANNER_NEW: '/receipt-scanner/new',
	RECEIPTS: '/receipts',
	RECEIPTS_EDITOR: '/receipts/editor',
	SETTINGS: '/settings',
	CATEGORIES: '/categories',
	SETTINGS_CATEGORIES: '/settings/categories',
	BACKUP: '/backup',
	STATISTICS: '/statistics',
	STATISTICS_CATEGORY: '/statistics/category/:category',
	STATISTICS_CATEGORY_CUSTOM: '/statistics/category/:category/custom',
} as const;

// ── App-specific: localStorage keys ──────────────────────────────────────────

export const STORAGE_KEYS = {
	NAV_COLLAPSED: 'app.nav.collapsed',
	CATEGORIES: 'receiptScanner.categories',
	CATEGORY_COLORS: 'receiptScanner.categoryColors',
	LOCATION: 'statscan_selected_location',
	STATISTICS_GRANULARITY: 'app.statistics.granularity',
	STATISTICS_PERIOD_OFFSET: 'app.statistics.periodOffset',
	TUTORIAL_SEEN: 'app.tutorial.seen',
	DASHBOARD_CHART_RANGE: 'dashboard.spendingChartRange',
} as const;

// ── App-specific: custom DOM event names ──────────────────────────────────────

export const CUSTOM_EVENTS = {
	LOCATION_CHANGE: 'statscan_location_change',
	/** Fired in-process (JS EventTarget) when a scan job completes and the receipt cache is updated. */
	RECEIPT_SCAN_COMPLETED: 'receipt:scan-completed',
} as const;

// ── App-specific: Tauri event names ───────────────────────────────────────────

/** All Tauri event name strings emitted by the Rust backend. */
export const AppEvents = {
	RECEIPT_SAVED: 'receipt:saved',
	RECEIPT_DELETED: 'receipt:deleted',
	JOB_STATUS: 'job:status',
	SCAN_PROGRESS: 'scan-progress',
	LIBRARY_CHANGED: 'library:changed',
	CATEGORY_CHANGED: 'category:changed',
	DATA_RESTORED: 'data:restored',
} as const;

export type AppEventName = (typeof AppEvents)[keyof typeof AppEvents];
