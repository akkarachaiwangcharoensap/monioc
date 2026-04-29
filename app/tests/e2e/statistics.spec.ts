/**
 * E2E tests for the Statistics page and Category Detail page.
 *
 * Covers:
 *  - Statistics page structure: heading, granularity toggle, period navigation
 *  - Statistics page: KPI cards render, category breakdown rows
 *  - Statistics page: clicking a category row navigates to Category Detail
 *  - Category Detail page: heading, KPI strip (no "Avg. per item"), no "Top Items"
 *  - Category Detail page: sort pills render and change active state
 */

import { test, expect } from '@playwright/test';
import { setupTauriShim } from './helpers/tauri-shim';
import type { MockReceiptRecord } from './helpers/tauri-shim';

// ── Shared mock data ──────────────────────────────────────────────────────────

const THIS_MONTH = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-10 10:00:00`;
})();

const MOCK_RECORDS: MockReceiptRecord[] = [
  {
    id: 1,
    imagePath: '/receipts/superstore.jpg',
    processedImagePath: null,
    data: {
      rows: [
        { name: 'Apples', price: 4.99, category: 'Vegetable' },
        { name: 'Bananas', price: 1.99, category: 'Vegetable' },
        { name: 'Milk', price: 3.99, category: 'Dairy & Eggs' },
      ],
    },
    createdAt: THIS_MONTH,
    updatedAt: THIS_MONTH,
    displayName: 'Superstore',
  },
  {
    id: 2,
    imagePath: '/receipts/costco.jpg',
    processedImagePath: null,
    data: {
      rows: [
        { name: 'Cheese', price: 12.5, category: 'Dairy & Eggs' },
        { name: 'Chicken', price: 18.0, category: 'Meat' },
      ],
    },
    createdAt: THIS_MONTH,
    updatedAt: THIS_MONTH,
    displayName: 'Costco',
  },
];

// ── Statistics page ───────────────────────────────────────────────────────────

test.describe('Statistics page', () => {
  test.beforeEach(async ({ page }) => {
    await setupTauriShim(page, { receiptScans: MOCK_RECORDS });
    await page.goto('/#/statistics');
  });

  test('renders the Statistics heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Statistics' })).toBeVisible();
  });

  test('shows the three granularity toggle buttons', async ({ page }) => {
    await expect(page.getByRole('radio', { name: 'Month granularity' })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Week granularity' })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Year granularity' })).toBeVisible();
  });

  test('Year is selected by default', async ({ page }) => {
    const yearBtn = page.getByRole('radio', { name: 'Year granularity' });
    await expect(yearBtn).toHaveAttribute('aria-checked', 'true');
  });

  test('switching granularity to Week updates the active pill', async ({ page }) => {
    await test.step('click Week button', async () => {
      await page.getByRole('radio', { name: 'Week granularity' }).click();
    });
    await test.step('Week pill becomes active, Month becomes inactive', async () => {
      await expect(page.getByRole('radio', { name: 'Week granularity' })).toHaveAttribute('aria-checked', 'true');
      await expect(page.getByRole('radio', { name: 'Month granularity' })).toHaveAttribute('aria-checked', 'false');
    });
  });

  test('period navigation: previous button is enabled, next button is disabled by default', async ({ page }) => {
    // Both nav buttons have aria-labels "Go to <period_label>"
    const prevBtn = page.getByRole('button', { name: /^Go to /i }).first();
    const nextBtn = page.getByRole('button', { name: /^Go to /i }).last();
    await expect(nextBtn).toBeDisabled();
    await expect(prevBtn).toBeEnabled();
  });

  test('period navigation: prev button shows previous period label', async ({ page }) => {
    // Default granularity is 'year'; prev button should display the previous year
    const prevYear = String(new Date().getFullYear() - 1);
    const prevBtn = page.getByRole('button', { name: `Go to ${prevYear}` });
    await expect(prevBtn).toBeVisible();
    await expect(prevBtn).toContainText(prevYear);
  });

  test('renders at least one category row in Spending by Category', async ({ page }) => {
    const section = page.getByText('Spending by Category').locator('..');
    await expect(section).toBeVisible();
    // At least one category label should appear
    await expect(page.getByText('Vegetable')).toBeVisible();
  });

  test('clicking a category row navigates to Category Detail', async ({ page }) => {
    await test.step('click Vegetable row', async () => {
      await page.getByText('Vegetable').click();
    });
    await test.step('URL changes to category detail route', async () => {
      await expect(page).toHaveURL(/#\/statistics\/category\/Vegetable/);
    });
  });

  test('category drill-down and back preserves selected period state', async ({ page }) => {
    await page.getByRole('radio', { name: 'Month granularity' }).click();
    await expect(page.evaluate(() => localStorage.getItem('app.statistics.periodOffset'))).resolves.toBe('0');

    await page.getByText('Vegetable').click();
    await expect(page).toHaveURL(/#\/statistics\/category\/Vegetable/);

    await page.getByRole('button', { name: /Statistics/i }).click();
    await expect(page).toHaveURL(/#\/statistics/);
    await expect(page.getByRole('radio', { name: 'Month granularity' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.evaluate(() => localStorage.getItem('app.statistics.periodOffset'))).resolves.toBe('0');
  });
});

// ── Category Detail page ──────────────────────────────────────────────────────

test.describe('Category Detail page', () => {
  test.beforeEach(async ({ page }) => {
    await setupTauriShim(page, { receiptScans: MOCK_RECORDS });
    await page.goto('/#/statistics/category/Vegetable');
  });

  test('renders the category name as heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Vegetable' })).toBeVisible();
  });

  test('KPI strip shows Period Spend card', async ({ page }) => {
    await expect(page.getByText('Period Spend')).toBeVisible();
    await expect(page.getByRole('main').getByText('Receipts')).toBeVisible();
    await expect(page.getByText('Items', { exact: true })).toBeVisible();
  });

  test('does NOT show Avg. per item KPI', async ({ page }) => {
    await expect(page.getByText('Avg. per item')).not.toBeVisible();
  });

  test('does NOT show a Top Items section', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Top Items' })).not.toBeVisible();
  });

  test('Purchases section is visible with items', async ({ page }) => {
    // Heading includes the period label, so match a prefix
    await expect(page.getByRole('heading', { name: /Purchases in/i })).toBeVisible();
    await expect(page.getByText('Apples')).toBeVisible();
    await expect(page.getByText('Bananas')).toBeVisible();
  });

  test('sort pills are visible in All Purchases', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Newest' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Price ↓' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Name Z-A' })).toBeVisible();
  });

  test('Newest sort pill is active by default', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Newest' })).toHaveClass(/bg-violet-600/);
  });

  test('date and price buttons toggle label direction', async ({ page }) => {
    await test.step('date button toggles Newest -> Oldest', async () => {
      await page.getByRole('button', { name: 'Newest' }).click();
      await expect(page.getByRole('button', { name: 'Oldest' })).toBeVisible();
    });
    await test.step('price button toggles Price ↓ -> Price ↑', async () => {
      await page.getByRole('button', { name: 'Price ↓' }).click();
      await expect(page.getByRole('button', { name: 'Price ↑' })).toBeVisible();
    });
    await test.step('name button remains independently toggleable', async () => {
      await page.getByRole('button', { name: 'Name Z-A' }).click();
      await expect(page.getByRole('button', { name: 'Name A-Z' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Name A-Z' })).toHaveClass(/bg-violet-600/);
    });
  });

  test('back button navigates to Statistics', async ({ page }) => {
    await test.step('click Statistics breadcrumb', async () => {
      await page.getByRole('button', { name: /Statistics/i }).click();
    });
    await test.step('URL returns to statistics route', async () => {
      await expect(page).toHaveURL(/#\/statistics/);
    });
  });

  test('shows granularity toggle with Year / Month / Week buttons', async ({ page }) => {
    await expect(page.getByRole('radio', { name: 'Year granularity' })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Month granularity' })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Week granularity' })).toBeVisible();
  });

  test('Year granularity button is active by default', async ({ page }) => {
    await expect(page.getByRole('radio', { name: 'Year granularity' })).toHaveAttribute('aria-checked', 'true');
  });

  test('switching granularity to Month updates the active pill', async ({ page }) => {
    await test.step('click Month pill', async () => {
      await page.getByRole('radio', { name: 'Month granularity' }).click();
    });
    await test.step('Month is now active', async () => {
      await expect(page.getByRole('radio', { name: 'Month granularity' })).toHaveAttribute('aria-checked', 'true');
    });
    await test.step('Year is no longer active', async () => {
      await expect(page.getByRole('radio', { name: 'Year granularity' })).toHaveAttribute('aria-checked', 'false');
    });
  });

  test('period navigation: previous button is visible and enabled', async ({ page }) => {
    const prevBtn = page.getByRole('button', { name: /Go to/i }).first();
    await expect(prevBtn).toBeVisible();
    await expect(prevBtn).not.toBeDisabled();
  });

  test('period navigation: next button is disabled when at current period', async ({ page }) => {
    const nextBtn = page.getByRole('button', { name: /Go to/i }).last();
    await expect(nextBtn).toBeDisabled();
  });
});

// ── Statistics page: category search ─────────────────────────────────────────

test.describe('Statistics page - category search', () => {
  test.beforeEach(async ({ page }) => {
    await setupTauriShim(page, { receiptScans: MOCK_RECORDS });
    await page.goto('/#/statistics');
  });

  test('category search input is visible', async ({ page }) => {
    const searchInput = page.getByLabel(/search categories/i);
    await expect(searchInput).toBeVisible();
  });

  test('typing in the search input filters category rows', async ({ page }) => {
    await test.step('type "vegetable" in the search box', async () => {
      await page.getByLabel(/search categories/i).fill('vegetable');
    });
    await test.step('Vegetable row is still visible', async () => {
      await expect(page.getByText('Vegetable')).toBeVisible();
    });
    await test.step('Dairy & Eggs row is hidden', async () => {
      await expect(page.getByText('Dairy & Eggs')).not.toBeVisible();
    });
  });

  test('clearing the search shows all category rows again', async ({ page }) => {
    const input = page.getByLabel(/search categories/i);
    await input.fill('vegetable');
    await input.fill('');
    await expect(page.getByText('Vegetable')).toBeVisible();
    await expect(page.getByText('Dairy & Eggs')).toBeVisible();
  });
});

// ── Category Detail – custom date range from URL params (Bug 4 fix) ───────────

const RECENT_DATE = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-15 09:00:00`;
})();
const OLD_DATE = '2020-03-01 09:00:00';

