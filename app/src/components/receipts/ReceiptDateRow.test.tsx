/**
 * Unit tests for ReceiptDateRow.
 *
 * Verifies the component's rendering behaviour around the purchaseDate and
 * createdAt fields — specifically the regression path for Bug 1 where both
 * dates could be silently dropped from queueScanResults and cause the
 * "Scanned" section to disappear and "Purchased" to show empty.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ReceiptDateRow from './ReceiptDateRow';

// ── TC-DR1: Scanned section visibility ────────────────────────────────────────

describe('ReceiptDateRow — Scanned date visibility', () => {
	it('TC-DR1: renders "Scanned" label when createdAt is a valid date string', () => {
		render(
			<ReceiptDateRow
				purchaseDate={null}
				createdAt="2024-03-15 10:00:00"
			/>,
		);
		expect(screen.getByText('Scanned')).toBeInTheDocument();
	});

	it('TC-DR2: does not render "Scanned" label when createdAt is null', () => {
		render(
			<ReceiptDateRow
				purchaseDate={null}
				createdAt={null}
			/>,
		);
		expect(screen.queryByText('Scanned')).not.toBeInTheDocument();
	});

	it('TC-DR3: does not render "Scanned" label when createdAt is undefined', () => {
		render(
			<ReceiptDateRow
				purchaseDate={null}
				createdAt={undefined}
			/>,
		);
		expect(screen.queryByText('Scanned')).not.toBeInTheDocument();
	});

	it('TC-DR4: renders "Scanned" label when createdAt is an ISO-like string without time', () => {
		render(
			<ReceiptDateRow
				purchaseDate={null}
				createdAt="2024-06-01"
			/>,
		);
		expect(screen.getByText('Scanned')).toBeInTheDocument();
	});
});

// ── TC-DR2: Purchased section always present ──────────────────────────────────

describe('ReceiptDateRow — Purchased date always present', () => {
	it('TC-DR5: renders "Purchased" label regardless of purchaseDate value', () => {
		const { rerender } = render(
			<ReceiptDateRow
				purchaseDate={null}
				createdAt={null}
			/>,
		);
		expect(screen.getByText('Purchased')).toBeInTheDocument();

		rerender(
			<ReceiptDateRow
				purchaseDate="2024-01-10"
				createdAt={null}
			/>,
		);
		expect(screen.getByText('Purchased')).toBeInTheDocument();
	});

	it('TC-DR6: shows formatted date when purchaseDate is provided (no onChange)', () => {
		render(
			<ReceiptDateRow
				purchaseDate="2024-03-15"
				createdAt={null}
			/>,
		);
		// The component formats the date via toLocaleDateString — partial match is robust.
		const text = screen.getByText(/Mar/i);
		expect(text).toBeInTheDocument();
	});

	it('TC-DR7: shows dash when purchaseDate is null and no onChange handler', () => {
		render(
			<ReceiptDateRow
				purchaseDate={null}
				createdAt={null}
			/>,
		);
		expect(screen.getByText('—')).toBeInTheDocument();
	});
});

// ── TC-DR3: Regression — both dates present ───────────────────────────────────

describe('ReceiptDateRow — both dates rendered together', () => {
	it('TC-DR8: renders both Purchased and Scanned labels when both dates are set', () => {
		render(
			<ReceiptDateRow
				purchaseDate="2024-03-10"
				createdAt="2024-03-15 08:30:00"
			/>,
		);
		expect(screen.getByText('Purchased')).toBeInTheDocument();
		expect(screen.getByText('Scanned')).toBeInTheDocument();
	});

	it('TC-DR9: only Purchased is visible when createdAt is dropped to null (Bug 1 scenario)', () => {
		const { rerender } = render(
			<ReceiptDateRow
				purchaseDate="2024-03-10"
				createdAt="2024-03-15 08:30:00"
			/>,
		);
		// Both visible initially
		expect(screen.getByText('Scanned')).toBeInTheDocument();

		// Simulate Bug 1: createdAt gets dropped (set to null)
		rerender(
			<ReceiptDateRow
				purchaseDate="2024-03-10"
				createdAt={null}
			/>,
		);
		// "Scanned" section should be gone
		expect(screen.queryByText('Scanned')).not.toBeInTheDocument();
		// "Purchased" should still be there
		expect(screen.getByText('Purchased')).toBeInTheDocument();
	});
});
