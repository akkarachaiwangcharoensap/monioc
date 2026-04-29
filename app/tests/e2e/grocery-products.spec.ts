/**
 * E2E tests for the Grocery Prices feature.
 *
 * Covers three pages under the /#/products route:
 *  - ProductsPage    (/#/products)        — category tile grid
 *  - CategoryPage    (/#/products/:cat)   — product list within a category
 *  - ProductDetailPage (/#/products/:cat/:slug) — price history and comparison
 */

import { test, expect } from '@playwright/test';
import { setupTauriShim } from './helpers/tauri-shim';
import type {
  MockGroceryCategory,
  MockGroceryLocation,
  MockGroceryProduct,
  MockGroceryMetadata,
  MockGroceryPriceRecord,
} from './helpers/tauri-shim';

// ── Shared mock data ──────────────────────────────────────────────────────────

const MOCK_CATEGORIES: MockGroceryCategory[] = [
  { id: 1, name: 'produce', count: 29 },
  { id: 2, name: 'meat_and_seafood', count: 18 },
  { id: 3, name: 'dairy_and_eggs', count: 10 },
  { id: 4, name: 'pantry', count: 26 },
  { id: 5, name: 'frozen', count: 6 },
  { id: 6, name: 'bakery', count: 2 },
  { id: 7, name: 'beverages', count: 3 },
  { id: 8, name: 'snacks', count: 1 },
  { id: 9, name: 'deli_and_prepared', count: 3 },
  { id: 10, name: 'personal_care', count: 3 },
  { id: 11, name: 'baby', count: 2 },
  { id: 12, name: 'household', count: 1 },
  { id: 13, name: 'other', count: 1 },
];

const MOCK_LOCATIONS: MockGroceryLocation[] = [
  { id: 1, location: 'Canada', city: 'National', province: 'CAN' },
  { id: 2, location: 'Ontario', city: 'Toronto', province: 'ON' },
];

const MOCK_PRODUCTS: MockGroceryProduct[] = [
  { id: 1, name: 'Apples, fresh', category: 'produce', unit: 'kg' },
  { id: 2, name: 'Bananas', category: 'produce', unit: 'kg' },
  { id: 3, name: 'Broccoli', category: 'produce', unit: 'kg' },
  { id: 4, name: 'Beef, lean ground', category: 'meat_and_seafood', unit: 'kg' },
];

const MOCK_METADATA: MockGroceryMetadata = {
  totalRecords: 4,
  totalProducts: 4,
  totalLocations: 2,
  totalCategories: 13,
  dateMin: '2023-01',
  dateMax: '2023-12',
};

const MOCK_PRICES: MockGroceryPriceRecord[] = [
  {
    date: '2023-01',
    productName: 'Apples, fresh',
    category: 'produce',
    pricePerUnit: 3.45,
    unit: 'kg',
    location: 'Canada',
    city: 'National',
    province: 'CAN',
  },
  {
    date: '2023-06',
    productName: 'Apples, fresh',
    category: 'produce',
    pricePerUnit: 3.89,
    unit: 'kg',
    location: 'Canada',
    city: 'National',
    province: 'CAN',
  },
  {
    date: '2023-01',
    productName: 'Bananas',
    category: 'produce',
    pricePerUnit: 1.62,
    unit: 'kg',
    location: 'Canada',
    city: 'National',
    province: 'CAN',
  },
];

// ── Helper: default shim options ──────────────────────────────────────────────

const defaultShimOptions = {
  groceryCategories: MOCK_CATEGORIES,
  groceryLocations: MOCK_LOCATIONS,
  groceryProducts: MOCK_PRODUCTS,
  groceryPrices: MOCK_PRICES,
  groceryMetadata: MOCK_METADATA,
};

// ── Products Page ─────────────────────────────────────────────────────────────

test.describe('Products Page - /#/products', () => {
  test.beforeEach(async ({ page }) => {
    await setupTauriShim(page, defaultShimOptions);
    await page.goto('/#/products');
  });

  test('Products Page - renders the page heading and subtitle', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: 'Product Categories', level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByText('Browse and compare grocery prices across Canada'),
    ).toBeVisible();
  });

  test('Products Page - renders all 13 expected category tiles', async ({ page }) => {
    const expectedLabels = [
      'Produce',
      'Meat & Seafood',
      'Dairy & Eggs',
      'Pantry',
      'Frozen',
      'Bakery',
      'Beverages',
      'Snacks',
      'Deli & Prepared',
      'Personal Care',
      'Baby',
      'Household',
      'Other',
    ];

    for (const label of expectedLabels) {
      await expect(
        page.getByRole('heading', { name: label }).first(),
      ).toBeVisible();
    }
  });

  test('Products Page - shows product counts from mock data', async ({ page }) => {
    await test.step('Verify Produce count', async () => {
      await expect(page.getByText('29 products').first()).toBeVisible();
    });

    await test.step('Verify Meat & Seafood count', async () => {
      await expect(page.getByText('18 products').first()).toBeVisible();
    });

    await test.step('Verify single-product singular form', async () => {
      // snacks has count 1
      await expect(page.getByText('1 product').first()).toBeVisible();
    });
  });

  test('Products Page - clicking a category tile navigates to the category page', async ({ page }) => {
    const produceLink = page.getByRole('link').filter({ hasText: 'Produce' }).first();

    await test.step('Click the Produce tile', async () => {
      await produceLink.click();
    });

    await test.step('Verify URL updated to produce category route', async () => {
      await expect(page).toHaveURL(/#\/products\/produce$/);
    });
  });

  test('Products Page - shows loading state while fetching categories', async ({ page }) => {
    // The loading spinner contains "Loading categories..." text.
    // It appears briefly before the API resolves; we check it's gone
    // once the grid is visible (auto-waiting assertion).
    await expect(
      page.getByRole('heading', { name: 'Product Categories', level: 1 }),
    ).toBeVisible();
    await expect(page.getByText('Loading categories...')).not.toBeVisible();
  });
});