const RANGE_RECORDS: MockReceiptRecord[] = [
  {
    id: 20,
    imagePath: null,
    processedImagePath: null,
    data: { rows: [{ name: 'Fresh Broccoli', price: 3.99, category: 'Vegetable' }] },
    createdAt: RECENT_DATE,
    updatedAt: RECENT_DATE,
    purchaseDate: RECENT_DATE.slice(0, 10),
    displayName: 'Store A',
  },
  {
    id: 21,
    imagePath: null,
    processedImagePath: null,
    data: { rows: [{ name: 'Old Carrots', price: 1.49, category: 'Vegetable' }] },
    createdAt: OLD_DATE,
    updatedAt: OLD_DATE,
    purchaseDate: OLD_DATE.slice(0, 10),
    displayName: 'Store B',
  },
];

test.describe('Category Detail - custom date range from URL params', () => {
  // from/to range: 6 months ago → today (covers RECENT_DATE, excludes OLD_DATE).
  const fromTs = (() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 6);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  })();
  const toTs = Date.now();

  test.beforeEach(async ({ page }) => {
    await setupTauriShim(page, { receiptScans: RANGE_RECORDS });
    await page.goto(`/#/statistics/category/Vegetable?from=${fromTs}&to=${toTs}`);
  });

  test('only shows purchases within the custom date range', async ({ page }) => {
    await test.step('in-range item (Fresh Broccoli) is visible', async () => {
      await expect(page.getByText('Fresh Broccoli')).toBeVisible();
    });
    await test.step('out-of-range item (Old Carrots) is not visible', async () => {
      await expect(page.getByText('Old Carrots')).not.toBeVisible();
    });
  });

  test('shows custom range badge with "Clear filter" button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Clear filter/i })).toBeVisible();
  });

  test('list heading says "Purchases —" (not "Purchases in") when range active', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Purchases —/i })).toBeVisible();
  });

  test('"Clear filter" navigates to category page without URL params', async ({ page }) => {
    await page.getByRole('button', { name: /Clear filter/i }).click();
    await expect(page).toHaveURL(/#\/statistics\/category\/Vegetable$/);
  });

  test('without URL params only purchases in current period are visible', async ({ page }) => {
    await page.goto('/#/statistics/category/Vegetable');
    // Fresh Broccoli is from the current year — visible in default year view.
    await expect(page.getByText('Fresh Broccoli')).toBeVisible();
    // Old Carrots is from 2020 — outside the current year, must not appear.
    await expect(page.getByText('Old Carrots')).not.toBeVisible();
  });
});

