/**
 * E2E tests for the main dashboard page and cross-page navigation.
 *
 * These tests verify that:
 *  - The dashboard renders its key sections and heading.
 *  - The SideNav brand link returns to the dashboard from sub-pages.
 *  - Bug fixes for back-navigation (no spurious new tabs) and link navigation.
 */

import { test, expect } from '@playwright/test';
import { setupTauriShim } from './helpers/tauri-shim';
import type { MockReceiptRecord } from './helpers/tauri-shim';
import { APP_NAME } from '../../src/constants';

// ── Shared mock data ──────────────────────────────────────────────────────────

const THIS_MONTH = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-10 10:00:00`;
})();

const RECEIPTS_WITH_CATEGORIES: MockReceiptRecord[] = [
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
    createdAt: THIS_MONTH,
    updatedAt: THIS_MONTH,
    displayName: 'Superstore',
  },
];

// ── Original navigation tests ─────────────────────────────────────────────────

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await setupTauriShim(page);
    await page.goto('/#/');
  });

  test('renders a time-based greeting heading (h1)', async ({ page }) => {
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toBeVisible();
    await expect(heading).toContainText(/Good (morning|afternoon|evening)/);
  });

  test('renders a "Scan Receipt" CTA in the dashboard header', async ({ page }) => {
    await expect(
      page.getByRole('link', { name: /Scan Receipt/i }).first(),
    ).toBeVisible();
  });

  test('shows "No receipts yet" when there are no records', async ({ page }) => {
    await expect(page.getByText('No receipts yet')).toBeVisible();
  });
});

test.describe('SideNav brand link navigation', () => {
  test.beforeEach(async ({ page }) => {
    await setupTauriShim(page);
  });

  test('brand link on receipts page returns to dashboard', async ({ page }) => {
    await page.goto('/#/receipts');
    const nav = page.getByRole('complementary', { name: 'Main navigation' });
    await nav.getByRole('link', { name: `${APP_NAME} home` }).click();
    await expect(page).toHaveURL(/#\/$/);
    // Greeting heading confirms we are on the dashboard.
    await expect(
      page.getByRole('heading', { level: 1 }),
    ).toContainText(/Good (morning|afternoon|evening)/);
  });

  test('brand link on settings page returns to dashboard', async ({ page }) => {
    await page.goto('/#/settings');
    const nav = page.getByRole('complementary', { name: 'Main navigation' });
    await nav.getByRole('link', { name: `${APP_NAME} home` }).click();
    await expect(page).toHaveURL(/#\/$/);
  });
});

test.describe('Products page', () => {
  test.beforeEach(async ({ page }) => {
    await setupTauriShim(page);
  });

  test('loads products page with category heading and back link', async ({ page }) => {
    await page.goto('/#/products');
    await expect(page).toHaveURL(/#\/products$/);
    await expect(page.getByRole('heading', { name: 'Product Categories' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Home' })).toBeVisible();
  });
});

// ── Bug-fix regression tests ──────────────────────────────────────────────────

test.describe('TC-BACK: Back button does not create a new tab (Bug 1 regression)', () => {
  test.beforeEach(async ({ page }) => {
    await setupTauriShim(page, { receiptScans: RECEIPTS_WITH_CATEGORIES });
    await page.goto('/#/');
  });

  test('TC-BACK-1: navigating via SideNav and pressing back stays in the same tab', async ({ page }) => {
    // Initial state: 1 tab on Dashboard
    await test.step('verify one tab open', async () => {
      await expect(page.getByRole('tab')).toHaveCount(1);
    });

    await test.step('navigate to Statistics via SideNav link', async () => {
      await page.getByRole('link', { name: /Statistics/i }).click();
      await expect(page).toHaveURL(/#\/statistics/);
    });

    await test.step('still only one tab after SideNav navigation', async () => {
      await expect(page.getByRole('tab')).toHaveCount(1);
    });

    await test.step('click back button', async () => {
      await page.getByRole('button', { name: 'Go back' }).click();
      await expect(page).toHaveURL(/#\//);
    });

    await test.step('still only one tab after back navigation', async () => {
      await expect(page.getByRole('tab')).toHaveCount(1);
    });
  });

  test('TC-BACK-2: back button does not create a new tab after replaceCurrentTab navigation', async ({ page }) => {
    // Navigate via receipts (SideNav replaceCurrentTab) then press back
    await test.step('navigate to Receipts via SideNav', async () => {
      await page.getByRole('link', { name: /^Receipts$/i }).first().click();
      await expect(page).toHaveURL(/#\/receipts/);
      await expect(page.getByRole('tab')).toHaveCount(1);
    });

    await test.step('back arrow returns to Dashboard', async () => {
      await page.getByRole('button', { name: 'Go back' }).click();
      await expect(page).toHaveURL(/#\//);
    });

    await test.step('still exactly one tab', async () => {
      await expect(page.getByRole('tab')).toHaveCount(1);
    });
  });
});

test.describe('TC-LINK: Category links replace the current tab (Bug 3 regression)', () => {
  test.beforeEach(async ({ page }) => {
    await setupTauriShim(page, { receiptScans: RECEIPTS_WITH_CATEGORIES });
    // Start at Dashboard and navigate to Statistics via SideNav (replaceCurrentTab)
    // so only 1 tab is open when we reach the Statistics page.
    await page.goto('/#/');
    await page.getByRole('link', { name: /Statistics/i }).click();
    await expect(page).toHaveURL(/#\/statistics/);
  });

  test('TC-LINK-1: clicking a category row on Statistics replaces current tab', async ({ page }) => {
    // Dashboard → Statistics via SideNav: still 1 tab
    await expect(page.getByRole('tab')).toHaveCount(1);

    // Record count before clicking
    const initialTabCount = await page.getByRole('tab').count();

    await test.step('click the first category link', async () => {
      // Statistics category rows are clickable text elements (NavButton).
      // Use the same pattern as statistics.spec.ts.
      await page.getByText('Produce').click();
    });

    await test.step('navigated to category detail page', async () => {
      await expect(page).toHaveURL(/#\/statistics\//);
    });

    await test.step('tab count is unchanged — no new tab was opened', async () => {
      await expect(page.getByRole('tab')).toHaveCount(initialTabCount);
    });
  });
});

