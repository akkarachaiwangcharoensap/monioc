import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// ── Module mocks ───────────────────────────────────────────────────────────────

vi.mock('../services/api', () => ({
	TauriApi: {
		listGroceryProducts: vi.fn(),
	},
}));

// LocationSelector depends on useGroceryData — stub it so no Provider is needed.
vi.mock('../hooks', () => ({
	useGroceryData: () => ({ data: null, loading: false, error: null }),
}));

vi.mock('../hooks/useLocationPreference', () => ({
	useLocationPreference: () => ({ location: 'Canada', setLocation: vi.fn() }),
}));

// TabLink uses TabContext — replace with a simple <a> so no TabProvider is needed.
vi.mock('../components/ui/TabLink', () => ({
	default: ({ to, children, ...rest }: { to: string; children: React.ReactNode; [k: string]: unknown }) =>
		<a href={to} {...rest}>{children}</a>,
}));

// ── Imports ────────────────────────────────────────────────────────────────────

import CategoryPage from './CategoryPage';
import { TauriApi } from '../services/api';

// ── Fixtures ───────────────────────────────────────────────────────────────────

const PRODUCE_PRODUCTS = [
	{ id: 1, name: 'Apples, fresh',  category: 'produce', unit: 'kg' },
	{ id: 2, name: 'Bananas',        category: 'produce', unit: 'kg' },
	{ id: 3, name: 'Carrots, fresh', category: 'produce', unit: 'kg' },
];

const PRODUCE_PAGE = { products: PRODUCE_PRODUCTS, total: 3, page: 1, pageSize: 200 };
const EMPTY_PAGE   = { products: [], total: 0, page: 1, pageSize: 200 };

function renderWithCategory(category: string) {
	return render(
		<MemoryRouter initialEntries={[`/products/${category}`]}>
			<Routes>
				<Route path="/products/:category" element={<CategoryPage />} />
			</Routes>
		</MemoryRouter>,
	);
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('CategoryPage', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		// Default: return empty page — overridden per test.
		vi.mocked(TauriApi.listGroceryProducts).mockResolvedValue(EMPTY_PAGE);
	});

	afterEach(() => cleanup());

	// TC-CP-1: Loading state
	it('TC-CP-1: shows a loading indicator while products are being fetched', () => {
		vi.mocked(TauriApi.listGroceryProducts).mockReturnValue(new Promise(() => { /* never resolves */ }));
		renderWithCategory('produce');
		expect(screen.getByText('Loading products...')).toBeInTheDocument();
	});

	// TC-CP-2: Renders product cards
	it('TC-CP-2: renders a product card for each product returned by the API', async () => {
		vi.mocked(TauriApi.listGroceryProducts).mockResolvedValue(PRODUCE_PAGE);
		renderWithCategory('produce');

		await waitFor(() => {
			expect(screen.queryByText('Loading products...')).not.toBeInTheDocument();
		});

		expect(screen.getByText('Apples, fresh')).toBeInTheDocument();
		expect(screen.getByText('Bananas')).toBeInTheDocument();
		expect(screen.getByText('Carrots, fresh')).toBeInTheDocument();
	});

	// TC-CP-3: Product count
	it('TC-CP-3: shows the correct product count for the loaded category', async () => {
		vi.mocked(TauriApi.listGroceryProducts).mockResolvedValue(PRODUCE_PAGE);
		renderWithCategory('produce');

		await waitFor(() => {
			expect(screen.getByText('3 products')).toBeInTheDocument();
		});
	});

	// TC-CP-4: Empty state
	it('TC-CP-4: shows an empty-state message when the category has no products', async () => {
		vi.mocked(TauriApi.listGroceryProducts).mockResolvedValue(EMPTY_PAGE);
		renderWithCategory('baby');

		await waitFor(() => {
			expect(screen.queryByText('Loading products...')).not.toBeInTheDocument();
		});

		expect(screen.getByText('No products available in this category')).toBeInTheDocument();
	});

	// TC-CP-5: Correct API arguments
	it('TC-CP-5: calls the API with the correct category slug and full page size', async () => {
		vi.mocked(TauriApi.listGroceryProducts).mockResolvedValue(EMPTY_PAGE);
		renderWithCategory('meat_and_seafood');

		await waitFor(() => {
			expect(TauriApi.listGroceryProducts).toHaveBeenCalledWith(
				expect.objectContaining({ category: 'meat_and_seafood', page: 1, pageSize: 200 }),
			);
		});
	});

	// TC-CP-6: Error state
	it('TC-CP-6: shows an error message when the API call rejects', async () => {
		vi.mocked(TauriApi.listGroceryProducts).mockRejectedValue(new Error('network error'));
		renderWithCategory('produce');

		await waitFor(() => {
			expect(screen.getByText('Error loading products')).toBeInTheDocument();
		});
		expect(screen.getByText('network error')).toBeInTheDocument();
	});

	// TC-CP-7: Unit badge visible on product cards
	it('TC-CP-7: renders the unit badge on each product card', async () => {
		vi.mocked(TauriApi.listGroceryProducts).mockResolvedValue(PRODUCE_PAGE);
		renderWithCategory('produce');

		await waitFor(() => {
			expect(screen.queryByText('Loading products...')).not.toBeInTheDocument();
		});

		// CSS 'uppercase' class doesn't apply in jsdom — query the raw unit value
		const kgBadges = screen.getAllByText('kg');
		expect(kgBadges).toHaveLength(3);
	});
});
