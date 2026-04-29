import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReceiptSpreadsheet from '../ReceiptSpreadsheet';
import type { ReceiptData } from '../../../types';
import { rows as makeRows } from '../../../test/factories';

function makeData(n = 3): ReceiptData {
	return { rows: makeRows(n) };
}

describe('ReceiptSpreadsheet integration', () => {
	let onChange: ReturnType<typeof vi.fn>;
	let user: ReturnType<typeof userEvent.setup>;

	beforeEach(() => {
		onChange = vi.fn();
		user = userEvent.setup();
	});

	afterEach(() => cleanup());

	// TC-I1: Renders correct number of rows
	it('TC-I1: renders the correct number of data rows', () => {
		render(<ReceiptSpreadsheet data={makeData(3)} onChange={onChange} />);
		// Row number indicators (1, 2, 3) all present
		expect(screen.getByText('1')).toBeInTheDocument();
		expect(screen.getByText('2')).toBeInTheDocument();
		expect(screen.getByText('3')).toBeInTheDocument();
	});

	// TC-I2: Renders "Add row" button
	it('TC-I2: renders the Add row button', () => {
		render(<ReceiptSpreadsheet data={makeData(1)} onChange={onChange} />);
		expect(screen.getByRole('button', { name: /Add row/i })).toBeInTheDocument();
	});

	// TC-I3: Clicking Add row calls onChange with one extra row
	it('TC-I3: clicking Add row calls onChange with one extra row', async () => {
		const data = makeData(2);
		render(<ReceiptSpreadsheet data={data} onChange={onChange} />);
		await user.click(screen.getByRole('button', { name: /Add row/i }));
		expect(onChange).toHaveBeenCalled();
		const nextData: ReceiptData = onChange.mock.calls[0][0];
		expect(nextData.rows).toHaveLength(3);
	});

	// TC-I4: Row names are visible in inputs
	it('TC-I4: row name values are rendered in inputs', () => {
		const data: ReceiptData = {
			rows: [{ _id: 'a1', name: 'Apples', price: 1.5 }, { _id: 'b2', name: 'Bread', price: 2.0 }],
		};
		render(<ReceiptSpreadsheet data={data} onChange={onChange} />);
		expect(screen.getByDisplayValue('Apples')).toBeInTheDocument();
		expect(screen.getByDisplayValue('Bread')).toBeInTheDocument();
	});

	// TC-I5: Price values are formatted and visible
	it('TC-I5: price values are formatted as 2dp strings', () => {
		const data: ReceiptData = {
			rows: [{ _id: 'a1', name: 'Milk', price: 3.5 }],
		};
		render(<ReceiptSpreadsheet data={data} onChange={onChange} />);
		expect(screen.getByDisplayValue('3.50')).toBeInTheDocument();
	});

	// TC-I6: Rows keyed by _id — existing rows survive re-render identity
	it('TC-I6: rows with _id render stable keys (no DOM flicker on re-render)', () => {
		const data: ReceiptData = {
			rows: [
				{ _id: 'stable-1', name: 'Item A', price: 1.0 },
				{ _id: 'stable-2', name: 'Item B', price: 2.0 },
			],
		};
		const { rerender } = render(<ReceiptSpreadsheet data={data} onChange={onChange} />);
		const inputBefore = screen.getByDisplayValue('Item A');

		// Re-render with same data
		rerender(<ReceiptSpreadsheet data={data} onChange={onChange} />);
		const inputAfter = screen.getByDisplayValue('Item A');

		expect(inputBefore).toBe(inputAfter);
	});

	// TC-I7: Empty data (0 rows) renders at least one row (enforced minimum)
	it('TC-I7: empty row array is normalised to one empty row', () => {
		render(<ReceiptSpreadsheet data={{ rows: [] }} onChange={onChange} />);
		// Should have at minimum one name input rendered
		const inputs = screen.getAllByPlaceholderText('Item name');
		expect(inputs.length).toBeGreaterThanOrEqual(1);
	});

	// TC-I8: Category dropdown renders for each row
	it('TC-I8: each row has a category dropdown', () => {
		const data = makeData(2);
		render(<ReceiptSpreadsheet data={data} onChange={onChange} />);
		const selects = screen.getAllByRole('combobox');
		expect(selects.length).toBe(2);
	});

	// TC-I9: Changing category calls onChange with updated category
	it('TC-I9: selecting a category calls onChange with the new category', async () => {
		const data: ReceiptData = {
			rows: [{ _id: 'r1', name: 'Cheese', price: 4.0 }],
		};
		render(<ReceiptSpreadsheet data={data} onChange={onChange} categories={['Dairy', 'Bakery']} />);
		const select = screen.getByRole('combobox');
		await user.selectOptions(select, 'Dairy');
		expect(onChange).toHaveBeenCalled();
		const next: ReceiptData = onChange.mock.calls[0][0];
		expect(next.rows[0].category).toBe('Dairy');
	});

	// TC-I10: Context menu appears on right-click
	it('TC-I10: right-clicking a row shows a context menu', () => {
		const data = makeData(2);
		render(<ReceiptSpreadsheet data={data} onChange={onChange} />);
		// Find first name input container (the cell div)
		const nameInputs = screen.getAllByPlaceholderText('Item name');
		fireEvent.contextMenu(nameInputs[0]);
		// Check for a context menu item that only appears after right-click
		expect(
			screen.queryByText(/insert above|insert below|delete row/i),
		).toBeInTheDocument();
	});

	// TC-I11: External data update syncs rows
	it('TC-I11: re-render with new data syncs the row display', async () => {
		const data1: ReceiptData = { rows: [{ _id: 'x1', name: 'Old name', price: 1.0 }] };
		const data2: ReceiptData = { rows: [{ _id: 'x1', name: 'New name', price: 1.0 }] };
		const { rerender } = render(<ReceiptSpreadsheet data={data1} onChange={onChange} />);
		expect(screen.getByDisplayValue('Old name')).toBeInTheDocument();
		rerender(<ReceiptSpreadsheet data={data2} onChange={onChange} />);
		expect(screen.getByDisplayValue('New name')).toBeInTheDocument();
	});

	// TC-I12: Column headers are visible
	it('TC-I12: Name, Category, Price column headers are rendered', () => {
		render(<ReceiptSpreadsheet data={makeData(1)} onChange={onChange} />);
		// Use getAllByText to handle multiple elements matching the pattern
		expect(screen.getAllByText(/\bname\b/i).length).toBeGreaterThanOrEqual(1);
		expect(screen.getAllByText(/\bcategory\b/i).length).toBeGreaterThanOrEqual(1);
		expect(screen.getAllByText(/\bprice\b/i).length).toBeGreaterThanOrEqual(1);
	});

	// TC-I13: Custom categories prop is used in the dropdown
	it('TC-I13: custom categories prop populates the dropdown options', () => {
		const data: ReceiptData = { rows: [{ _id: 'c1', name: 'Carrot', price: 0.5 }] };
		render(
			<ReceiptSpreadsheet
				data={data}
				onChange={onChange}
				categories={['Veggies', 'Meat']}
			/>,
		);
		expect(screen.getByRole('option', { name: 'Veggies' })).toBeInTheDocument();
		expect(screen.getByRole('option', { name: 'Meat' })).toBeInTheDocument();
	});

	// TC-I14: Rows without _id are auto-hydrated (no crash)
	it('TC-I14: rows without _id are hydrated without error', () => {
		const data: ReceiptData = {
			rows: [
				{ name: 'No ID row', price: 1.23 } as { name: string; price: number },
			],
		};
		expect(() =>
			render(<ReceiptSpreadsheet data={data} onChange={onChange} />),
		).not.toThrow();
		expect(screen.getByDisplayValue('No ID row')).toBeInTheDocument();
	});

	// TC-I15: Price input shows empty string for zero price
	it('TC-I15: price input is empty when price is 0', () => {
		const data: ReceiptData = { rows: [{ _id: 'z1', name: 'Free item', price: 0 }] };
		render(<ReceiptSpreadsheet data={data} onChange={onChange} />);
		const priceInputs = screen.getAllByPlaceholderText('0.00');
		expect((priceInputs[0] as HTMLInputElement).value).toBe('');
	});

	// TC-I16: There is a container element with the spreadsheet structure
	it('TC-I16: spreadsheet container is rendered', () => {
		const { container } = render(<ReceiptSpreadsheet data={makeData(2)} onChange={onChange} />);
		// The outer container should have rounded-2xl class
		expect(container.querySelector('.rounded-2xl')).toBeInTheDocument();
	});

	// TC-I17: Keyboard Escape on a name input blurs without crashing
	it('TC-I17: pressing Escape on name input does not crash', async () => {
		const data: ReceiptData = { rows: [{ _id: 'e1', name: 'Egg', price: 0.5 }] };
		render(<ReceiptSpreadsheet data={data} onChange={onChange} />);
		const input = screen.getByDisplayValue('Egg');
		input.focus();
		await user.keyboard('{Escape}');
		// No error thrown — test passes if we get here
	});

	// TC-I18: The component renders without required getCategoryColor and still shows colours
	it('TC-I18: renders without getCategoryColor prop without crashing', () => {
		const data: ReceiptData = {
			rows: [{ _id: 'g1', name: 'Grapes', price: 3.0, category: 'Produce' }],
		};
		expect(() =>
			render(<ReceiptSpreadsheet data={data} onChange={onChange} />),
		).not.toThrow();
	});
});