// ── Category Detail – granularity-based purchase filtering ───────────────────

const GRAN_YEAR = new Date().getFullYear();
const GRAN_MONTH = String(new Date().getMonth() + 1).padStart(2, '0');
const GRAN_CURRENT_MONTH_DATE = `${GRAN_YEAR}-${GRAN_MONTH}-10 09:00:00`;
const GRAN_LAST_YEAR_DATE = `${GRAN_YEAR - 1}-06-01 09:00:00`;

const GRAN_RECORDS: MockReceiptRecord[] = [
  {
    id: 50,
    imagePath: null,
    processedImagePath: null,
    data: { rows: [{ name: 'Current Month Item', price: 5.00, category: 'Fruit' }] },
    createdAt: GRAN_CURRENT_MONTH_DATE,
    updatedAt: GRAN_CURRENT_MONTH_DATE,
    purchaseDate: GRAN_CURRENT_MONTH_DATE.slice(0, 10),
    displayName: 'Store A',
  },
  {
    id: 51,
    imagePath: null,
    processedImagePath: null,
    data: { rows: [{ name: 'Last Year Item', price: 8.00, category: 'Fruit' }] },
    createdAt: GRAN_LAST_YEAR_DATE,
    updatedAt: GRAN_LAST_YEAR_DATE,
    purchaseDate: GRAN_LAST_YEAR_DATE.slice(0, 10),
    displayName: 'Store B',
  },
];

