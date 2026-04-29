import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// ── Module mocks (hoisted before imports) ──────────────────────────────────────

vi.mock('../services/api', () => ({
	TauriApi: {
		listGroceryCategories: vi.fn(),
		// ProductSearch debounce-calls this; return empty page so it's a no-op.
		listGroceryProducts: vi.fn().mockResolvedValue({ products: [], total: 0, page: 1, pageSize: 8 }),
	},
}));

// LocationSelector calls useGroceryData() — stub it so tests don't need a Provider.
vi.mock('../hooks', () => ({
	useGroceryData: () => ({ data: null, loading: false, error: null }),
}));

// LocationSelector and ProductSearch use this hook.
vi.mock('../hooks/useLocationPreference', () => ({
	useLocationPreference: () => ({ location: 'Canada', setLocation: vi.fn() }),
}));

// TabLink uses TabContext — replace with a simple <a> so no TabProvider is needed.
vi.mock('../components/ui/TabLink', () => ({
	default: ({ to, children, ...rest }: { to: string; children: React.ReactNode; [k: string]: unknown }) =>
		<a href={to} {...rest}>{children}</a>,
}));

// ── Imports that depend on the mocked modules ──────────────────────────────────

import ProductsPage from './ProductsPage';
import { TauriApi } from '../services/api';

// ── Fixtures ───────────────────────────────────────────────────────────────────

/** All 13 categories returned by the grocery SQLite database. */
const DB_CATEGORIES = [
	{ id: 1,  name: 'produce',          count: 29 },
	{ id: 2,  name: 'meat_and_seafood', count: 18 },
	{ id: 3,  name: 'dairy_and_eggs',   count: 10 },
	{ id: 4,  name: 'pantry',           count: 26 },
	{ id: 5,  name: 'frozen',           count:  6 },
	{ id: 6,  name: 'bakery',           count:  2 },
	{ id: 7,  name: 'beverages',        count:  3 },
	{ id: 8,  name: 'snacks',           count:  1 },
	{ id: 9,  name: 'deli_and_prepared',count:  3 },
	{ id: 10, name: 'personal_care',    count:  3 },
	{ id: 11, name: 'baby',             count:  2 },
	{ id: 12, name: 'household',        count:  1 },
	{ id: 13, name: 'other',            count:  1 },
];

function renderPage() {
	return render(
		<MemoryRouter>
			<ProductsPage />
		</MemoryRouter>,
	);
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('ProductsPage', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		// Default safe implementation so ProductSearch's debounced IPC is a no-op.
		vi.mocked(TauriApi.listGroceryProducts).mockResolvedValue({ products: [], total: 0, page: 1, pageSize: 8 });
		// Default categories — overridden per test.
		vi.mocked(TauriApi.listGroceryCategories).mockResolvedValue([]);
	});

	afterEach(() => cleanup());

	// TC-PP-1: Loading state
	it('TC-PP-1: shows a loading indicator while categories are being fetched', () => {
		vi.mocked(TauriApi.listGroceryCategories).mockReturnValue(new Promise(() => { /* never resolves */ }));
		renderPage();
		expect(screen.getByText('Loading categories...')).toBeInTheDocument();
	});

	// TC-PP-2: Renders all 13 category tiles
	it('TC-PP-2: renders all 13 category tiles with correct display labels', async () => {
		vi.mocked(TauriApi.listGroceryCategories).mockResolvedValue(DB_CATEGORIES);
		renderPage();

		await waitFor(() => {
			expect(screen.queryByText('Loading categories...')).not.toBeInTheDocument();
		});

		const expectedLabels = [
			'Produce', 'Meat & Seafood', 'Dairy & Eggs', 'Pantry',
			'Frozen', 'Bakery', 'Beverages', 'Snacks',
			'Deli & Prepared', 'Personal Care', 'Baby', 'Household', 'Other',
		];
		for (const label of expectedLabels) {
			expect(screen.getByText(label)).toBeInTheDocument();
		}
	});

	// TC-PP-3: Product counts
	it('TC-PP-3: displays the product count for each category from the API', async () => {
		vi.mocked(TauriApi.listGroceryCategories).mockResolvedValue(DB_CATEGORIES);
		renderPage();

		await waitFor(() => {
			expect(screen.queryByText('Loading categories...')).not.toBeInTheDocument();
		});

		expect(screen.getByText('29 products')).toBeInTheDocument(); // produce
		expect(screen.getByText('26 products')).toBeInTheDocument(); // pantry
	});

	// TC-PP-4: Error handling
	it('TC-PP-4: shows an error message when the API call rejects', async () => {
		vi.mocked(TauriApi.listGroceryCategories).mockRejectedValue(new Error('DB unavailable'));
		renderPage();

		await waitFor(() => {
			expect(screen.getByText('Error loading data')).toBeInTheDocument();
		});
		expect(screen.getByText('DB unavailable')).toBeInTheDocument();
	});

	// TC-PP-5: Extra DB categories are appended after the predefined 13
	it('TC-PP-5: appends extra DB categories that are not in the predefined list', async () => {
		const withExtra = [
			...DB_CATEGORIES,
			{ id: 99, name: 'seasonal_special', count: 4 },
		];
		vi.mocked(TauriApi.listGroceryCategories).mockResolvedValue(withExtra);
		renderPage();

		await waitFor(() => {
			expect(screen.queryByText('Loading categories...')).not.toBeInTheDocument();
		});

		// The extra category should appear (formatted by formatCategoryName)
		expect(screen.getByText('Seasonal Special')).toBeInTheDocument();
	});
});
