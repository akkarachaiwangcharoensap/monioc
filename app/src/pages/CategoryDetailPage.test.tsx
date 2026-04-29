import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CategoryDetailPage from './CategoryDetailPage';
import type { ReceiptScanRecord } from '../types/receipt';
import * as ReceiptCacheContext from '../context/ReceiptCacheContext';
import * as TabContext from '../context/TabContext';
import { STORAGE_KEYS } from '../constants';

vi.mock('../context/ReceiptCacheContext', () => ({
	useReceiptCache: vi.fn(),
}));

vi.mock('../context/TabContext', () => ({
	useTabContext: vi.fn(),
}));

vi.mock('recharts', () => ({
	BarChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	Bar: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	XAxis: () => <div />,
	YAxis: () => <div />,
	CartesianGrid: () => <div />,
	Tooltip: () => <div />,
	ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	Cell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const { useReceiptCache } = ReceiptCacheContext;
const { useTabContext } = TabContext;

const MOCK_RECORDS: ReceiptScanRecord[] = [
	{
		id: 1,
		imagePath: '/receipts/superstore.jpg',
		processedImagePath: null,
		data: {
			rows: [
				{ name: 'Apples', price: 4.99, category: 'Vegetable' },
			],
		},
		createdAt: '2025-06-10 10:00:00',
		updatedAt: '2025-06-10 10:00:00',
		purchaseDate: '2025-06-10',
		displayName: 'Superstore',
	},
];

function renderPage() {
	return render(
		<MemoryRouter initialEntries={['/statistics/category/Vegetable']}>
			<Routes>
				<Route path="/statistics/category/:category" element={<CategoryDetailPage />} />
			</Routes>
		</MemoryRouter>,
	);
}

describe('CategoryDetailPage', () => {
	beforeEach(() => {
		vi.stubGlobal('scrollTo', vi.fn());
		localStorage.clear();
		vi.mocked(useReceiptCache).mockReturnValue({ receipts: MOCK_RECORDS, isInitialLoading: false, getReceipt: vi.fn(), applyOptimistic: vi.fn(), applyUpdate: vi.fn(), applyOptimisticDelete: vi.fn(), forceReload: vi.fn() });
		vi.mocked(useTabContext).mockReturnValue({ openReceiptEditorTab: vi.fn() } as unknown as ReturnType<typeof useTabContext>);
	});

	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it('loads the persisted period offset from localStorage', async () => {
		localStorage.setItem(STORAGE_KEYS.STATISTICS_PERIOD_OFFSET, '-2');
		renderPage();

		const expectedYear = String(new Date().getFullYear() - 2);
		await expect(screen.findByText(expectedYear)).resolves.toBeInTheDocument();
		expect(localStorage.getItem(STORAGE_KEYS.STATISTICS_PERIOD_OFFSET)).toBe('-2');
	});

	it('persists period offset when navigating periods', async () => {
		renderPage();

		const currentYear = new Date().getFullYear();
		const previousYear = String(currentYear - 1);

		await screen.findByRole('button', { name: `Go to ${previousYear}` });
		await screen.getByRole('button', { name: `Go to ${previousYear}` }).click();

		await waitFor(() => {
			expect(localStorage.getItem(STORAGE_KEYS.STATISTICS_PERIOD_OFFSET)).toBe('-1');
		});
		await expect(screen.findByText(previousYear)).resolves.toBeInTheDocument();
	});
});

// ── TC-NAV-1  Purchase item click → openReceiptEditorTab (Bug 3) ─────────────

describe('CategoryDetailPage – purchase item navigation', () => {
	const MOCK_RECEIPT_ID = 42;
	const MOCK_RECORDS_WITH_ITEM: import('../types/receipt').ReceiptScanRecord[] = [
		{
			id: MOCK_RECEIPT_ID,
			imagePath: '/receipts/test.jpg',
			processedImagePath: null,
			data: {
				rows: [
					{ name: 'Organic Banana', price: 2.49, category: 'Vegetable' },
				],
			},
			createdAt: `${new Date().getFullYear()}-06-15 10:00:00`,
			updatedAt: `${new Date().getFullYear()}-06-15 10:00:00`,
			purchaseDate: `${new Date().getFullYear()}-06-15`,
			displayName: 'FreshMart',
		},
	];

	let openReceiptEditorTab: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.stubGlobal('scrollTo', vi.fn());
		localStorage.clear();
		openReceiptEditorTab = vi.fn();
		vi.mocked(useReceiptCache).mockReturnValue({
			receipts: MOCK_RECORDS_WITH_ITEM,
			isInitialLoading: false,
			getReceipt: vi.fn(),
			applyOptimistic: vi.fn(),
			applyUpdate: vi.fn(),
			applyOptimisticDelete: vi.fn(),
			forceReload: vi.fn(),
		});
		vi.mocked(useTabContext).mockReturnValue({ openReceiptEditorTab } as unknown as ReturnType<typeof useTabContext>);
	});

	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	function renderVegetable() {
		return render(
			<MemoryRouter initialEntries={['/statistics/category/Vegetable']}>
				<Routes>
					<Route path="/statistics/category/:category" element={<CategoryDetailPage />} />
				</Routes>
			</MemoryRouter>,
		);
	}

	it('TC-NAV-1: clicking a purchase item calls openReceiptEditorTab with the receipt id', async () => {
		renderVegetable();

		// Wait for the item row to appear in the purchases list.
		const itemButton = await screen.findByText('Organic Banana');
		itemButton.closest('button')!.click();

		expect(openReceiptEditorTab).toHaveBeenCalledTimes(1);
		expect(openReceiptEditorTab).toHaveBeenCalledWith(MOCK_RECEIPT_ID);
	});

	it('TC-NAV-2: clicking a purchase item does NOT navigate via a URL query param', async () => {
		// Regression: previously the item used NavButton with ?receiptId=<id>,
		// which the receipt scanner page never consumed.
		renderVegetable();

		const itemButton = await screen.findByText('Organic Banana');
		itemButton.closest('button')!.click();

		// openReceiptEditorTab must be the mechanism — not raw navigate/href.
		expect(openReceiptEditorTab).toHaveBeenCalledWith(MOCK_RECEIPT_ID);
		// The button must not be a link (<a>) element pointing at RECEIPT_SCANNER.
		const el = itemButton.closest('a');
		expect(el).toBeNull();
	});
});

// ── TC-RANGE-1/2  Custom date range via URL params (Bug 4 fix) ───────────────

describe('CategoryDetailPage – custom date range from URL params', () => {
	// Two Vegetable items: one recent (in-range), one old (out-of-range).
	const RECENT_DATE = (() => {
		const d = new Date();
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-10 10:00:00`;
	})();
	const OLD_DATE = '2020-01-05 10:00:00';

	const RANGE_RECORDS: import('../types/receipt').ReceiptScanRecord[] = [
		{
			id: 10,
			imagePath: null,
			processedImagePath: null,
			data: { rows: [{ name: 'Fresh Broccoli', price: 3.99, category: 'Vegetable' }] },
			createdAt: RECENT_DATE,
			updatedAt: RECENT_DATE,
			purchaseDate: RECENT_DATE.slice(0, 10),
			displayName: 'Store A',
		},
		{
			id: 11,
			imagePath: null,
			processedImagePath: null,
			data: { rows: [{ name: 'Old Carrots', price: 1.49, category: 'Vegetable' }] },
			createdAt: OLD_DATE,
			updatedAt: OLD_DATE,
			purchaseDate: OLD_DATE.slice(0, 10),
			displayName: 'Store B',
		},
	];

	beforeEach(() => {
		vi.stubGlobal('scrollTo', vi.fn());
		localStorage.clear();
		vi.mocked(useReceiptCache).mockReturnValue({
			receipts: RANGE_RECORDS,
			isInitialLoading: false,
			getReceipt: vi.fn(),
			applyOptimistic: vi.fn(),
			applyUpdate: vi.fn(),
			applyOptimisticDelete: vi.fn(),
			forceReload: vi.fn(),
		});
		vi.mocked(useTabContext).mockReturnValue({ openReceiptEditorTab: vi.fn() } as unknown as ReturnType<typeof useTabContext>);
	});

	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it('TC-RANGE-1: with from/to URL params, only purchases within that range are shown', async () => {
		// Range: 6 months ago to today — covers RECENT_DATE but not OLD_DATE (year 2020).
		const fromTs = new Date();
		fromTs.setMonth(fromTs.getMonth() - 6);
		fromTs.setHours(0, 0, 0, 0);
		const toTs = new Date();

		render(
			<MemoryRouter initialEntries={[`/statistics/category/Vegetable?from=${fromTs.getTime()}&to=${toTs.getTime()}`]}>
				<Routes>
					<Route path="/statistics/category/:category" element={<CategoryDetailPage />} />
				</Routes>
			</MemoryRouter>,
		);

		await expect(screen.findByText('Fresh Broccoli')).resolves.toBeInTheDocument();
		expect(screen.queryByText('Old Carrots')).not.toBeInTheDocument();
	});

	it('TC-RANGE-2: without URL params, only purchases within the current period are shown', async () => {
		render(
			<MemoryRouter initialEntries={['/statistics/category/Vegetable']}>
				<Routes>
					<Route path="/statistics/category/:category" element={<CategoryDetailPage />} />
				</Routes>
			</MemoryRouter>,
		);

		// RECENT_DATE is in the current year — it should appear in default year view.
		await expect(screen.findByText('Fresh Broccoli')).resolves.toBeInTheDocument();
		// OLD_DATE is year 2020 — outside the current year period, must not appear.
		expect(screen.queryByText('Old Carrots')).not.toBeInTheDocument();
	});

	it('TC-RANGE-3: custom range badge is shown when from/to params are present', async () => {
		const fromTs = new Date();
		fromTs.setMonth(fromTs.getMonth() - 6);
		fromTs.setHours(0, 0, 0, 0);
		const toTs = new Date();

		render(
			<MemoryRouter initialEntries={[`/statistics/category/Vegetable?from=${fromTs.getTime()}&to=${toTs.getTime()}`]}>
				<Routes>
					<Route path="/statistics/category/:category" element={<CategoryDetailPage />} />
				</Routes>
			</MemoryRouter>,
		);

		// The custom range badge label uses Intl.DateTimeFormat — just check it's visible.
		await expect(screen.findByRole('button', { name: /Clear filter/i })).resolves.toBeInTheDocument();
	});
});

// ── TC-PERIOD-1/2/3  Purchases list filtered by granularity period ─────────────

describe('CategoryDetailPage – period-based purchase filtering', () => {
	const THIS_YEAR = new Date().getFullYear();
	const THIS_MONTH = String(new Date().getMonth() + 1).padStart(2, '0');

	const PERIOD_RECORDS: ReceiptScanRecord[] = [
		{
			id: 30,
			imagePath: null,
			processedImagePath: null,
			data: { rows: [{ name: 'Current Year Apple', price: 2.99, category: 'Vegetable' }] },
			createdAt: `${THIS_YEAR}-${THIS_MONTH}-10 10:00:00`,
			updatedAt: `${THIS_YEAR}-${THIS_MONTH}-10 10:00:00`,
			purchaseDate: `${THIS_YEAR}-${THIS_MONTH}-10`,
			displayName: 'Store X',
		},
		{
			id: 31,
			imagePath: null,
			processedImagePath: null,
			data: { rows: [{ name: 'Last Year Bread', price: 4.99, category: 'Vegetable' }] },
			createdAt: `${THIS_YEAR - 1}-06-10 10:00:00`,
			updatedAt: `${THIS_YEAR - 1}-06-10 10:00:00`,
			purchaseDate: `${THIS_YEAR - 1}-06-10`,
			displayName: 'Store Y',
		},
	];

	beforeEach(() => {
		vi.stubGlobal('scrollTo', vi.fn());
		localStorage.clear();
		vi.mocked(useReceiptCache).mockReturnValue({
			receipts: PERIOD_RECORDS,
			isInitialLoading: false,
			getReceipt: vi.fn(),
			applyOptimistic: vi.fn(),
			applyUpdate: vi.fn(),
			applyOptimisticDelete: vi.fn(),
			forceReload: vi.fn(),
		});
		vi.mocked(useTabContext).mockReturnValue({ openReceiptEditorTab: vi.fn() } as unknown as ReturnType<typeof useTabContext>);
	});

	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	function renderVegetable() {
		return render(
			<MemoryRouter initialEntries={['/statistics/category/Vegetable']}>
				<Routes>
					<Route path="/statistics/category/:category" element={<CategoryDetailPage />} />
				</Routes>
			</MemoryRouter>,
		);
	}

	it('TC-PERIOD-1: default year granularity shows only current year purchases', async () => {
		renderVegetable();
		await expect(screen.findByText('Current Year Apple')).resolves.toBeInTheDocument();
		expect(screen.queryByText('Last Year Bread')).not.toBeInTheDocument();
	});

	it('TC-PERIOD-2: navigating to previous year shows previous year purchases and hides current year', async () => {
		renderVegetable();
		const prevYear = String(THIS_YEAR - 1);
		await screen.findByRole('button', { name: `Go to ${prevYear}` });
		screen.getByRole('button', { name: `Go to ${prevYear}` }).click();

		await expect(screen.findByText('Last Year Bread')).resolves.toBeInTheDocument();
		expect(screen.queryByText('Current Year Apple')).not.toBeInTheDocument();
	});

	it('TC-PERIOD-3: switching granularity to Month shows only current month purchases', async () => {
		renderVegetable();
		// Current-year item is dated THIS_MONTH-10 — within the current calendar month.
		screen.getByRole('radio', { name: 'Month granularity' }).click();
		await expect(screen.findByText('Current Year Apple')).resolves.toBeInTheDocument();
		expect(screen.queryByText('Last Year Bread')).not.toBeInTheDocument();
	});
});

// ── TC-SORT-1 … TC-SORT-6  Item sort functionality ───────────────────────────

describe('CategoryDetailPage – item sort functionality', () => {
	const THIS_YEAR = new Date().getFullYear();

	// Three items in the current year with distinct dates, prices, and names.
	const SORT_RECORDS: ReceiptScanRecord[] = [
		{
			id: 40,
			imagePath: null,
			processedImagePath: null,
			data: { rows: [{ name: 'Zucchini', price: 3.00, category: 'Vegetable' }] },
			createdAt: `${THIS_YEAR}-01-10 10:00:00`,
			updatedAt: `${THIS_YEAR}-01-10 10:00:00`,
			purchaseDate: `${THIS_YEAR}-01-10`,
			displayName: 'Store A',
		},
		{
			id: 41,
			imagePath: null,
			processedImagePath: null,
			data: { rows: [{ name: 'Apple', price: 7.00, category: 'Vegetable' }] },
			createdAt: `${THIS_YEAR}-03-10 10:00:00`,
			updatedAt: `${THIS_YEAR}-03-10 10:00:00`,
			purchaseDate: `${THIS_YEAR}-03-10`,
			displayName: 'Store B',
		},
		{
			id: 42,
			imagePath: null,
			processedImagePath: null,
			data: { rows: [{ name: 'Mango', price: 1.50, category: 'Vegetable' }] },
			createdAt: `${THIS_YEAR}-02-10 10:00:00`,
			updatedAt: `${THIS_YEAR}-02-10 10:00:00`,
			purchaseDate: `${THIS_YEAR}-02-10`,
			displayName: 'Store C',
		},
	];

	/** Returns the names from the purchase list in their DOM render order. */
	function getItemOrder(container: HTMLElement): string[] {
		const text = container.textContent ?? '';
		const names = ['Zucchini', 'Apple', 'Mango'];
		return names
			.map((name) => ({ name, index: text.indexOf(name) }))
			.filter(({ index }) => index !== -1)
			.sort((a, b) => a.index - b.index)
			.map(({ name }) => name);
	}

	beforeEach(() => {
		vi.stubGlobal('scrollTo', vi.fn());
		localStorage.clear();
		vi.mocked(useReceiptCache).mockReturnValue({
			receipts: SORT_RECORDS,
			isInitialLoading: false,
			getReceipt: vi.fn(),
			applyOptimistic: vi.fn(),
			applyUpdate: vi.fn(),
			applyOptimisticDelete: vi.fn(),
			forceReload: vi.fn(),
		});
		vi.mocked(useTabContext).mockReturnValue({ openReceiptEditorTab: vi.fn() } as unknown as ReturnType<typeof useTabContext>);
	});

	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	function renderVegetable() {
		return render(
			<MemoryRouter initialEntries={['/statistics/category/Vegetable']}>
				<Routes>
					<Route path="/statistics/category/:category" element={<CategoryDetailPage />} />
				</Routes>
			</MemoryRouter>,
		);
	}

	it('TC-SORT-1: default sort is Newest first (date desc)', async () => {
		const { container } = renderVegetable();
		await screen.findByText('Apple');
		// Mar > Feb > Jan → Apple, Mango, Zucchini
		expect(getItemOrder(container)).toEqual(['Apple', 'Mango', 'Zucchini']);
	});

	it('TC-SORT-2: clicking Newest toggles to Oldest first (date asc)', async () => {
		const { container } = renderVegetable();
		await screen.findByText('Newest');
		screen.getByRole('button', { name: 'Newest' }).click();
		await screen.findByRole('button', { name: 'Oldest' });
		// Jan < Feb < Mar → Zucchini, Mango, Apple
		expect(getItemOrder(container)).toEqual(['Zucchini', 'Mango', 'Apple']);
	});

	it('TC-SORT-3: clicking Price ↓ activates price-asc (low→high)', async () => {
		const { container } = renderVegetable();
		await screen.findByText('Apple');
		// Clicking 'Price ↓' toggles price-desc → price-asc and sets sortBy=price.
		screen.getByRole('button', { name: 'Price ↓' }).click();
		await screen.findByRole('button', { name: 'Price ↑' });
		await waitFor(() => {
			// $1.50 < $3 < $7 → Mango, Zucchini, Apple
			expect(getItemOrder(container)).toEqual(['Mango', 'Zucchini', 'Apple']);
		});
	});

	it('TC-SORT-4: clicking Price ↑ toggles to price-desc (high→low)', async () => {
		const { container } = renderVegetable();
		await screen.findByText('Apple');
		// First click: price-desc → price-asc, shows 'Price ↑'.
		screen.getByRole('button', { name: 'Price ↓' }).click();
		await screen.findByRole('button', { name: 'Price ↑' });
		// Second click: price-asc → price-desc, shows 'Price ↓'.
		screen.getByRole('button', { name: 'Price ↑' }).click();
		await screen.findByRole('button', { name: 'Price ↓' });
		await waitFor(() => {
			// $7 > $3 > $1.50 → Apple, Zucchini, Mango
			expect(getItemOrder(container)).toEqual(['Apple', 'Zucchini', 'Mango']);
		});
	});

	it('TC-SORT-5: clicking Name Z-A activates name sort A→Z (nameAsc becomes true)', async () => {
		const { container } = renderVegetable();
		await screen.findByText('Apple');
		// Initial button label is 'Name Z-A' (nameAsc=false, sortBy=date).
		// Clicking sets sortBy='name', nameAsc=true → items sorted A-Z.
		screen.getByRole('button', { name: 'Name Z-A' }).click();
		await screen.findByRole('button', { name: 'Name A-Z' });
		await waitFor(() => {
			// A→Z: Apple, Mango, Zucchini
			expect(getItemOrder(container)).toEqual(['Apple', 'Mango', 'Zucchini']);
		});
	});

	it('TC-SORT-6: clicking Name A-Z toggles to Z→A sort', async () => {
		const { container } = renderVegetable();
		await screen.findByText('Apple');
		// First click: 'Name Z-A' → nameAsc=true, shows 'Name A-Z', items A-Z
		screen.getByRole('button', { name: 'Name Z-A' }).click();
		await screen.findByRole('button', { name: 'Name A-Z' });
		// Second click: 'Name A-Z' → nameAsc=false, shows 'Name Z-A', items Z-A
		screen.getByRole('button', { name: 'Name A-Z' }).click();
		await screen.findByRole('button', { name: 'Name Z-A' });
		await waitFor(() => {
			// Z→A: Zucchini, Mango, Apple
			expect(getItemOrder(container)).toEqual(['Zucchini', 'Mango', 'Apple']);
		});
	});
});
