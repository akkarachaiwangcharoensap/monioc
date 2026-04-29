import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DashboardPage from './DashboardPage';
import type { ReceiptScanRecord } from '../types/receipt';
import * as ReceiptCacheContext from '../context/ReceiptCacheContext';
import * as TabContext from '../context/TabContext';
import * as CategoriesContext from '../context/CategoriesContext';
import { ROUTES, STORAGE_KEYS } from '../constants';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../context/ReceiptCacheContext', () => ({
	useReceiptCache: vi.fn(),
}));

vi.mock('../context/TabContext', () => ({
	useTabContext: vi.fn(),
}));

vi.mock('../context/CategoriesContext', () => ({
	useCategoriesContext: vi.fn(),
}));

vi.mock('../components/receipts/DateRangeFilter', () => ({
	default: function MockDateRangeFilter({
		onChange,
		onQuickRangeChange,
		defaultQuickRange,
	}: {
		onChange: (v: [Date | null, Date | null]) => void;
		onQuickRangeChange?: (range: string) => void;
		defaultQuickRange?: string;
	}) {
		capturedOnQuickRangeChange = onQuickRangeChange;
		// Immediately fire with a wide range so all records pass the date filter.
		React.useEffect(() => {
			onChange([new Date('2000-01-01'), new Date('2099-12-31')]);
		// eslint-disable-next-line react-hooks/exhaustive-deps
		}, []);
		return (
			<div
				data-testid="date-range-filter"
				data-default-quick-range={defaultQuickRange}
			/>
		);
	},
	getQuickRangeDates: (range: string) => {
		if (range === 'thisMonth') {
			const start = new Date();
			start.setDate(1);
			start.setHours(0, 0, 0, 0);
			return [start, new Date()];
		}
		return [new Date('2000-01-01'), new Date('2099-12-31')];
	},
}));

// Module-level captures updated each render.
let capturedOnQuickRangeChange: ((range: string) => void) | undefined;

// SpendingPieChart: capture onCategoryClick so we can call it imperatively.
let capturedOnCategoryClick: ((cat: string) => void) | undefined;
vi.mock('../components/SpendingPieChart', () => ({
	default: ({ onCategoryClick }: { onCategoryClick?: (cat: string) => void }) => {
		capturedOnCategoryClick = onCategoryClick;
		return <div data-testid="spending-chart" />;
	},
}));

vi.mock('../components/receipts/MinimalReceiptCard', () => ({
	default: () => <div />,
}));

