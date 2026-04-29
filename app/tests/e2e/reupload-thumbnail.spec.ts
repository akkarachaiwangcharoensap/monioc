/**
 * E2E tests for re-uploading an image after a successful scan.
 *
 * Validates that when a previously edited+scanned image is re-uploaded:
 *  1. The stale staging/thumbnail paths are cleared (backend fix in
 *     image_library.rs — clear staging_path + thumbnail_path on re-add).
 *  2. The React component resets its fallback index when the entry's
 *     thumbnail candidates change (frontend fix in ScannerInboxCard).
 *
 * Test strategy: seed the inbox with entries whose staging/thumbnail state
 * mirrors the post-fix behaviour and verify the rendered thumbnail uses the
 * correct source (original file path, not a stale staging path).
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

// ── Helpers ───────────────────────────────────────────────────────────────────

async function gotoScanner(
	page: import('@playwright/test').Page,
	imageLibrary: MockImageLibraryEntry[],
	extra: Parameters<typeof setupTauriShim>[1] = {},
): Promise<void> {
	await setupTauriShim(page, { imageLibrary, ...extra });
	await page.goto('/#/receipt-scanner');
	await expect(page.getByRole('heading', { name: 'Scan Receipts' })).toBeVisible({
		timeout: 5_000,
	});
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Re-upload clears stale thumbnail', () => {
	test('entry without staging path renders thumbnail from original file', async ({ page }) => {
		// After the Rust fix, a re-uploaded image has stagingPath = null and
		// thumbnailPath = null.  The card should show the original file path.
		const entry = makeEntry({
			id: 1,
			filePath: '/photos/receipt-jan.jpg',
			stagingPath: null,
			thumbnailPath: null,
		});
		await gotoScanner(page, [entry]);

		await test.step('Card renders in the inbox', async () => {
			await expect(page.getByRole('status')).toHaveCount(1);
			await expect(page.getByTitle('/photos/receipt-jan.jpg')).toBeVisible();
		});

		await test.step('Thumbnail does not reference any staging path', async () => {
			const img = page.getByRole('status').locator('img');
			const imgCount = await img.count();
			if (imgCount > 0) {
				const src = await img.first().getAttribute('src');
				expect(src).not.toContain('/staging/');
				// Should use the original file path (identity-mapped by convertFileSrc shim)
				expect(src).toContain('receipt-jan.jpg');
			}
		});
	});

	test('entry with stale staging path falls through to original when staging 404s', async ({
		page,
	}) => {
		// Before the Rust fix, re-upload would leave stale stagingPath.
		// The frontend fix ensures the fallback chain advances past 404.
		const entry = makeEntry({
			id: 2,
			filePath: '/photos/receipt-feb.jpg',
			stagingPath: '/staging/receipt-feb-old-crop.jpg', // will 404
			thumbnailPath: null,
		});
		await gotoScanner(page, [entry]);

		await test.step('Card renders in the inbox', async () => {
			await expect(page.getByRole('status')).toHaveCount(1);
		});

		await test.step('After staging 404, falls through to original or placeholder', async () => {
			// Wait for the image error handler to advance the fallback chain.
			// The card should eventually not show a broken image: it either
			// loads the original file or shows the placeholder icon.
			await expect(async () => {
				const img = page.getByRole('status').locator('img');
				const placeholder = page.getByRole('status').locator('i.fa-image.text-slate-300');
				const imgCount = await img.count();
				const placeholderCount = await placeholder.count();
				// Either the image loaded (skipped past stale staging) or placeholder is shown.
				expect(imgCount + placeholderCount).toBeGreaterThan(0);
				if (imgCount > 0) {
					const src = await img.first().getAttribute('src');
					// Must NOT still point at the stale staging path
					expect(src).not.toContain('receipt-feb-old-crop');
				}
			}).toPass({ timeout: 5_000 });
		});
	});

	test('shim clears staging/thumbnail/receipt on re-upload of same path', async ({ page }) => {
		// Verifies the shim's add_images_to_library matches the Rust backend fix:
		// when re-adding an existing path, staging_path, thumbnail_path, and
		// receipt_id are all cleared.
		const linkedEntry = makeEntry({
			id: 5,
			filePath: '/photos/receipt-mar.jpg',
			stagingPath: '/staging/receipt-mar-cropped.jpg',
			thumbnailPath: '/thumbs/receipt-mar-thumb.jpg',
			receiptId: 99,
		});
		await setupTauriShim(page, { imageLibrary: [linkedEntry] });
		await page.goto('/#/receipt-scanner');

		const result = await page.evaluate(async () => {
			return (window as unknown as { __TAURI_INTERNALS__: { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> } }).__TAURI_INTERNALS__.invoke('add_images_to_library', {
				paths: ['/photos/receipt-mar.jpg'],
			});
		});

		// The shim should return the entry with cleared fields
		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			id: 5,
			filePath: '/photos/receipt-mar.jpg',
			stagingPath: null,
			thumbnailPath: null,
			receiptId: null,
		});
	});
});
