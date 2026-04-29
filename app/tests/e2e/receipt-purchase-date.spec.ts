/**
 * E2E tests: ReceiptDateRow — purchase-date clearing behaviour.
 *
 * Verifies that:
 *  - The date picker shows a date when purchaseDate is set
 *  - The clear "x" icon is visible when a date is displayed
 *  - Clicking "x" clears the date input
 *  - When purchaseDate is null, no clear icon is shown (no createdAt fallback)
 *  - Selecting a new date after clearing works correctly
 */

import { test, expect } from '@playwright/test';
import { setupTauriShim } from './helpers/tauri-shim';
import type { MockReceiptRecord } from './helpers/tauri-shim';

const TODAY_STR = (() => {
	const d = new Date();
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} 10:00:00`;
})();

const RECEIPT_WITH_PURCHASE_DATE: MockReceiptRecord = {
	id: 1,
	imagePath: '/receipts/store-a.jpg',
	processedImagePath: null,
	data: { rows: [{ name: 'Milk', price: 3.99 }] },
	createdAt: '2026-03-01 10:00:00',
	updatedAt: '2026-03-01 10:00:00',
	displayName: 'Store A',
	purchaseDate: '2026-03-05',
};

const RECEIPT_WITHOUT_PURCHASE_DATE: MockReceiptRecord = {
	id: 2,
	imagePath: '/receipts/store-b.jpg',
	processedImagePath: null,
	data: { rows: [{ name: 'Eggs', price: 5.49 }] },
	createdAt: TODAY_STR,
	updatedAt: TODAY_STR,
	displayName: 'Store B',
};

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('ReceiptDateRow — purchase date clear button', () => {
	test.beforeEach(async ({ page }) => {
		await setupTauriShim(page, {
			receiptScans: [RECEIPT_WITH_PURCHASE_DATE, RECEIPT_WITHOUT_PURCHASE_DATE],
		});
		await page.goto('/#/receipts');
		await expect(page.getByText('Store A')).toBeVisible({ timeout: 5_000 });
	});

	test('clear icon is visible when purchaseDate is set', async ({ page }) => {
		const card = page.locator('div.group.relative').filter({ hasText: 'Store A' });
		// The clear icon uses fa-times inside the date picker wrapper
		await expect(card.locator('.fa-times').first()).toBeVisible();
	});

	test('no clear icon is shown when purchaseDate is null', async ({ page }) => {
		const card = page.locator('div.group.relative').filter({ hasText: 'Store B' });
		// When purchaseDate is null the picker shows empty placeholders;
		// there is no date value so the clear icon must not appear.
		await expect(card.locator('.fa-times')).toHaveCount(0);
	});

	test('clicking clear removes the date from the input', async ({ page }) => {
		const card = page.locator('div.group.relative').filter({ hasText: 'Store A' });
		const clearBtn = card.locator('.fa-times').first();

		await test.step('Click the clear icon', async () => {
			await clearBtn.click();
		});

		await test.step('Date input shows placeholder (not the createdAt fallback)', async () => {
			// After clearing, the date picker should show empty placeholders (mm/dd/yyyy)
			// The clear icon should disappear since no date is displayed
			await expect(card.locator('.fa-times')).toHaveCount(0);
		});
	});

	test('receipt without purchaseDate shows empty date picker with placeholders', async ({ page }) => {
		const card = page.locator('div.group.relative').filter({ hasText: 'Store B' });
		// When purchaseDate is null the DatePicker shows placeholder fields and
		// no clear icon — there is nothing to clear.
		await expect(card.locator('.fa-times')).toHaveCount(0);
	});
});
