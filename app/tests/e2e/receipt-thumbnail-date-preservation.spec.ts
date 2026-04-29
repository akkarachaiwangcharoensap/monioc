/**
 * E2E test — Bug 1 regression: thumbnail switch must preserve purchaseDate and createdAt.
 *
 * Bug: After editing a receipt row (which triggers `applyEditableData`), the
 * `setQueueScanResults` call was constructing a new object without the
 * `purchaseDate` / `createdAt` fields.  When the user then switched to another
 * thumbnail and back, `useScanReceipt` read the now-missing values from
 * `queueScanResults` and:
 *  - `purchaseDate` showed as empty
 *  - `createdAt` became falsy → the entire "Scanned" section disappeared
 *
 * Fix: `applyEditableData` (and `onJsonChange`) now spread the existing
 * `purchaseDate` / `createdAt` from the current `queueScanResults` entry into
 * the updated object.
 *
 * Test steps:
 *  1. Open two receipts in the editor (both have purchaseDate + createdAt).
 *  2. Confirm "Scanned" label and purchase-date clear icon (×) are visible.
 *  3. Edit a row name → triggers applyEditableData.
 *  4. Switch to receipt 2 thumbnail.
 *  5. Switch back to receipt 1 thumbnail.
 *  6. Assert "Scanned" is still visible and × icon is still present.
 */

import { test, expect } from '@playwright/test';
import { setupTauriShim } from './helpers/tauri-shim';
import type { MockReceiptRecord } from './helpers/tauri-shim';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const RECEIPT_A: MockReceiptRecord = {
  id: 1,
  imagePath: '/receipts/store-a.jpg',
  processedImagePath: null,
  data: { rows: [{ name: 'Milk', price: 3.99 }, { name: 'Bread', price: 2.49 }] },
  createdAt: '2026-01-15 10:00:00',
  updatedAt: '2026-01-15 10:00:00',
  displayName: 'Store A',
  purchaseDate: '2026-01-10',
};

const RECEIPT_B: MockReceiptRecord = {
  id: 2,
  imagePath: '/receipts/store-b.jpg',
  processedImagePath: null,
  data: { rows: [{ name: 'Eggs', price: 5.49 }] },
  createdAt: '2026-02-20 14:00:00',
  updatedAt: '2026-02-20 14:00:00',
  displayName: 'Store B',
  purchaseDate: '2026-02-18',
};

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Bug 1 regression — thumbnail switch preserves purchaseDate + createdAt', () => {
  test.beforeEach(async ({ page }) => {
    await setupTauriShim(page, {
      receiptScans: [RECEIPT_A, RECEIPT_B],
      // Ensure auto-save returns the correct record with dates intact.
      updatedReceiptRecord: RECEIPT_A,
    });
  });

  test('purchaseDate and createdAt survive applyEditableData + thumbnail switch', async ({ page }) => {
    await page.goto('/#/receipts');
    await expect(page.getByText('Store A')).toBeVisible({ timeout: 5_000 });

    // ── Step 1: open both receipts in the editor ──────────────────────────
    await test.step('select both receipts and open editor', async () => {
      await page.getByRole('button', { name: 'Select' }).click();
      await page.getByText('Store A').first().click();
      await page.getByText('Store B').first().click();
      await page.getByRole('button', { name: /View 2/i }).click();
      await expect(page).toHaveURL(/#\/receipts\/editor/);
      // Wait for the thumbnail strip to appear — this confirms loadedReceiptIds
      // has propagated and the editor is past the empty-state ReceiptPickerGrid.
      // Use :not([aria-label]) to target the chip button, not the remove (×) button
      // (each thumbnail wrapper has both a chip button and an aria-labelled remove button).
      const chipButtons = page.locator('div.relative.w-16.h-16 > button:not([aria-label])');
      await expect(chipButtons.first()).toBeVisible({ timeout: 8_000 });
    });

    // ── Step 2: verify initial state — receipt A is active ────────────────
    await test.step('initial state: Scanned label and × icon are visible', async () => {
      // Wait for spreadsheet data to load (row 0 cell 0 has the first item name)
      await expect(page.locator('[data-cell-row="0"][data-cell-col="0"] input').first())
        .not.toHaveValue('', { timeout: 5_000 });

      // "Scanned" section is conditionally rendered only when createdAt is truthy
      await expect(page.getByText('Scanned').first()).toBeVisible();

      // purchaseDate is set → DatePicker shows the clear (×) icon
      await expect(page.locator('main .fa-times').first()).toBeVisible();
    });

    // ── Step 3: edit a row name to trigger applyEditableData ─────────────
    await test.step('edit first row name to trigger applyEditableData', async () => {
      const nameCell = page.locator('[data-cell-row="0"][data-cell-col="0"]').first();
      // Double-click enters edit mode
      await nameCell.dblclick();
      const nameInput = nameCell.locator('input');
      await nameInput.fill('Whole Milk');
      // Tab triggers blur → flushPending → onRowsChange (= applyEditableData) fires
      await nameInput.press('Tab');
    });

    // ── Step 4: switch to receipt B thumbnail ────────────────────────────
    await test.step('switch to receipt B thumbnail', async () => {
      // Chip buttons: direct child buttons of .relative.w-16.h-16 WITHOUT aria-label.
      // Each thumbnail has a chip button (no aria-label) and a remove button
      // (aria-label="Remove receipt from editor"). nth(0) = Store A, nth(1) = Store B.
      const chipButtons = page.locator('div.relative.w-16.h-16 > button:not([aria-label])');
      await chipButtons.nth(1).click();
      // Wait for Store B's data to load (cells are <input> elements, use toHaveValue)
      await expect(page.locator('[data-cell-row="0"][data-cell-col="0"] input').first())
        .toHaveValue('Eggs', { timeout: 5_000 });
    });

    // ── Step 5: switch back to receipt A thumbnail ────────────────────────
    await test.step('switch back to receipt A thumbnail', async () => {
      const chipButtons = page.locator('div.relative.w-16.h-16 > button:not([aria-label])');
      await chipButtons.nth(0).click();
      // Wait for Store A's data to reload (cells are <input> elements, use toHaveValue)
      await expect(page.locator('[data-cell-row="0"][data-cell-col="0"] input').first())
        .toHaveValue('Whole Milk', { timeout: 5_000 });
    });

    // ── Step 6: verify dates are preserved ───────────────────────────────
    await test.step('regression check: Scanned label still visible (createdAt preserved)', async () => {
      // If createdAt was dropped, this entire section would not be rendered.
      await expect(page.getByText('Scanned').first()).toBeVisible();
    });

    await test.step('regression check: × clear icon still visible (purchaseDate preserved)', async () => {
      // The × icon only renders when purchaseDate is set.  If it was dropped
      // during the thumbnail switch, this locator would have count 0.
      await expect(page.locator('main .fa-times').first()).toBeVisible();
    });
  });
});
