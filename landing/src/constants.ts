/**
 * Landing-page constants.
 *
 * Framework-independent values (categories, colors, price thresholds, etc.) come
 * from @monioc/shared. Landing-specific values (Next.js env vars, routes, timing
 * overrides) are defined below.
 */

export * from '@monioc/shared';

// ── Landing-specific: env-dependent ──────────────────────────────────────────

export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0';
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://monioc.app';

// ── Landing-specific: chart timing (web/demo optimised) ──────────────────────

export const CHART_ANIMATION_DURATION_MS = 300;
export const CHART_TRANSITION_DURATION_MS = 100;

// ── Landing-specific: route paths ────────────────────────────────────────────

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
	UPGRADE: '/upgrade',
} as const;
