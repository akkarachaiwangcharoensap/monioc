/**
 * E2E tests for the Image Library inbox on the Scan Receipts page.
 *
 * Covers:
 *  - Empty library → pick-zone CTA shown
 *  - Pre-populated inbox → cards rendered with filenames and "Scan All" button
 *  - In-flight placeholder (id < 0) → shimmer card, no "Scan All" button
 *  - Linked images (receiptId != null) → excluded from inbox
 *  - Mixed linked + unlinked → only unlinked card shown
 *  - Remove from inbox → card disappears, pick-zone CTA returns
 *
 * Note: The native file picker and actual Rust IPC cannot run in browser mode.
 * These tests use the `imageLibrary` shim option to pre-seed the mock
 * `get_image_library` response so the context loads a known state on mount.
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

/** Navigate to the Scan Receipts page with a given library state. */
async function gotoWithLibrary(
  page: Parameters<typeof setupTauriShim>[0],
  imageLibrary: MockImageLibraryEntry[],
): Promise<void> {
  await setupTauriShim(page, { imageLibrary });
  await page.goto('/#/receipt-scanner');
  // Dismiss the first-launch tutorial modal if it appears.
  // In a test environment the localStorage key should suppress it, but on some
  // Playwright setups the modal still renders on the first render cycle.
  const tutorialDialog = page.getByRole('dialog', { name: 'App tutorial' });
  const appeared = await tutorialDialog.isVisible().catch(() => false);
  if (appeared) {
    await page.getByRole('button', { name: /skip/i }).click();
    await tutorialDialog.waitFor({ state: 'hidden' });
  }
}

// ── Test data ─────────────────────────────────────────────────────────────────

const ENTRY_A = makeEntry({ id: 1, filePath: '/photos/receipt-jan.jpg' });
const ENTRY_B = makeEntry({ id: 2, filePath: '/photos/receipt-feb.jpg' });
const ENTRY_C_LINKED = makeEntry({ id: 3, filePath: '/photos/receipt-mar.jpg', receiptId: 42 });
const ENTRY_UPLOADING = makeEntry({ id: -1001, filePath: '/photos/receipt-uploading.jpg' });

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Scan Receipts page — Image Library inbox', () => {

  test.describe('empty library state', () => {
    test.beforeEach(async ({ page }) => {
      await gotoWithLibrary(page, []);
    });

    test('shows the pick-zone CTA when library is empty', async ({ page }) => {
      await expect(page.getByText('Pick Receipt Images')).toBeVisible();
      await expect(page.getByText(/drag & drop images here/i)).toBeVisible();
    });

    test('does not show any inbox cards', async ({ page }) => {
      await expect(page.getByRole('status')).toHaveCount(0);
    });

    test('does not show the "Scan All" button', async ({ page }) => {
      await expect(page.getByRole('button', { name: 'Scan all images' })).toHaveCount(0);
    });
  });

  test.describe('pre-populated inbox', () => {
    test.beforeEach(async ({ page }) => {
      await gotoWithLibrary(page, [ENTRY_A, ENTRY_B]);
    });

    test('shows the inbox counter', async ({ page }) => {
      await expect(page.getByText('2 images ready')).toBeVisible();
    });

    test('renders a card for each unlinked image with filename', async ({ page }) => {
      await expect(page.getByTitle('/photos/receipt-jan.jpg')).toBeVisible();
      await expect(page.getByTitle('/photos/receipt-feb.jpg')).toBeVisible();
    });

    test('shows two inbox cards', async ({ page }) => {
      await expect(page.getByRole('status')).toHaveCount(2);
    });

    test('shows the "Scan All" button', async ({ page }) => {
      await expect(page.getByRole('button', { name: 'Scan all images' })).toBeVisible();
    });

    test('shows "Add more images" instead of the pick-zone CTA', async ({ page }) => {
      await expect(page.getByText('Pick Receipt Images')).toHaveCount(0);
      await expect(page.getByText('Add more images')).toBeVisible();
    });

    test('each card has a "Scan" action button', async ({ page }) => {
      await expect(page.getByRole('button', { name: 'Scan this image' })).toHaveCount(2);
    });
  });

  test.describe('in-flight upload placeholder (id < 0)', () => {
    test.beforeEach(async ({ page }) => {
      await gotoWithLibrary(page, [ENTRY_UPLOADING]);
    });

    test('renders a card for the uploading image', async ({ page }) => {
      await expect(page.getByRole('status')).toHaveCount(1);
      await expect(page.getByTitle('/photos/receipt-uploading.jpg')).toBeVisible();
    });

    test('placeholder card does not have a "Scan" button', async ({ page }) => {
      // Uploading entries (id < 0) show a spinner, not a Scan button.
      await expect(page.getByRole('button', { name: 'Scan this image' })).toHaveCount(0);
    });

    test('does not show the "Scan All" button while all images are in-flight', async ({ page }) => {
      // hasUnscanedImages excludes in-flight entries, so Scan All is hidden.
      await expect(page.getByRole('button', { name: 'Scan all images' })).toHaveCount(0);
    });
  });

  test.describe('linked images excluded from inbox', () => {
    test('does not show a card for an image already linked to a receipt', async ({ page }) => {
      await gotoWithLibrary(page, [ENTRY_C_LINKED]);
      await expect(page.getByRole('status')).toHaveCount(0);
      await expect(page.getByText('Pick Receipt Images')).toBeVisible();
    });

    test('shows only the unlinked card when library has mixed entries', async ({ page }) => {
      await gotoWithLibrary(page, [ENTRY_A, ENTRY_C_LINKED]);
      await expect(page.getByRole('status')).toHaveCount(1);
      await expect(page.getByText('1 image ready')).toBeVisible();
      await expect(page.getByTitle('/photos/receipt-jan.jpg')).toBeVisible();
      await expect(page.getByTitle('/photos/receipt-mar.jpg')).toHaveCount(0);
    });
  });

  test.describe('remove from inbox', () => {
    test('clicking remove hides the card and returns pick-zone when inbox empties', async ({ page }) => {
      await gotoWithLibrary(page, [ENTRY_A]);

      // Card is present initially.
      await expect(page.getByRole('status')).toHaveCount(1);

      // Click the remove button on the card.
      await page.getByRole('button', { name: 'Remove from inbox' }).click();

      // Inbox is now empty — pick-zone CTA should appear.
      await expect(page.getByRole('status')).toHaveCount(0);
      await expect(page.getByText('Pick Receipt Images')).toBeVisible();
    });

    test('removing one card from a two-image inbox leaves one card', async ({ page }) => {
      await gotoWithLibrary(page, [ENTRY_A, ENTRY_B]);

      // Remove the first card.
      await page.getByRole('button', { name: 'Remove from inbox' }).first().click();

      await expect(page.getByRole('status')).toHaveCount(1);
      await expect(page.getByText('1 image ready')).toBeVisible();
    });
  });
});
