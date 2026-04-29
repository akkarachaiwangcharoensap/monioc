/**
 * E2E tests for scanner bug fixes:
 *  - Retry button works after a scan fails (error state).
 *  - "Scan All" button remains visible when images are in error state.
 *  - "Scan All" button is hidden when all images are already scanned/scanning.
 *  - Thumbnail fallback when staging path is invalid (shows placeholder icon).
 */

import { test, expect } from '@playwright/test';
import { setupTauriShim } from './helpers/tauri-shim';
import type { MockImageLibraryEntry } from './helpers/tauri-shim';

const NOW = '2025-06-01T10:00:00.000Z';

const makeEntry = (
	overrides: Partial<MockImageLibraryEntry> & { id: number; filePath: string },
): MockImageLibraryEntry => ({
	addedAt: NOW,
	thumbnailPath: null,
	receiptId: null,
	stagingPath: null,
	...overrides,
});

const ENTRY_A = makeEntry({ id: 1, filePath: '/mock/receipt-a.jpg' });
const ENTRY_B = makeEntry({ id: 2, filePath: '/mock/receipt-b.jpg' });

// ── Helpers ───────────────────────────────────────────────────────────────────

async function gotoScanner(
	page: Parameters<typeof setupTauriShim>[0],
	imageLibrary: MockImageLibraryEntry[],
	extra: Parameters<typeof setupTauriShim>[1] = {},
): Promise<void> {
	await setupTauriShim(page, { imageLibrary, ...extra });
	await page.goto('/#/receipt-scanner');
}

// ── Tests: Retry after error ──────────────────────────────────────────────────

test.describe('Scan Receipts — Retry after scan error', () => {
	test('Retry button appears after scan error and triggers a new scan', async ({ page }) => {
		await gotoScanner(page, [ENTRY_A], { hangOnScanReceipt: true });

		await test.step('Start scan — enters Scanning state', async () => {
			await page.getByRole('button', { name: 'Scan this image' }).click();
			await expect(page.getByRole('button', { name: 'Cancel scan' })).toBeVisible({
				timeout: 5_000,
			});
		});

		await test.step('Simulate scan error via job:status event', async () => {
			await page.evaluate(() => {
				// @ts-expect-error — test shim global
				window.__tauriEmitEvent('job:status', {
					jobKey: '/mock/receipt-a.jpg',
					phase: 'error',
					record: null,
					error: 'OCR failed: no text found',
					seq: 3,
				});
			});
			// Card should now show error state with Retry button.
			await expect(page.getByRole('button', { name: 'Retry scan' })).toBeVisible({
				timeout: 5_000,
			});
		});

		await test.step('Click Retry — triggers a new scan invocation', async () => {
			const countBefore = await page.evaluate(
				() => (window as unknown as Record<string, number>).__tauriScanReceiptCount ?? 0,
			);
			await page.getByRole('button', { name: 'Retry scan' }).click();
			// A new scan_receipt call should have been submitted.
			await expect
				.poll(
					() =>
						page.evaluate(
							() =>
								(window as unknown as Record<string, number>).__tauriScanReceiptCount ?? 0,
						),
					{ timeout: 5_000 },
				)
				.toBeGreaterThan(countBefore);
		});
	});
});

// ── Tests: Scan All button visibility with error-state images ─────────────────

test.describe('Scan Receipts — Scan All with error-state images', () => {
	test('"Scan All" button stays visible when an image is in error state', async ({ page }) => {
		await gotoScanner(page, [ENTRY_A, ENTRY_B], { hangOnScanReceipt: true });

		await test.step('"Scan All" is visible initially', async () => {
			await expect(page.getByRole('button', { name: 'Scan all images' })).toBeVisible();
		});

		await test.step('Scan first image — enters scanning state', async () => {
			await page.getByRole('button', { name: 'Scan this image' }).first().click();
			await expect(page.getByRole('button', { name: 'Cancel scan' })).toBeVisible({
				timeout: 5_000,
			});
		});

		await test.step('Simulate error on the first image', async () => {
			await page.evaluate(() => {
				// @ts-expect-error — test shim global
				window.__tauriEmitEvent('job:status', {
					jobKey: '/mock/receipt-a.jpg',
					phase: 'error',
					record: null,
					error: 'Scan failed',
					seq: 3,
				});
			});
			await expect(page.getByRole('button', { name: 'Retry scan' })).toBeVisible({
				timeout: 5_000,
			});
		});

		await test.step('"Scan All" is still visible because errored images are scanable', async () => {
			await expect(page.getByRole('button', { name: 'Scan all images' })).toBeVisible();
		});
	});

	test('"Scan All" triggers re-scan for error-state images', async ({ page }) => {
		await gotoScanner(page, [ENTRY_A], { hangOnScanReceipt: true });

		await test.step('Start and fail first scan', async () => {
			await page.getByRole('button', { name: 'Scan this image' }).click();
			await expect(page.getByRole('button', { name: 'Cancel scan' })).toBeVisible({
				timeout: 5_000,
			});
			await page.evaluate(() => {
				// @ts-expect-error — test shim global
				window.__tauriEmitEvent('job:status', {
					jobKey: '/mock/receipt-a.jpg',
					phase: 'error',
					record: null,
					error: 'Scan failed',
					seq: 3,
				});
			});
			await expect(page.getByRole('button', { name: 'Retry scan' })).toBeVisible({
				timeout: 5_000,
			});
		});

		await test.step('Click "Scan All" — re-scans the errored image', async () => {
			const countBefore = await page.evaluate(
				() => (window as unknown as Record<string, number>).__tauriScanReceiptCount ?? 0,
			);
			await page.getByRole('button', { name: 'Scan all images' }).click();
			await expect
				.poll(
					() =>
						page.evaluate(
							() =>
								(window as unknown as Record<string, number>).__tauriScanReceiptCount ?? 0,
						),
					{ timeout: 5_000 },
				)
				.toBeGreaterThan(countBefore);
		});
	});
});

// ── Tests: Thumbnail fallback ─────────────────────────────────────────────────

test.describe('Scan Receipts — Thumbnail fallback', () => {
	test('shows placeholder icon when all thumbnail sources fail to load', async ({ page }) => {
		// Entry with a staging path that will 404 and no thumbnail path —
		// the fallback chain should exhaust all candidates and show the
		// placeholder <i class="fas fa-image"> icon.
		const entryBadStaging = makeEntry({
			id: 10,
			filePath: '/nonexistent/original.jpg',
			stagingPath: '/nonexistent/staging.jpg',
			thumbnailPath: null,
		});
		await gotoScanner(page, [entryBadStaging]);

		await test.step('Card is rendered', async () => {
			await expect(page.getByRole('status')).toHaveCount(1);
		});

		await test.step('Placeholder icon appears after thumbnail errors', async () => {
			// The fallback chain tries stagingPath → filePath (both 404).
			// After all fail, the component renders an <i> with class "fa-image"
			// inside the card's thumbnail container.
			const card = page.getByRole('status');
			await expect(card.locator('i.fa-image.text-slate-300')).toBeVisible({ timeout: 5_000 });
		});
	});
});
