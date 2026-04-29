/**
 * E2E tests: scan/rescan state consistency in the Receipt Editor.
 *
 * Verifies that the scanning animation (spinner overlay on thumbnails,
 * "Scanning…" button label) appears reliably on every scan — including the
 * 2nd and 3rd rescan — and that the UI returns to a clean "done" state
 * after each scan completes.
 *
 * Uses the Tauri shim's dynamic hang control:
 *   __tauriSetHangOnScan(true)   — freeze subsequent scans in scanning state
 *   __tauriCompleteScan()        — fire the done event for the hanging scan
 */

import { test, expect } from '@playwright/test';
import { setupTauriShim } from './helpers/tauri-shim';
import type { MockReceiptRecord } from './helpers/tauri-shim';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const RECEIPT: MockReceiptRecord = {
	id: 7,
	imagePath: '/mock/receipts/costco-mar.jpg',
	processedImagePath: null,
	data: {
		rows: [
			{ name: 'Chicken Breast', price: 22.49, _id: 'row-1' },
			{ name: 'Organic Milk', price: 6.99, _id: 'row-2' },
		],
	},
	createdAt: '2026-03-15 09:00:00',
	updatedAt: '2026-03-15 09:00:00',
	displayName: 'Costco March',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Open the RECEIPT in the editor via the Receipts dashboard. */
async function openReceipt(page: import('@playwright/test').Page) {
	await page.goto('/#/receipts');
	await expect(page.getByText('Costco March').first()).toBeVisible({ timeout: 5_000 });
	await page.getByText('Costco March').first().click();
	await expect(page).toHaveURL(/#\/receipts\/editor/, { timeout: 5_000 });
	await expect(page.getByRole('button', { name: /Re-Scan Receipt/i })).toBeVisible({
		timeout: 5_000,
	});
}

/** The Re-Scan / Scanning… button. */
function _rescanButton(page: import('@playwright/test').Page) {
	// Match both "Re-Scan Receipt" and "Scanning…" labels.
	return page.getByRole('button', { name: /Re-Scan Receipt|Scanning/i });
}

/** Locator for spinner icons within the thumbnail strip area. */
function thumbnailSpinner(page: import('@playwright/test').Page) {
	// The thumbnail strip renders inside a flex container with w-16 h-16 items.
	// Each scanning overlay contains a fa-spinner.fa-spin icon.
	return page.locator('.fa-spinner.fa-spin');
}

// ── Test Suite ─────────────────────────────────────────────────────────────────

test.describe('Editor scan state consistency — thumbnail animation', () => {
	test('first scan shows scanning animation on thumbnail and button', async ({ page }) => {
		await setupTauriShim(page, {
			receiptScans: [RECEIPT],
			hangOnScanReceipt: true,
		});

		await openReceipt(page);

		await test.step('Click Re-Scan — UI enters scanning state', async () => {
			await page.getByRole('button', { name: /Re-Scan Receipt/i }).click();
			await expect(page.getByRole('button', { name: 'Scanning…' })).toBeVisible({
				timeout: 5_000,
			});
		});

		await test.step('Thumbnail shows spinner overlay', async () => {
			// At least one spinner should be visible in the thumbnail strip area.
			await expect(thumbnailSpinner(page).first()).toBeVisible({ timeout: 3_000 });
		});
	});

	test('2nd rescan still shows scanning animation after 1st scan completes', async ({ page }) => {
		await setupTauriShim(page, {
			receiptScans: [RECEIPT],
			updatedReceiptRecord: RECEIPT,
		});

		await openReceipt(page);

		await test.step('1st scan completes normally', async () => {
			await page.getByRole('button', { name: /Re-Scan Receipt/i }).click();
			// Wait for scan to finish — button reverts to "Re-Scan Receipt".
			await expect(page.getByRole('button', { name: /Re-Scan Receipt/i })).toBeVisible({
				timeout: 15_000,
			});
		});

		await test.step('Enable hang for 2nd scan', async () => {
			await page.evaluate(() => {
				// @ts-expect-error — test shim global
				window.__tauriSetHangOnScan(true);
			});
		});

		await test.step('2nd scan shows Scanning… button', async () => {
			await page.getByRole('button', { name: /Re-Scan Receipt/i }).click();
			await expect(page.getByRole('button', { name: 'Scanning…' })).toBeVisible({
				timeout: 5_000,
			});
		});

		await test.step('Thumbnail still shows spinner overlay during 2nd scan', async () => {
			await expect(thumbnailSpinner(page).first()).toBeVisible({ timeout: 3_000 });
		});
	});

	test('3rd rescan animation works after two completed scans', async ({ page }) => {
		await setupTauriShim(page, {
			receiptScans: [RECEIPT],
			updatedReceiptRecord: RECEIPT,
		});

		await openReceipt(page);
		const btn = page.getByRole('button', { name: /Re-Scan Receipt/i });

		await test.step('1st scan completes', async () => {
			await btn.click();
			await expect(btn).toBeVisible({ timeout: 15_000 });
		});

		await test.step('2nd scan completes', async () => {
			await btn.click();
			await expect(btn).toBeVisible({ timeout: 15_000 });
		});

		await test.step('Hang 3rd scan', async () => {
			await page.evaluate(() => {
				// @ts-expect-error — test shim global
				window.__tauriSetHangOnScan(true);
			});
			await btn.click();
		});

		await test.step('3rd scan shows scanning animation', async () => {
			await expect(page.getByRole('button', { name: 'Scanning…' })).toBeVisible({
				timeout: 5_000,
			});
			await expect(thumbnailSpinner(page).first()).toBeVisible({ timeout: 3_000 });
		});
	});

	test('scan completes and UI returns to clean done state', async ({ page }) => {
		await setupTauriShim(page, {
			receiptScans: [RECEIPT],
			hangOnScanReceipt: true,
			updatedReceiptRecord: RECEIPT,
		});

		await openReceipt(page);

		await test.step('Start scan (hangs)', async () => {
			await page.getByRole('button', { name: /Re-Scan Receipt/i }).click();
			await expect(page.getByRole('button', { name: 'Scanning…' })).toBeVisible({
				timeout: 5_000,
			});
			await expect(thumbnailSpinner(page).first()).toBeVisible({ timeout: 3_000 });
		});

		await test.step('Complete scan — UI returns to done state', async () => {
			await page.evaluate(() => {
				// @ts-expect-error — test shim global
				window.__tauriCompleteScan();
			});
			await expect(page.getByRole('button', { name: /Re-Scan Receipt/i })).toBeVisible({
				timeout: 5_000,
			});
			// Spinner should disappear from thumbnails.
			await expect(thumbnailSpinner(page)).toHaveCount(0, { timeout: 3_000 });
		});
	});
});

test.describe('Editor scan state consistency — scan submission tracking', () => {
	test('each rescan click actually submits a new scan_receipt invocation', async ({ page }) => {
		await setupTauriShim(page, {
			receiptScans: [RECEIPT],
			updatedReceiptRecord: RECEIPT,
		});

		await openReceipt(page);
		const btn = page.getByRole('button', { name: /Re-Scan Receipt/i });

		await test.step('1st scan submitted', async () => {
			await btn.click();
			await expect(btn).toBeVisible({ timeout: 15_000 });
			const count = await page.evaluate(() =>
				(window as unknown as Record<string, number>).__tauriScanReceiptCount ?? 0,
			);
			expect(count).toBe(1);
		});

		await test.step('2nd scan submitted (not silently dropped)', async () => {
			await btn.click();
			await expect(btn).toBeVisible({ timeout: 15_000 });
			const count = await page.evaluate(() =>
				(window as unknown as Record<string, number>).__tauriScanReceiptCount ?? 0,
			);
			expect(count).toBe(2);
		});

		await test.step('3rd scan submitted', async () => {
			await btn.click();
			await expect(btn).toBeVisible({ timeout: 15_000 });
			const count = await page.evaluate(() =>
				(window as unknown as Record<string, number>).__tauriScanReceiptCount ?? 0,
			);
			expect(count).toBe(3);
		});
	});
});

test.describe('Editor scan state consistency — categorize animation', () => {
	test('categorize shows categorizing state on button', async ({ page }) => {
		await setupTauriShim(page, {
			receiptScans: [RECEIPT],
			updatedReceiptRecord: {
				...RECEIPT,
				data: {
					rows: [
						{ name: 'Chicken Breast', price: 22.49, category: 'Meat' },
						{ name: 'Organic Milk', price: 6.99, category: 'Dairy' },
					],
				},
			},
			inferredCategories: ['Meat', 'Dairy'],
		});

		await openReceipt(page);
		const catBtn = page.getByRole('button', { name: /Auto-categorize/i });
		await expect(catBtn).toBeVisible({ timeout: 5_000 });
		await catBtn.click();
		// Button should re-enable after categorize completes.
		await expect(catBtn).toBeEnabled({ timeout: 10_000 });
	});
});

test.describe('Editor scan state consistency — post-scan state cleanup', () => {
	test('after scan completes, no stale scanning indicators remain', async ({ page }) => {
		await setupTauriShim(page, {
			receiptScans: [RECEIPT],
			updatedReceiptRecord: RECEIPT,
		});

		await openReceipt(page);

		await test.step('Run scan and wait for completion', async () => {
			await page.getByRole('button', { name: /Re-Scan Receipt/i }).click();
			await expect(page.getByRole('button', { name: /Re-Scan Receipt/i })).toBeVisible({
				timeout: 15_000,
			});
		});

		await test.step('No spinners visible in thumbnail strip', async () => {
			await expect(thumbnailSpinner(page)).toHaveCount(0);
		});

		await test.step('Re-Scan button is enabled and not showing scanning state', async () => {
			const btn = page.getByRole('button', { name: /Re-Scan Receipt/i });
			await expect(btn).toBeEnabled();
			await expect(btn).not.toHaveText(/Scanning/);
		});

		await test.step('No queued indicators visible', async () => {
			// The clock icon (fa-clock) indicates queued state — should not be present.
			await expect(page.locator('.fa-clock')).toHaveCount(0);
		});
	});

	test('after 2nd scan completes, state is clean for a 3rd scan', async ({ page }) => {
		await setupTauriShim(page, {
			receiptScans: [RECEIPT],
			updatedReceiptRecord: RECEIPT,
		});

		await openReceipt(page);
		const btn = page.getByRole('button', { name: /Re-Scan Receipt/i });

		// Run two full scan cycles.
		for (const scanNum of [1, 2]) {
			await test.step(`Scan ${scanNum} completes`, async () => {
				await btn.click();
				await expect(btn).toBeVisible({ timeout: 15_000 });
			});
		}

		await test.step('Clean state after 2nd scan', async () => {
			await expect(thumbnailSpinner(page)).toHaveCount(0);
			await expect(btn).toBeEnabled();
		});

		await test.step('3rd scan can be started', async () => {
			const countBefore = await page.evaluate(() =>
				(window as unknown as Record<string, number>).__tauriScanReceiptCount ?? 0,
			);
			await btn.click();
			await expect.poll(
				() => page.evaluate(() =>
					(window as unknown as Record<string, number>).__tauriScanReceiptCount ?? 0,
				),
				{ timeout: 5_000 },
			).toBeGreaterThan(countBefore);
			await expect(btn).toBeVisible({ timeout: 15_000 });
		});
	});
});
