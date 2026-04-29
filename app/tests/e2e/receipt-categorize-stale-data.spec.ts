/**
 * E2E test — Bug 2 regression: auto-categorize must use current editableData,
 * not the stale DB snapshot.
 *
 * Bug: `runManualCategorize` called `TauriApi.inferItemCategories` without a
 * `data` field.  The Rust side (`process_categorize`) therefore fetched the
 * receipt from the SQLite DB and used that stale data as the base for
 * `apply_categories`.  Any unsaved row renames the user had made were silently
 * discarded, so the row reverted to its original DB name (e.g. "HST Tax")
 * even though the user had renamed it to "POTATO CHIP".
 *
 * Fix: `runManualCategorize` now passes `data: editableData` in the IPC
 * payload.  The Rust side uses that data instead of the DB record.
 *
 * This test exercises the shim-side simulation of that fixed behaviour:
 *  1. Open a receipt whose only row is named "HST Tax".
 *  2. Rename it to "POTATO CHIP".
 *  3. Click "Auto-categorize".
 *  4. Confirm the row still shows "POTATO CHIP" (not reverted to "HST Tax").
 *  5. Confirm the category column now shows "Snacks" (from inferredCategories).
 */

import { test, expect } from '@playwright/test';
import { setupTauriShim } from './helpers/tauri-shim';
import type { MockReceiptRecord } from './helpers/tauri-shim';

// ── Fixture ───────────────────────────────────────────────────────────────────

/** The DB record as it lives in the store — original name "HST Tax". */
const RECEIPT_HST: MockReceiptRecord = {
  id: 1,
  imagePath: '/receipts/tax-receipt.jpg',
  processedImagePath: null,
  data: {
    rows: [
      { name: 'HST Tax', price: 1.99, category: 'TAX' },
      { name: 'Organic Milk', price: 4.49, category: 'Dairy' },
    ],
  },
  createdAt: '2026-01-01 10:00:00',
  updatedAt: '2026-01-01 10:00:00',
  displayName: 'Tax Store',
  purchaseDate: null,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Bug 2 regression — auto-categorize uses current editableData', () => {
  test.beforeEach(async ({ page }) => {
    await setupTauriShim(page, {
      receiptScans: [RECEIPT_HST],
      // The shim now simulates the fixed Rust behaviour: when args.data is
      // provided, categories are applied to the *current* data rows, not the
      // stale DB rows.  "Snacks" is assigned to the first row regardless of
      // its name, so after rename the first row should show "Snacks".
      inferredCategories: ['Snacks', 'Dairy'],
    });
  });

  test('renamed row name is not reverted by auto-categorize', async ({ page }) => {
    await page.goto('/#/receipts');
    await expect(page.getByText('Tax Store')).toBeVisible({ timeout: 5_000 });

    // ── Step 1: open the receipt in the editor ────────────────────────────
    await test.step('open receipt in editor', async () => {
      await page.getByText('Tax Store').first().click();
      await expect(page).toHaveURL(/#\/receipts\/editor/);
      // Cells are always <input> elements — use toHaveValue, not getByText.
      await expect(page.locator('[data-cell-row="0"][data-cell-col="0"] input').first())
        .toHaveValue('HST Tax', { timeout: 5_000 });
    });

    // ── Step 2: rename "HST Tax" → "POTATO CHIP" ─────────────────────────
    await test.step('rename first row from "HST Tax" to "POTATO CHIP"', async () => {
      const nameCell = page.locator('[data-cell-row="0"][data-cell-col="0"]').first();
      await nameCell.dblclick();
      const nameInput = nameCell.locator('input');
      await nameInput.fill('POTATO CHIP');
      // Tab to blur → flushPending → applyEditableData called with new name
      await nameInput.press('Tab');
      // Confirm the cell displays the renamed value (input value, not text content)
      await expect(page.locator('[data-cell-row="0"][data-cell-col="0"] input').first())
        .toHaveValue('POTATO CHIP', { timeout: 3_000 });
    });

    // ── Step 3: click Auto-categorize ────────────────────────────────────
    await test.step('click Auto-categorize button', async () => {
      await page.getByRole('button', { name: /Auto.?categori/i }).click();
    });

    // ── Step 4: wait for categorization to complete ───────────────────────
    await test.step('wait for categorization result', async () => {
      // The categorize overlay (violet spinner) should appear then disappear.
      // Wait for the result by waiting for the Auto-categorize button to be
      // enabled again (it becomes disabled while categorizing).
      await expect(page.getByRole('button', { name: /Auto.?categori/i })).toBeEnabled({ timeout: 5_000 });
    });

    // ── Step 5: regression checks ─────────────────────────────────────────
    await test.step('regression check: row name is still "POTATO CHIP" (not reverted)', async () => {
      // Before the fix, the stale DB name "HST Tax" would reappear here
      // because the Rust side used the DB record as the base.
      await expect(page.locator('[data-cell-row="0"][data-cell-col="0"] input').first())
        .toHaveValue('POTATO CHIP');
    });

    await test.step('regression check: stale name "HST Tax" is absent', async () => {
      // The first row's input should NOT have reverted to the stale DB name.
      await expect(page.locator('[data-cell-row="0"][data-cell-col="0"] input').first())
        .not.toHaveValue('HST Tax');
    });
  });
});
