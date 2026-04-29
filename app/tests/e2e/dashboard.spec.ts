/**
 * E2E tests for the main Dashboard page (route: /#/).
 *
 * Covers:
 *  - Page structure: greeting heading, Scan Receipt CTA, month label
 *  - Empty state: "No receipts yet" message with prompt
 *  - With records: four stat cards, Spending by Category section, Recent Receipts
 *  - Filter chips: "All" active by default, category chips selectable
 */

import { test, expect } from '@playwright/test';
import { setupTauriShim } from './helpers/tauri-shim';
import type { MockReceiptRecord } from './helpers/tauri-shim';

// ── Shared mock data ──────────────────────────────────────────────────────────

const TODAY = new Date().toISOString().replace('T', ' ').slice(0, 19);

const MOCK_RECORDS: MockReceiptRecord[] = [
  {
    id: 1,
    imagePath: '/receipts/superstore.jpg',
    processedImagePath: null,
    data: {
      rows: [
        { name: 'Apples', price: 4.99, category: 'Produce' },
        { name: 'Milk', price: 3.99, category: 'Dairy & Eggs' },
      ],
    },
    createdAt: TODAY,
    updatedAt: TODAY,
    displayName: 'Superstore',
  },
  {
    id: 2,
    imagePath: '/receipts/costco.jpg',
    processedImagePath: null,
    data: {
      rows: [
        { name: 'Cheese', price: 12.5, category: 'Dairy & Eggs' },
        { name: 'Salmon', price: 18.0, category: 'Meat & Seafood' },
      ],
    },
    createdAt: TODAY,
    updatedAt: TODAY,
    displayName: 'Costco',
  },
];

// ── Empty state ───────────────────────────────────────────────────────────────

test.describe('Dashboard - empty state', () => {
  test.beforeEach(async ({ page }) => {
    await setupTauriShim(page);
    await page.goto('/#/');
  });

  test('renders a time-based greeting as the h1', async ({ page }) => {
    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toBeVisible();
    await expect(h1).toContainText(/Good (morning|afternoon|evening)/);
  });

  test('renders the current month label above the greeting', async ({ page }) => {
    // e.g. "March 2026"
    const now = new Date();
    const month = now.toLocaleString('en-CA', { month: 'long', year: 'numeric' });
    await expect(page.getByText(month)).toBeVisible();
  });

  test('renders the "Scan Receipt" CTA link in the header', async ({ page }) => {
    const scanLink = page.getByRole('link', { name: /Scan Receipt/i }).first();
    await expect(scanLink).toBeVisible();
  });

  test('shows the "No receipts yet" empty-state inside the stats area', async ({ page }) => {
    await expect(page.getByText('No receipts yet')).toBeVisible();
    await expect(
      page.getByText(/Scan your first grocery receipt to unlock trends and insights/),
    ).toBeVisible();
  });

  test('shows "No recent receipts yet" in the Recent Receipts section', async ({ page }) => {
    await expect(page.getByText('No recent receipts yet')).toBeVisible();
  });

});

// ── With records ──────────────────────────────────────────────────────────────

test.describe('Dashboard - with records', () => {
  test.beforeEach(async ({ page }) => {
    await setupTauriShim(page, { receiptScans: MOCK_RECORDS });
    await page.goto('/#/');
  });

  test('displays both stat cards', async ({ page }) => {
    await expect(page.getByText('Spent this month')).toBeVisible();
    await expect(page.getByText('Total receipts')).toBeVisible();
  });

  test('shows correct total receipt count (2)', async ({ page }) => {
    // "Total receipts" stat card should show 2.
    const totalCard = page.locator('p', { hasText: 'Total receipts' }).locator('..');
    await expect(totalCard).toContainText('2');
  });

  test('Spending by Category shows category data', async ({ page }) => {
    // advancedDashboard FeatureGate is accessible under VITE_TIER_OVERRIDE=pro.
    // The SpendingChart should contain category labels from the mock data.
    await expect(page.getByText('Produce')).toBeVisible();
  });

  test('renders "Spending by Category" section', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: 'Spending by Category', level: 2 }),
    ).toBeVisible();
  });

  test('renders Recent Receipts section with mock records', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: 'Recent Receipts', level: 2 }),
    ).toBeVisible();
    await expect(page.getByText('Superstore')).toBeVisible();
    await expect(page.getByText('Costco')).toBeVisible();
  });

  test('"View all" link in Recent Receipts navigates to receipts page', async ({ page }) => {
    await page.getByRole('link', { name: /View all/i }).click();
    await expect(page).toHaveURL(/#\/receipts$/);
  });

  test('each receipt entry shows an item count', async ({ page }) => {
    await expect(page.getByText('2 items').first()).toBeVisible();
  });
});

// ── Date range filter labels ──────────────────────────────────────────────────

test.describe('Dashboard - date range filter', () => {
  test.beforeEach(async ({ page }) => {
    await setupTauriShim(page, { receiptScans: MOCK_RECORDS });
    await page.goto('/#/');
  });

  test('shows "This Month" quick-range pill in the spending chart', async ({ page }) => {
    await expect(page.getByRole('radio', { name: 'This Month' })).toBeVisible();
  });

  test('does NOT show "Last Month" quick-range pill (replaced by This Month)', async ({ page }) => {
    await expect(page.getByRole('radio', { name: 'Last Month' })).not.toBeVisible();
  });

  test('TC-E-DASH-PERSIST-1: "This Month" pill is selected by default', async ({ page }) => {
    const thisMonthPill = page.getByRole('radio', { name: 'This Month' });
    await expect(thisMonthPill).toBeVisible();
    await expect(thisMonthPill).toBeChecked();
  });

  test('TC-E-DASH-PERSIST-2: selecting "Last Week" persists after tab switch and return', async ({ page }) => {
    // Select Last Week.
    await page.getByRole('radio', { name: 'Last Week' }).click();
    await expect(page.getByRole('radio', { name: 'Last Week' })).toBeChecked();

    // Navigate away to Receipts page.
    await page.getByRole('link', { name: 'Receipts' }).first().click();
    await expect(page).toHaveURL(/#\/receipts/);

    // Navigate back to Dashboard.
    await page.getByRole('link', { name: 'Dashboard' }).click();
    await expect(page).toHaveURL(/#\//);

    // "Last Week" should still be the selected pill.
    await expect(page.getByRole('radio', { name: 'Last Week' })).toBeChecked();
  });
});