// ── Category Page ─────────────────────────────────────────────────────────────

test.describe('Category Page - /#/products/produce', () => {
  test.beforeEach(async ({ page }) => {
    await setupTauriShim(page, defaultShimOptions);
    await page.goto('/#/products/produce');
  });

  test('Category Page - renders the Produce heading', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: 'Produce', level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByText(/Browse all Produce products and compare prices/i),
    ).toBeVisible();
  });

  test('Category Page - renders a card for every produce product', async ({ page }) => {
    await test.step('Verify Apples, fresh card', async () => {
      await expect(
        page.getByRole('heading', { name: /apples.*fresh/i }).first(),
      ).toBeVisible();
    });

    await test.step('Verify Bananas card', async () => {
      await expect(
        page.getByRole('heading', { name: 'Bananas' }).first(),
      ).toBeVisible();
    });

    await test.step('Verify Broccoli card', async () => {
      await expect(
        page.getByRole('heading', { name: 'Broccoli' }).first(),
      ).toBeVisible();
    });
  });

  test('Category Page - shows the correct product count', async ({ page }) => {
    // 3 produce products in mock data
    await expect(page.getByText('3 products')).toBeVisible();
  });

  test('Category Page - each product card has a Compare Price link', async ({ page }) => {
    // exact: true ensures we match only the <span>Compare Price</span> leaves, not parent wrappers
    const comparePriceLabels = page.getByText('Compare Price', { exact: true });
    await expect(comparePriceLabels).toHaveCount(3);
  });

  test('Category Page - back link leads to Product Categories', async ({ page }) => {
    const backLink = page.getByRole('link', { name: /Product Categories/i });
    await expect(backLink).toBeVisible();

    await test.step('Click back link and verify navigation', async () => {
      await backLink.click();
      await expect(page).toHaveURL(/#\/products$/);
    });
  });

  test('Category Page - shows empty state when category has no products', async ({ page }) => {
    // Navigate to a category with no products in the mock data
    await page.goto('/#/products/baby');
    await expect(
      page.getByText('No products available in this category'),
    ).toBeVisible();
    await expect(page.getByText('Try browsing other categories')).toBeVisible();
  });

  test('Category Page - clicking a product card navigates to product detail', async ({ page }) => {
    const applesCard = page
      .getByRole('link')
      .filter({ hasText: /apples.*fresh/i })
      .first();

    await test.step('Click the Apples, fresh card', async () => {
      await applesCard.click();
    });

    await test.step('Verify URL updated to product detail route', async () => {
      await expect(page).toHaveURL(/#\/products\/produce\/apples-fresh$/);
    });
  });
});

// ── Product Detail Page ───────────────────────────────────────────────────────

test.describe('Product Detail Page - /#/products/produce/apples-fresh', () => {
  test.beforeEach(async ({ page }) => {
    await setupTauriShim(page, defaultShimOptions);
    await page.goto('/#/products/produce/apples-fresh');
  });

  test('Product Detail Page - renders the product name as the main heading', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /apples.*fresh/i, level: 1 }),
    ).toBeVisible();
  });

  test('Product Detail Page - renders the category badge for Produce', async ({ page }) => {
    await expect(page.getByText('Produce').first()).toBeVisible();
  });

  test('Product Detail Page - renders KG / LB unit toggle for a weight product', async ({ page }) => {
    // Apples, fresh has unit 'kg' which is a weight unit — the segmented control renders
    await expect(page.getByRole('radio', { name: /kilogram/i })).toBeVisible();
    await expect(page.getByRole('radio', { name: /pound/i })).toBeVisible();
  });

  test('Product Detail Page - renders year and location filter selectors', async ({ page }) => {
    // Year and location selectors appear once price data loads
    await expect(page.getByLabel(/year/i)).toBeVisible();
    await expect(page.getByLabel(/location/i)).toBeVisible();
  });

  test('Product Detail Page - shows "Product not found" for an unknown slug', async ({ page }) => {
    await page.goto('/#/products/produce/nonexistent-product-xyz');
    await expect(page.getByText('Product not found')).toBeVisible();
    await expect(
      page.getByText('Try searching for a different product'),
    ).toBeVisible();
  });
});
