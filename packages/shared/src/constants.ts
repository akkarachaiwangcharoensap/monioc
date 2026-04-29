/**
 * Framework-independent constants shared between the Tauri desktop app (app/)
 * and the Next.js landing page (landing/).
 *
 * Do NOT put framework-specific values here (import.meta.env, process.env,
 * Tauri event names, ROUTES, STORAGE_KEYS, or per-app timing overrides).
 */

export const APP_NAME = 'Monioc';
export const SUPPORT_EMAIL = '';

// ── Grocery category display names ───────────────────────────────────────────

export const CATEGORY_DISPLAY_NAMES: Record<string, string> = {
	produce: 'Produce',
	meat_and_seafood: 'Meat & Seafood',
	dairy_and_eggs: 'Dairy & Eggs',
	pantry: 'Pantry',
	frozen: 'Frozen',
	bakery: 'Bakery',
	beverages: 'Beverages',
	snacks: 'Snacks',
	deli_and_prepared: 'Deli & Prepared',
	personal_care: 'Personal Care',
	baby: 'Baby',
	household: 'Household',
	other: 'Other',
};

// ── Colors ────────────────────────────────────────────────────────────────────

export const DEFAULT_CATEGORY_COLORS = [
	'#6366F1', // indigo
	'#0EA5E9', // sky
	'#22C55E', // emerald
	'#F59E0B', // amber
	'#EF4444', // red
	'#8B5CF6', // violet
	'#14B8A6', // teal
	'#EC4899', // pink
	'#84CC16', // lime
	'#06B6D4', // blue
	'#F43F5E', // rose
	'#F97316', // orange
	'#7C3AED', // purple
	'#10B981', // green
	'#EAB308', // yellow
	'#3B82F6', // blue-500
	'#F472B6', // fuchsia
	'#0F766E', // cyan-700
	'#4B5563', // slate-500
	'#2DD4BF', // teal-300
	'#1E3A8A', // dark indigo
	'#D97706', // amber-700
	'#DBEAFE', // light blue
	'#A855F7', // purple-500
	'#FDE68A', // yellow-200
] as const;

export const CATEGORY_SEMANTIC_COLORS: Record<string, string> = {
	'Vegetable': '#4ADE80',
	'Fruit': '#FBBF24',
	'Meat': '#DC2626',
	'Seafood': '#0EA5E9',
	'Deli & Prepared': '#F97316',
	'Dairy & Eggs': '#FACC15',
	'Pantry': '#A78BFA',
	'Grains & Pasta': '#C084FC',
	'Herbs & Spices': '#F59E0B',
	'Condiments': '#9CA3AF',
	'Frozen': '#38BDF8',
	'Bread & Bakery': '#FB7185',
	'Snacks': '#F472B6',
	'Beverages': '#60A5FA',
	'Coffee & Tea': '#92400E',
	'Pet Food': '#8B5CF6',
	'Health & Wellness': '#14B8A6',
	'Cleaning': '#0EA5E9',
	'Household': '#64748B',
	'Personal Care': '#E879F9',
	'Baby': '#FBBF24',
	'Other': '#6B7280',
	'Tax': '#6B7280',
};

export const FALLBACK_CATEGORY_COLOR = '#94A3B8';

export const CHART_COLORS = [
	'#8B5CF6',
	'#10B981',
	'#F59E0B',
	'#3B82F6',
	'#EF4444',
	'#EC4899',
	'#14B8A6',
] as const;

// ── Timing (shared defaults — individual apps may override) ───────────────────

export const TOAST_DURATION_MS = 2200;
export const NAVIGATION_DELAY_MS = 90;
export const SAVE_SUCCESS_DURATION_MS = 1800;
export const QUEUE_WARNING_DURATION_MS = 3500;
export const FRAME_DELAY_MS = 50;

// ── Sizes & limits ────────────────────────────────────────────────────────────

export const NANOID_LENGTH = 8;
export const MAX_CATEGORY_NAME_LENGTH = 60;

export const BYTES_PER_KB = 1024;
export const BYTES_PER_MB = 1024 * 1024;
export const BYTES_PER_GB = 1024 * 1024 * 1024;

// ── Unit conversion factors ───────────────────────────────────────────────────

export const GRAMS_PER_POUND = 453.592;
export const ML_PER_FL_OZ = 29.5735;
export const ML_PER_GALLON = 3785.41;

// ── Price formatting ──────────────────────────────────────────────────────────

export const VERY_SMALL_PRICE_THRESHOLD = 0.01;
export const SMALL_PRICE_THRESHOLD = 1;
export const VERY_SMALL_DECIMALS_OFFICIAL = 5;
export const VERY_SMALL_DECIMALS = 4;
export const SMALL_DECIMALS = 3;
export const NORMAL_DECIMALS = 2;
export const CURRENCY_CODE = 'CAD';

// ── Receipt scanner ───────────────────────────────────────────────────────────

export const SUPPORTED_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'bmp'] as const;
export const CATEGORY_NONE_LABEL = '-- None --';

export enum SpreadsheetColumn {
	Name = 0,
	Category = 1,
	Price = 2,
}

// ── Query parameters ──────────────────────────────────────────────────────────

export const QUERY_PARAMS = {
	RECEIPT_ID: 'receiptId',
	RECEIPT_IDS: 'receiptIds',
	STATS_GRANULARITY: 'granularity',
	STATS_OFFSET: 'offset',
	DATE_FROM: 'dateFrom',
	DATE_TO: 'dateTo',
} as const;

// ── Default location ──────────────────────────────────────────────────────────

export const DEFAULT_LOCATION = 'Canada';

// ── Default grocery categories ────────────────────────────────────────────────

export const CUSTOM_GROCERY_CATEGORIES = [
	'Vegetable',
	'Fruit',
	'Meat',
	'Seafood',
	'Deli & Prepared',
	'Dairy & Eggs',
	'Pantry',
	'Grains & Pasta',
	'Herbs & Spices',
	'Condiments',
	'Frozen',
	'Bread & Bakery',
	'Snacks',
	'Beverages',
	'Coffee & Tea',
	'Pet Food',
	'Health & Wellness',
	'Cleaning',
	'Household',
	'Personal Care',
	'Baby',
	'Other',
	'Tax',
] as const;
