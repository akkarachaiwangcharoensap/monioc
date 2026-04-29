import { test, expect } from '@playwright/test';
import { setupTauriShim } from './helpers/tauri-shim';
import type { MockReceiptRecord } from './helpers/tauri-shim';

// ── Shared fixture data ───────────────────────────────────────────────────────

const MOCK_RECORDS: MockReceiptRecord[] = [
  {
    id: 1,
    imagePath: '/home/user/receipts/superstore-jan.jpg',
    processedImagePath: null,
    data: { rows: [{ name: 'Milk', price: 3.99 }, { name: 'Eggs', price: 5.49 }] },
    createdAt: '2025-01-15 10:30:00',
    updatedAt: '2025-01-15 10:30:00',
    displayName: 'Superstore Jan',
  },
  {
    id: 2,
    imagePath: '/home/user/receipts/costco-feb.jpg',
    processedImagePath: null,
    data: {
      rows: [
        { name: 'Butter', price: 7.99 },
        { name: 'Cheese', price: 12.5 },
        { name: 'Salmon', price: 18.0 },
      ],
    },
    createdAt: '2025-02-20 14:00:00',
    updatedAt: '2025-02-20 14:00:00',
    displayName: null,
  },
];

// ── Empty state ───────────────────────────────────────────────────────────────

test.describe('Receipts Dashboard - empty state', () => {
  test.beforeEach(async ({ page }) => {
    await setupTauriShim(page);
  });

  test('navigates from the SideNav to the receipts page and renders empty state', async ({ page }) => {
    await page.goto('/#/');

    // Navigate via SideNav "Receipts" link (the new dashboard no longer has feature cards).
    const nav = page.getByRole('complementary', { name: 'Main navigation' });
    await nav.getByRole('link', { name: 'Receipts' }).click();

    await expect(page).toHaveURL(/#\/receipts$/);
    await expect(page.getByRole('heading', { name: 'Receipts', level: 1 })).toBeVisible();
    await expect(page.getByText('No matching receipts found.')).toBeVisible();
  });

  test('"Scan your first receipt" button navigates to scanner', async ({ page }) => {
    await page.goto('/#/receipts');

    await page.getByRole('button', { name: /Scan your first receipt/i }).click();
    await expect(page).toHaveURL(/#\/receipt-scanner/);
  });
});

// ── With records ──────────────────────────────────────────────────────────────

test.describe('Receipts Dashboard - with records', () => {
  test.beforeEach(async ({ page }) => {
    await setupTauriShim(page, { receiptScans: MOCK_RECORDS });
  });

  test('renders receipt cards with display name and item count', async ({ page }) => {
    await page.goto('/#/receipts');

    await test.step('Verify first record', async () => {
      // Record 1 has an explicit displayName.
      await expect(page.getByText('Superstore Jan')).toBeVisible();
      await expect(page.getByText('2 items').first()).toBeVisible();
    });

    await test.step('Verify second record (name derived from path)', async () => {
      // Record 2 has no displayName; getReceiptFallbackName converts
      // "costco-feb.jpg" → "costco feb" (hyphens → spaces, no extension).
      await expect(page.getByText('costco feb')).toBeVisible();
      await expect(page.getByText('3 items')).toBeVisible();
    });
  });

  test('thumbnail image uses non-stretched object-contain style', async ({ page }) => {
    await page.goto('/#/receipts');
    const thumb = page.locator('img[alt="Receipt preview"]').first();
    await expect(thumb).toBeVisible();
    await expect(thumb).toHaveClass(/object-contain/);
  });

  test('rename pencil is shown beside the receipt name', async ({ page }) => {
    await page.goto('/#/receipts');
    const firstCard = page.locator('div.group.relative').filter({ hasText: 'Superstore Jan' }).first();
    await expect(firstCard.getByRole('button', { name: 'Rename receipt' })).toBeVisible();
  });

  test('shows correct result count', async ({ page }) => {
    await page.goto('/#/receipts');
    await expect(page.getByText('2 results')).toBeVisible();
  });

  test('search by display name shows only matching receipts', async ({ page }) => {
    await page.goto('/#/receipts');

    await test.step('Filter to records matching "Superstore"', async () => {
      await page.getByPlaceholder('Search by name or item…').fill('Superstore');
      await expect(page.getByText('Superstore Jan')).toBeVisible();
      await expect(page.getByText('1 result')).toBeVisible();
      // Record 2 should not be visible.
      await expect(page.getByText('costco feb')).not.toBeVisible();
    });
  });

  test('search with no matches shows empty-state message', async ({ page }) => {
    await page.goto('/#/receipts');
    await page.getByPlaceholder('Search by name or item…').fill('xyz-no-such-item');
    await expect(page.getByText('No matching receipts found.')).toBeVisible();
    await expect(page.getByText('0 results')).toBeVisible();
  });

  test('clicking a receipt navigates to the editor', async ({ page }) => {
    await page.goto('/#/receipts');
    await page.getByText('Superstore Jan').first().click();
    await expect(page).toHaveURL(/#\/receipts\/editor/);
  });

  test('enters and exits select mode', async ({ page }) => {
    await page.goto('/#/receipts');

    await test.step('Enter select mode', async () => {
      await page.getByRole('button', { name: 'Select' }).click();
      await expect(page.getByRole('button', { name: 'Done' })).toBeVisible();
      // Per-card checkbox buttons appear.
      await expect(
        page.getByRole('button', { name: /select receipt/i }).first(),
      ).toBeVisible();
    });

    await test.step('Exit select mode', async () => {
      await page.getByRole('button', { name: 'Done' }).click();
      await expect(page.getByRole('button', { name: 'Select' })).toBeVisible();
      // Checkbox buttons are gone.
      await expect(
        page.getByRole('button', { name: /select receipt/i }),
      ).not.toBeVisible();
    });
  });

  test('selecting multiple receipts and viewing navigates to the editor', async ({ page }) => {
    await page.goto('/#/receipts');
    await page.getByRole('button', { name: 'Select' }).click();

    const card1 = page.getByText('Superstore Jan').first();
    const card2 = page.getByText('costco feb').first();
    await card1.click();
    await card2.click();

    await page.getByRole('button', { name: /View 2/i }).click();
    await expect(page).toHaveURL(/#\/receipts\/editor/);
  });

  test('"Add New" button navigates to receipt scanner', async ({ page }) => {
    await page.goto('/#/receipts');
    await page.getByRole('button', { name: /Add New/i }).click();
    await expect(page).toHaveURL(/#\/receipt-scanner/);
  });

  test('SideNav "Dashboard" link returns to the main dashboard', async ({ page }) => {
    await page.goto('/#/receipts');
    const nav = page.getByRole('complementary', { name: 'Main navigation' });
    await nav.getByRole('link', { name: 'Dashboard' }).click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Good (morning|afternoon|evening)/);
  });
});