test.describe('Category Detail – granularity-based purchase filtering', () => {
  test.beforeEach(async ({ page }) => {
    await setupTauriShim(page, { receiptScans: GRAN_RECORDS });
    await page.goto('/#/statistics/category/Fruit');
  });

  test('Year view (default) shows current year items and hides last year items', async ({ page }) => {
    await test.step('current year item is visible', async () => {
      await expect(page.getByText('Current Month Item')).toBeVisible();
    });
    await test.step('last year item is not visible', async () => {
      await expect(page.getByText('Last Year Item')).not.toBeVisible();
    });
  });

  test('switching to Month granularity shows only current month purchases', async ({ page }) => {
    await test.step('switch to Month', async () => {
      await page.getByRole('radio', { name: 'Month granularity' }).click();
    });
    await test.step('current month item is visible', async () => {
      // Day 10 of current month is within the current month period.
      await expect(page.getByText('Current Month Item')).toBeVisible();
    });
    await test.step('last year item remains hidden', async () => {
      await expect(page.getByText('Last Year Item')).not.toBeVisible();
    });
  });

  test('navigating to previous year shows previous year items and hides current year items', async ({ page }) => {
    const prevYear = String(GRAN_YEAR - 1);
    await test.step('click previous period button', async () => {
      await page.getByRole('button', { name: `Go to ${prevYear}` }).click();
    });
    await test.step('last year item is now visible', async () => {
      await expect(page.getByText('Last Year Item')).toBeVisible();
    });
    await test.step('current year item is hidden', async () => {
      await expect(page.getByText('Current Month Item')).not.toBeVisible();
    });
  });
});

// ── Category Detail – sort button functionality ───────────────────────────────

