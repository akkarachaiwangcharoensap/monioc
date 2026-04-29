import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SpendingPieChart from './SpendingPieChart';
import type { SpendingPieChartItem } from './SpendingPieChart';

// Recharts uses ResizeObserver internally — stub it for jsdom.
vi.stubGlobal('ResizeObserver', class {
	observe() {}
	unobserve() {}
	disconnect() {}
});

const items: SpendingPieChartItem[] = [
	{ category: 'Groceries', amount: 50, items: 5 },
	{ category: 'Dining', amount: 30, items: 3 },
	{ category: 'Transport', amount: 20, items: 2 },
];

const getCategoryColor = (cat: string) => {
	const map: Record<string, string> = { Groceries: '#10B981', Dining: '#F59E0B', Transport: '#3B82F6' };
	return map[cat] ?? '';
};

describe('SpendingPieChart', () => {
	it('renders empty state when items is empty', () => {
		render(
			<SpendingPieChart
				items={[]}
				getCategoryColor={getCategoryColor}
				onCategoryClick={vi.fn()}
				totalAmount={0}
			/>,
		);
		expect(screen.getByText('No data for this period')).toBeInTheDocument();
	});

	it('renders empty state when all amounts are zero', () => {
		render(
			<SpendingPieChart
				items={[{ category: 'A', amount: 0, items: 0 }]}
				getCategoryColor={getCategoryColor}
				onCategoryClick={vi.fn()}
				totalAmount={0}
			/>,
		);
		expect(screen.getByText('No data for this period')).toBeInTheDocument();
	});

	it('renders legend items for each category', () => {
		render(
			<SpendingPieChart
				items={items}
				getCategoryColor={getCategoryColor}
				onCategoryClick={vi.fn()}
				totalAmount={100}
			/>,
		);
		expect(screen.getByText('Groceries')).toBeInTheDocument();
		expect(screen.getByText('Dining')).toBeInTheDocument();
		expect(screen.getByText('Transport')).toBeInTheDocument();
	});

	it('shows total amount in the centre label', () => {
		render(
			<SpendingPieChart
				items={items}
				getCategoryColor={getCategoryColor}
				onCategoryClick={vi.fn()}
				totalAmount={100}
			/>,
		);
		expect(screen.getByText('Total')).toBeInTheDocument();
		// formatMoney(100) may be "$100.00" or "CA$100.00" depending on locale
		expect(screen.getByText(/\$100\.00/)).toBeInTheDocument();
	});

	it('calls onCategoryClick when a legend item is clicked', () => {
		const handler = vi.fn();
		render(
			<SpendingPieChart
				items={items}
				getCategoryColor={getCategoryColor}
				onCategoryClick={handler}
				totalAmount={100}
			/>,
		);
		fireEvent.click(screen.getByText('Groceries'));
		expect(handler).toHaveBeenCalledWith('Groceries');
	});

	it('renders an accessible legend as a <ul>', () => {
		const { container } = render(
			<SpendingPieChart
				items={items}
				getCategoryColor={getCategoryColor}
				onCategoryClick={vi.fn()}
				totalAmount={100}
			/>,
		);
		const list = container.querySelector('ul');
		expect(list).toBeInTheDocument();
		const listItems = container.querySelectorAll('li');
		expect(listItems.length).toBe(3);
	});

	it('renders percentage labels in the legend', () => {
		render(
			<SpendingPieChart
				items={items}
				getCategoryColor={getCategoryColor}
				onCategoryClick={vi.fn()}
				totalAmount={100}
			/>,
		);
		expect(screen.getByText('50.0%')).toBeInTheDocument();
		expect(screen.getByText('30.0%')).toBeInTheDocument();
		expect(screen.getByText('20.0%')).toBeInTheDocument();
	});

	it('re-renders without errors when items prop changes', () => {
		const { rerender } = render(
			<SpendingPieChart
				items={items}
				getCategoryColor={getCategoryColor}
				onCategoryClick={vi.fn()}
				totalAmount={100}
			/>,
		);
		// Swap to a completely different dataset — should not throw and should
		// render the new category names (validates the key-based remount path).
		const newItems: SpendingPieChartItem[] = [
			{ category: 'Bakery', amount: 80, items: 4 },
			{ category: 'Frozen', amount: 20, items: 2 },
		];
		rerender(
			<SpendingPieChart
				items={newItems}
				getCategoryColor={getCategoryColor}
				onCategoryClick={vi.fn()}
				totalAmount={100}
			/>,
		);
		expect(screen.getByText('Bakery')).toBeInTheDocument();
		expect(screen.getByText('Frozen')).toBeInTheDocument();
		// Old categories should no longer be present
		expect(screen.queryByText('Groceries')).not.toBeInTheDocument();
	});
});
