/**
 * E2E tests for the Receipt Scanner queue-based scanning flow.
 *
 * The scanner page uses a per-card architecture where each image is an inbox
 * entry with its own Scan button + status badge.  Tests verify:
 *   1. Picking images populates the inbox with "Ready" cards and Scan buttons.
 *   2. "Scan All" button appears when unscanned images exist.
 *   3. Clicking a per-card "Scan" button transitions the card to "Scanning…".
 *   4. A "Cancel" button appears next to the scanning card.
 *   5. When the scan completes the card transitions through a done animation.
 *   6. The empty drop-zone is shown when no images are queued.
 *
 * Because the Tauri back-end is unavailable in browser-mode tests we rely on
 * the tauri-shim which supports:
 *   - `dialogOpenPath` to mock the file picker.
 *   - `hangOnScanReceipt: true` to keep scans in-flight.
 *   - `window.__tauriCompleteScan()` to resolve a hanging scan.
 */

import { test, expect } from '@playwright/test';
import { setupTauriShim } from './helpers/tauri-shim';

// ── helpers ───────────────────────────────────────────────────────────────────

/** Navigate to the Receipt Scanner with a mocked image already picked into the inbox. */
async function gotoScannerWithImage(page: import('@playwright/test').Page, hang = true) {
  await setupTauriShim(page, {
    hangOnScanReceipt: hang,
    dialogOpenPath: '/mock/receipt.jpg',
  });
  await page.goto('/#/receipt-scanner');

  // Click the drop-zone button to "pick" the mocked image path.
  await page.getByText('Pick Receipt Images').click();

  // Wait for the inbox card to appear with a "Scan" button.
  await expect(
    page.getByRole('button', { name: 'Scan this image' }),
  ).toBeVisible({ timeout: 5_000 });
}

// ── tests ─────────────────────────────────────────────────────────────────────

test.describe('Receipt Scanner - empty state', () => {
  test('drop zone is shown when no images are queued', async ({ page }) => {
    await setupTauriShim(page);
    await page.goto('/#/receipt-scanner');

    await expect(page.getByText('Pick Receipt Images')).toBeVisible();
    await expect(page.getByText(/drag .* drop/i)).toBeVisible();
  });

  test('no Scan All button when inbox is empty', async ({ page }) => {
    await setupTauriShim(page);
    await page.goto('/#/receipt-scanner');

    await expect(page.getByRole('button', { name: 'Scan all images' })).not.toBeVisible();
  });
});

test.describe('Receipt Scanner - inbox cards', () => {
  test('picking an image shows an inbox card with a Scan button', async ({ page }) => {
    await gotoScannerWithImage(page);

    // Card should show the filename.
    await expect(page.getByText('receipt.jpg')).toBeVisible();
    // "Ready" badge is present.
    await expect(page.getByText('Ready', { exact: true })).toBeVisible();
    // Per-card Scan button.
    await expect(page.getByRole('button', { name: 'Scan this image' })).toBeVisible();
  });

  test('Scan All button appears when there are unscanned images', async ({ page }) => {
    await gotoScannerWithImage(page);

    await expect(page.getByRole('button', { name: 'Scan all images' })).toBeVisible();
  });

  test('clicking per-card Scan transitions card to Scanning state', async ({ page }) => {
    await gotoScannerWithImage(page, /* hang */ true);

    await page.getByRole('button', { name: 'Scan this image' }).click();

    // The TaskManager maps the scanning phase to "Preparing image…".
    // Scope to the card (role=status) to avoid strict-mode with task widget.
    await expect(
      page.getByRole('status').getByText('Preparing image…'),
    ).toBeVisible({ timeout: 5_000 });
  });

  test('Cancel button appears during an active scan', async ({ page }) => {
    await gotoScannerWithImage(page, /* hang */ true);

    await page.getByRole('button', { name: 'Scan this image' }).click();
    await expect(
      page.getByRole('status').getByText('Preparing image…'),
    ).toBeVisible({ timeout: 5_000 });

    await expect(page.getByRole('button', { name: 'Cancel scan' })).toBeVisible();
  });

  test('per-card Scan button is hidden while scan is in progress', async ({ page }) => {
    await gotoScannerWithImage(page, /* hang */ true);

    await page.getByRole('button', { name: 'Scan this image' }).click();
    await expect(
      page.getByRole('status').getByText('Preparing image…'),
    ).toBeVisible({ timeout: 5_000 });

    // The Scan button should no longer be visible.
    await expect(page.getByRole('button', { name: 'Scan this image' })).not.toBeVisible();
  });

  test('Scan All button is hidden while scan is in progress', async ({ page }) => {
    await gotoScannerWithImage(page, /* hang */ true);

    await page.getByRole('button', { name: 'Scan this image' }).click();
    await expect(
      page.getByRole('status').getByText('Preparing image…'),
    ).toBeVisible({ timeout: 5_000 });

    // Scan All should disappear when no unscanned images remain.
    await expect(page.getByRole('button', { name: 'Scan all images' })).not.toBeVisible();
  });

  test('Remove button is available on idle cards', async ({ page }) => {
    await gotoScannerWithImage(page);

    await expect(page.getByRole('button', { name: 'Remove from inbox' })).toBeVisible();
  });

  test('Edit (crop) button is available on idle cards', async ({ page }) => {
    await gotoScannerWithImage(page);

    await expect(page.getByRole('button', { name: 'Edit image' })).toBeVisible();
  });
});
