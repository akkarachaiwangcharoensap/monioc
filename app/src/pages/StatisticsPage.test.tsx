import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import StatisticsPage from './StatisticsPage';
import type { ReceiptScanRecord } from '../types/receipt';
import * as ReceiptCacheContext from '../context/ReceiptCacheContext';
import * as CategoriesContext from '../context/CategoriesContext';
import * as TabContext from '../context/TabContext';
import { STORAGE_KEYS } from '../constants';

vi.mock('../context/ReceiptCacheContext', () => ({
	useReceiptCache: vi.fn(),
}));

vi.mock('../context/CategoriesContext', () => ({
	useCategoriesContext: vi.fn(),
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
	ReferenceLine: () => <div />,
	Cell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

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
		<MemoryRouter>
			<StatisticsPage />
		</MemoryRouter>,
	);
}

describe('StatisticsPage', () => {
	beforeEach(() => {
		vi.stubGlobal('scrollTo', vi.fn());
		localStorage.clear();
		vi.mocked(ReceiptCacheContext.useReceiptCache).mockReturnValue({ receipts: MOCK_RECORDS, isInitialLoading: false, getReceipt: vi.fn(), applyOptimistic: vi.fn(), applyUpdate: vi.fn(), applyOptimisticDelete: vi.fn(), forceReload: vi.fn() });
		vi.mocked(CategoriesContext.useCategoriesContext).mockReturnValue({ getCategoryColor: () => '#6366F1' } as unknown as ReturnType<typeof CategoriesContext.useCategoriesContext>);
		vi.mocked(TabContext.useTabContext).mockReturnValue({ openReceiptEditorTab: vi.fn() } as unknown as ReturnType<typeof TabContext.useTabContext>);
	});

	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it('loads the persisted period offset from localStorage', async () => {
		localStorage.setItem(STORAGE_KEYS.STATISTICS_PERIOD_OFFSET, '-1');
		renderPage();

		const expectedYear = String(new Date().getFullYear() - 1);
		await expect(screen.findByText(expectedYear)).resolves.toBeInTheDocument();
		expect(localStorage.getItem(STORAGE_KEYS.STATISTICS_PERIOD_OFFSET)).toBe('-1');
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

	it('resets the period offset to 0 when changing granularity', async () => {
		localStorage.setItem(STORAGE_KEYS.STATISTICS_PERIOD_OFFSET, '-2');
		renderPage();

		await screen.findByRole('radio', { name: 'Month granularity' });
		await screen.getByRole('radio', { name: 'Month granularity' }).click();

		await waitFor(() => {
			expect(localStorage.getItem(STORAGE_KEYS.STATISTICS_PERIOD_OFFSET)).toBe('0');
		});
	});
});