vi.mock('../components/ui/TabLink', () => ({
	default: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

const { useReceiptCache } = ReceiptCacheContext;
const { useTabContext } = TabContext;
const { useCategoriesContext } = CategoriesContext;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a ReceiptScanRecord with rows whose category is `cat`. */
function makeRecord(id: number, cat: string, price: number): ReceiptScanRecord {
	return {
		id,
		imagePath: null,
		processedImagePath: null,
		displayName: `Store ${id}`,
		createdAt: '2026-06-15 10:00:00',
		updatedAt: '2026-06-15 10:00:00',
		purchaseDate: '2026-06-15',
		data: { rows: [{ name: `Item ${id}`, price, category: cat }] },
	};
}

/** 8 distinct non-Other categories — overflow beyond top 6 is excluded from the chart. */
const MANY_CATEGORY_RECORDS: ReceiptScanRecord[] = [
	makeRecord(1, 'Vegetable', 50),
	makeRecord(2, 'Fruit', 40),
	makeRecord(3, 'Meat', 80),
	makeRecord(4, 'Dairy & Eggs', 60),
	makeRecord(5, 'Bakery', 30),
	makeRecord(6, 'Beverages', 25),
	makeRecord(7, 'Snacks', 15),   // overflow → synthetic Other
	makeRecord(8, 'Frozen', 10),   // overflow → synthetic Other
];

/** Only 3 categories + a real "Other" — no overflow. */
const WITH_REAL_OTHER_RECORDS: ReceiptScanRecord[] = [
	makeRecord(1, 'Vegetable', 50),
	makeRecord(2, 'Fruit', 40),
	makeRecord(3, 'Other', 35),
];

function renderDashboard() {
	return render(
		<MemoryRouter>
			<DashboardPage />
		</MemoryRouter>,
	);
}

// ── Test setup ────────────────────────────────────────────────────────────────

let replaceCurrentTab: ReturnType<typeof vi.fn>;
let navigate: ReturnType<typeof vi.fn>;

beforeEach(() => {
	vi.stubGlobal('scrollTo', vi.fn());
	capturedOnCategoryClick = undefined;
	capturedOnQuickRangeChange = undefined;
	replaceCurrentTab = vi.fn().mockReturnValue(true);
	navigate = vi.fn();

	vi.mocked(useCategoriesContext).mockReturnValue({
		getCategoryColor: () => '#888',
	} as unknown as ReturnType<typeof useCategoriesContext>);

	// Clean dashboard range key so each test starts from a known state.
	localStorage.removeItem(STORAGE_KEYS.DASHBOARD_CHART_RANGE);
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

// ── TC-OTHER-1  Overflow categories are excluded; clicking Other navigates to detail ───────────

describe('DashboardPage – "Other" category click navigation', () => {
	it('TC-OTHER-1: clicking Other navigates to the Other category detail page (no overflow aggregation)', () => {
		vi.mocked(useReceiptCache).mockReturnValue({
			receipts: MANY_CATEGORY_RECORDS,
			isInitialLoading: false,
			getReceipt: vi.fn(),
			applyOptimistic: vi.fn(),
			applyUpdate: vi.fn(),
			applyOptimisticDelete: vi.fn(),
			forceReload: vi.fn(),
		});
		vi.mocked(useTabContext).mockReturnValue({
			replaceCurrentTab,
			openReceiptEditorTab: vi.fn(),
		} as unknown as ReturnType<typeof useTabContext>);

		// Intercept useNavigate.
		vi.mock('react-router-dom', async (importOriginal) => {
			const original = await importOriginal<typeof import('react-router-dom')>();
			return { ...original, useNavigate: () => navigate };
		});

		renderDashboard();

		// The chart has > 6 real categories so "Other" is a synthetic aggregate.
		expect(capturedOnCategoryClick).toBeDefined();
		capturedOnCategoryClick!('Other');

		const call = vi.mocked(replaceCurrentTab).mock.calls[0][0] as string;
		expect(call).toBe('/statistics/category/Other');
		expect(replaceCurrentTab).not.toHaveBeenCalledWith(ROUTES.STATISTICS);
	});

	it('TC-OTHER-2: clicking real (non-aggregate) Other navigates to category detail', () => {
		// Fewer than 7 non-Other categories → no overflow → "Other" is real.
		vi.mocked(useReceiptCache).mockReturnValue({
			receipts: WITH_REAL_OTHER_RECORDS,
			isInitialLoading: false,
			getReceipt: vi.fn(),
			applyOptimistic: vi.fn(),
			applyUpdate: vi.fn(),
			applyOptimisticDelete: vi.fn(),
			forceReload: vi.fn(),
		});
		vi.mocked(useTabContext).mockReturnValue({
			replaceCurrentTab,
			openReceiptEditorTab: vi.fn(),
		} as unknown as ReturnType<typeof useTabContext>);

		renderDashboard();

		expect(capturedOnCategoryClick).toBeDefined();
		capturedOnCategoryClick!('Other');

		// Default quick range is thisMonth → navigates to category detail (no from/to).
		const call = vi.mocked(replaceCurrentTab).mock.calls[0][0] as string;
		expect(call).toBe('/statistics/category/Other');
		expect(replaceCurrentTab).not.toHaveBeenCalledWith(ROUTES.STATISTICS);
	});

	it('TC-OTHER-3: clicking a real named category (e.g. Vegetable) navigates to category detail', () => {
		vi.mocked(useReceiptCache).mockReturnValue({
			receipts: MANY_CATEGORY_RECORDS,
			isInitialLoading: false,
			getReceipt: vi.fn(),
			applyOptimistic: vi.fn(),
			applyUpdate: vi.fn(),
			applyOptimisticDelete: vi.fn(),
			forceReload: vi.fn(),
		});
		vi.mocked(useTabContext).mockReturnValue({
			replaceCurrentTab,
			openReceiptEditorTab: vi.fn(),
		} as unknown as ReturnType<typeof useTabContext>);

		renderDashboard();

		capturedOnCategoryClick!('Vegetable');

		// Default quick range is thisMonth → navigates to category detail (no from/to).
		const call = vi.mocked(replaceCurrentTab).mock.calls[0][0] as string;
		expect(call).toBe('/statistics/category/Vegetable');
	});

	it('TC-DATE-1: category navigation URL includes from/to timestamps when quick range is custom', () => {
		vi.mocked(useReceiptCache).mockReturnValue({
			receipts: MANY_CATEGORY_RECORDS,
			isInitialLoading: false,
			getReceipt: vi.fn(),
			applyOptimistic: vi.fn(),
			applyUpdate: vi.fn(),
			applyOptimisticDelete: vi.fn(),
			forceReload: vi.fn(),
		});
		vi.mocked(useTabContext).mockReturnValue({
			replaceCurrentTab,
			openReceiptEditorTab: vi.fn(),
		} as unknown as ReturnType<typeof useTabContext>);

		// Set quick range to "custom" so navigation uses from/to params.
		localStorage.setItem(STORAGE_KEYS.DASHBOARD_CHART_RANGE, 'custom');
		renderDashboard();

		// Trigger the quick range change to 'custom' if captured.
		if (capturedOnQuickRangeChange) {
			act(() => { capturedOnQuickRangeChange!('custom'); });
		}

		capturedOnCategoryClick!('Meat');

		const call = vi.mocked(replaceCurrentTab).mock.calls[0][0] as string;
		// URL must point to the custom detail page and contain numeric from and to epoch timestamps.
		expect(call).toMatch(/^\/statistics\/category\/Meat\/custom\?from=\d+&to=\d+$/);
		const match = call.match(/\?from=(\d+)&to=(\d+)$/);
		expect(match).not.toBeNull();
		const fromTs = Number(match![1]);
		const toTs = Number(match![2]);
		expect(fromTs).toBeLessThan(toTs);
		expect(fromTs).toBeGreaterThan(0);
		expect(toTs).toBeGreaterThan(0);
	});
});

// ── TC-ALL-1  "All" quick range navigates to category detail with year granularity ──

describe('DashboardPage – "All" quick range navigation', () => {
	it('TC-ALL-1: clicking a category with "all" quick range sets year granularity', () => {
		vi.mocked(useReceiptCache).mockReturnValue({
			receipts: MANY_CATEGORY_RECORDS,
			isInitialLoading: false,
			getReceipt: vi.fn(),
			applyOptimistic: vi.fn(),
			applyUpdate: vi.fn(),
			applyOptimisticDelete: vi.fn(),
			forceReload: vi.fn(),
		});
		vi.mocked(useTabContext).mockReturnValue({
			replaceCurrentTab,
			openReceiptEditorTab: vi.fn(),
		} as unknown as ReturnType<typeof useTabContext>);

		// Pre-seed localStorage so the dashboard initialises with 'all' selected.
		localStorage.setItem(STORAGE_KEYS.DASHBOARD_CHART_RANGE, 'all');
		renderDashboard();

		capturedOnCategoryClick!('Meat');

		const call = vi.mocked(replaceCurrentTab).mock.calls[0][0] as string;
		expect(call).toBe('/statistics/category/Meat');
		expect(localStorage.getItem(STORAGE_KEYS.STATISTICS_GRANULARITY)).toBe('year');
		expect(localStorage.getItem(STORAGE_KEYS.STATISTICS_PERIOD_OFFSET)).toBe('0');
	});
});

// ── TC-PERSIST  Filter state persistence across tab switches ─────────────────

describe('DashboardPage – filter state persistence', () => {
	function setupMocks(receipts = MANY_CATEGORY_RECORDS) {
		vi.mocked(useReceiptCache).mockReturnValue({
			receipts,
			isInitialLoading: false,
			getReceipt: vi.fn(),
			applyOptimistic: vi.fn(),
			applyUpdate: vi.fn(),
			applyOptimisticDelete: vi.fn(),
			forceReload: vi.fn(),
		});
		vi.mocked(useTabContext).mockReturnValue({
			replaceCurrentTab: vi.fn(),
			openReceiptEditorTab: vi.fn(),
		} as unknown as ReturnType<typeof useTabContext>);
	}

	it('TC-PERSIST-1: uses thisMonth as the default quick range when no range is saved', () => {
		setupMocks();
		localStorage.removeItem(STORAGE_KEYS.DASHBOARD_CHART_RANGE);
		const { getByTestId } = renderDashboard();
		const filter = getByTestId('date-range-filter');
		expect(filter.dataset.defaultQuickRange).toBe('thisMonth');
	});

	it('TC-PERSIST-2: restores the previously saved quick range on remount', () => {
		setupMocks();
		localStorage.setItem(STORAGE_KEYS.DASHBOARD_CHART_RANGE, 'lastWeek');
		const { getByTestId } = renderDashboard();
		const filter = getByTestId('date-range-filter');
		expect(filter.dataset.defaultQuickRange).toBe('lastWeek');
	});

	it('TC-PERSIST-3: writes the selected quick range to localStorage via onQuickRangeChange', () => {
		setupMocks();
		renderDashboard();

		// capturedOnQuickRangeChange is set by the module-level DateRangeFilter mock.
		act(() => {
			capturedOnQuickRangeChange?.('lastWeek');
		});

		expect(localStorage.getItem(STORAGE_KEYS.DASHBOARD_CHART_RANGE)).toBe('lastWeek');
	});
});