const SORT_YEAR = new Date().getFullYear();
const SORT_RECORDS: MockReceiptRecord[] = [
  {
    id: 60,
    imagePath: null,
    processedImagePath: null,
    data: { rows: [{ name: 'Zucchini', price: 3.00, category: 'Produce' }] },
    createdAt: `${SORT_YEAR}-01-10 09:00:00`,
    updatedAt: `${SORT_YEAR}-01-10 09:00:00`,
    purchaseDate: `${SORT_YEAR}-01-10`,
    displayName: 'Store A',
  },
  {
    id: 61,
    imagePath: null,
    processedImagePath: null,
    data: { rows: [{ name: 'Apple', price: 7.00, category: 'Produce' }] },
    createdAt: `${SORT_YEAR}-03-10 09:00:00`,
    updatedAt: `${SORT_YEAR}-03-10 09:00:00`,
    purchaseDate: `${SORT_YEAR}-03-10`,
    displayName: 'Store B',
  },
  {
    id: 62,
    imagePath: null,
    processedImagePath: null,
    data: { rows: [{ name: 'Mango', price: 1.50, category: 'Produce' }] },
    createdAt: `${SORT_YEAR}-02-10 09:00:00`,
    updatedAt: `${SORT_YEAR}-02-10 09:00:00`,
    purchaseDate: `${SORT_YEAR}-02-10`,
    displayName: 'Store C',
  },
];

/** Returns the given names in the order they appear in the page body text. */
async function getTextOrder(page: import('@playwright/test').Page, names: string[]): Promise<string[]> {
  const bodyText = (await page.locator('body').textContent()) ?? '';
  return names
    .map((name) => ({ name, index: bodyText.indexOf(name) }))
    .filter(({ index }) => index !== -1)
    .sort((a, b) => a.index - b.index)
    .map(({ name }) => name);
}

test.describe('Category Detail – sort button functionality', () => {
  test.beforeEach(async ({ page }) => {
    await setupTauriShim(page, { receiptScans: SORT_RECORDS });
    await page.goto('/#/statistics/category/Produce');
  });

  test('default Newest sort shows most recent purchase first', async ({ page }) => {
    await expect(page.getByText('Apple')).toBeVisible();
    const order = await getTextOrder(page, ['Apple', 'Mango', 'Zucchini']);
    // Mar > Feb > Jan → Apple, Mango, Zucchini
    expect(order).toEqual(['Apple', 'Mango', 'Zucchini']);
  });

  test('clicking Newest toggles to Oldest — oldest purchase appears first', async ({ page }) => {
    await test.step('click Newest button', async () => {
      await page.getByRole('button', { name: 'Newest' }).click();
      await expect(page.getByRole('button', { name: 'Oldest' })).toBeVisible();
    });
    await test.step('verify oldest-first order', async () => {
      const order = await getTextOrder(page, ['Apple', 'Mango', 'Zucchini']);
      // Jan < Feb < Mar → Zucchini, Mango, Apple
      expect(order).toEqual(['Zucchini', 'Mango', 'Apple']);
    });
  });

  test('Price ↓ button activates price-asc (low→high)', async ({ page }) => {
    await test.step('click Price ↓', async () => {
      // Clicking toggles price-desc → price-asc and activates sortBy=price.
      await page.getByRole('button', { name: 'Price ↓' }).click();
      await expect(page.getByRole('button', { name: 'Price ↑' })).toBeVisible();
    });
    await test.step('verify low-to-high order', async () => {
      const order = await getTextOrder(page, ['Apple', 'Mango', 'Zucchini']);
      // $1.50 < $3 < $7 → Mango, Zucchini, Apple
      expect(order).toEqual(['Mango', 'Zucchini', 'Apple']);
    });
  });

  test('clicking Price ↑ toggles to price-desc (high→low)', async ({ page }) => {
    await test.step('click Price ↓ then Price ↑', async () => {
      await page.getByRole('button', { name: 'Price ↓' }).click();
      await expect(page.getByRole('button', { name: 'Price ↑' })).toBeVisible();
      await page.getByRole('button', { name: 'Price ↑' }).click();
      await expect(page.getByRole('button', { name: 'Price ↓' })).toBeVisible();
    });
    await test.step('verify high-to-low order', async () => {
      const order = await getTextOrder(page, ['Apple', 'Mango', 'Zucchini']);
      // $7 > $3 > $1.50 → Apple, Zucchini, Mango
      expect(order).toEqual(['Apple', 'Zucchini', 'Mango']);
    });
  });
});
