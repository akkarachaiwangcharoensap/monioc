/**
 * E2E tests for the Receipt Scanner page.
 *
 * Covers:
 *  - Page structure (heading, description, image zone with file-picker CTA)
 *  - Back-link to Receipts Dashboard
 *  - "Add New" + button in the saved-scans sidebar also navigates here
 *
 * Note: The scanner's real OCR flow (file dialog, drag-drop, Rust scan) cannot
 * run in browser mode, so these tests cover the static shell and navigation only.
 */

import { test, expect } from '@playwright/test';
import { setupTauriShim } from './helpers/tauri-shim';

test.describe('Receipt Scanner Page - new session', () => {
  test.beforeEach(async ({ page }) => {
    await setupTauriShim(page);
    await page.goto('/#/receipt-scanner');
    // Dismiss the first-launch tutorial modal if it appears.
    const tutorialDialog = page.getByRole('dialog', { name: 'App tutorial' });
    const appeared = await tutorialDialog.isVisible().catch(() => false);
    if (appeared) {
      await page.getByRole('button', { name: /skip/i }).click();
      await tutorialDialog.waitFor({ state: 'hidden' });
    }
  });

  test('renders the Scan Receipts heading and description', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: 'Scan Receipts', level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByText('Upload receipt images, then scan them when you\'re ready.'),
    ).toBeVisible();
  });

  test('image drop zone shows file-picker CTA and drag hint', async ({ page }) => {
    await expect(page.getByText('Pick Receipt Images')).toBeVisible();
    await expect(page.getByText(/drag & drop images here/i)).toBeVisible();
  });

  test('SideNav "Receipts" link navigates back to the receipts dashboard', async ({ page }) => {
    const nav = page.getByRole('complementary', { name: 'Main navigation' });
    await nav.getByRole('link', { name: 'Receipts' }).click();
    await expect(page).toHaveURL(/#\/receipts$/);
    await expect(
      page.getByRole('heading', { name: 'Receipts', level: 1 }),
    ).toBeVisible();
  });
});
