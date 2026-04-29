/**
 * App startup smoke tests — guard against blank/white page regressions.
 *
 * A blank page is most commonly caused by a fatal JavaScript error that
 * prevents React from mounting at all (e.g. `process is not defined`,
 * missing Tauri internals, a top-level module throw).  These tests verify
 * that the shell is visible and the main layout renders on every key route.
 *
 * Covers:
 *  - No uncaught JS errors on startup
 *  - App shell (sidebar, main landmark) is rendered
 *  - Dashboard route renders meaningful content
 *  - Every primary route mounts without a blank main area
 */

import { test, expect } from '@playwright/test';
import { setupTauriShim } from './helpers/tauri-shim';
import type { MockReceiptRecord } from './helpers/tauri-shim';
import { APP_NAME } from '../../src/constants';

// ── Shared mock data for routes that load receipt data ────────────────────────

const TODAY = new Date().toISOString().replace('T', ' ').slice(0, 19);

const MOCK_SCAN: MockReceiptRecord = {
  id: 1,
  imagePath: '/receipts/shop.jpg',
  processedImagePath: null,
  data: { rows: [{ name: 'Apples', price: 2.99, category: 'Produce' }] },
  createdAt: TODAY,
  updatedAt: TODAY,
  displayName: 'Test Shop',
  purchaseDate: TODAY.slice(0, 10),
};

// ── Helper: collect fatal page errors ────────────────────────────────────────

async function collectPageErrors(page: import('@playwright/test').Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

// ── Core startup tests ────────────────────────────────────────────────────────

test.describe('App startup — no blank page', () => {
  test('page is not blank — app shell renders on the dashboard', async ({ page }) => {
    const errors = await collectPageErrors(page);
    await setupTauriShim(page);
    await page.goto('/#/');

    // The sidebar landmark must be present — a blank page would have none.
    await expect(
      page.getByRole('complementary', { name: 'Main navigation' }),
    ).toBeVisible();

    // The main content area must contain something.
    const main = page.getByRole('main');
    await expect(main).toBeVisible();
    await expect(main).not.toBeEmpty();

    // No uncaught JS errors should have occurred.
    expect(errors, `Fatal JS errors on startup: ${errors.join('; ')}`).toHaveLength(0);
  });

  test('brand link in sidebar is visible and correct', async ({ page }) => {
    await setupTauriShim(page);
    await page.goto('/#/');
    await expect(
      page.getByRole('complementary', { name: 'Main navigation' })
        .getByRole('link', { name: `${APP_NAME} home` }),
    ).toBeVisible();
  });

  test('no uncaught errors loading the receipts dashboard route', async ({ page }) => {
    const errors = await collectPageErrors(page);
    await setupTauriShim(page, { scans: [MOCK_SCAN] });
    await page.goto('/#/receipts');

    await expect(page.getByRole('main')).toBeVisible();
    expect(errors, `Fatal JS errors on /receipts: ${errors.join('; ')}`).toHaveLength(0);
  });

  test('no uncaught errors loading the receipt scanner route', async ({ page }) => {
    const errors = await collectPageErrors(page);
    await setupTauriShim(page);
    await page.goto('/#/receipt-scanner');

    await expect(page.getByRole('main')).toBeVisible();
    expect(errors, `Fatal JS errors on /receipt-scanner: ${errors.join('; ')}`).toHaveLength(0);
  });

  test('no uncaught errors loading the settings route', async ({ page }) => {
    const errors = await collectPageErrors(page);
    await setupTauriShim(page);
    await page.goto('/#/settings');

    await expect(page.getByRole('main')).toBeVisible();
    expect(errors, `Fatal JS errors on /settings: ${errors.join('; ')}`).toHaveLength(0);
  });

  test('no uncaught errors loading the statistics route', async ({ page }) => {
    const errors = await collectPageErrors(page);
    await setupTauriShim(page, { scans: [MOCK_SCAN] });
    await page.goto('/#/statistics');

    await expect(page.getByRole('main')).toBeVisible();
    expect(errors, `Fatal JS errors on /statistics: ${errors.join('; ')}`).toHaveLength(0);
  });
});

// ── Dashboard content tests ───────────────────────────────────────────────────

test.describe('App startup — dashboard renders content', () => {
  test.beforeEach(async ({ page }) => {
    await setupTauriShim(page);
    await page.goto('/#/');
  });

  test('renders a time-based h1 greeting', async ({ page }) => {
    await expect(
      page.getByRole('heading', { level: 1 }).filter({ hasText: /Good (morning|afternoon|evening)/i }),
    ).toBeVisible();
  });

  test('renders the Scan Receipt call-to-action', async ({ page }) => {
    await expect(
      page.getByRole('link', { name: /Scan Receipt/i }).first(),
    ).toBeVisible();
  });

  test('tab bar area is rendered (title bar zone)', async ({ page }) => {
    // The tab-bar toggle button is always present in the shell.
    await expect(
      page.getByRole('button', { name: /Collapse navigation|Expand navigation/i }),
    ).toBeVisible();
  });
});

// ── Shell structure snapshot ──────────────────────────────────────────────────

test.describe('App startup — shell accessibility structure', () => {
  test('sidebar nav structure is intact on startup', async ({ page }) => {
    await setupTauriShim(page);
    await page.goto('/#/');

    const nav = page.getByRole('complementary', { name: 'Main navigation' });

    await expect(nav).toMatchAriaSnapshot(`
      - complementary "Main navigation":
        - link "${APP_NAME} home":
          - /url: "#/"
          - text: ${APP_NAME}
        - navigation:
          - link "Dashboard"
          - link "Receipts"
          - link "Prices"
          - link "Categories"
          - paragraph: Action
          - link "Scan Receipt"
        - link "Backup"
        - link "Settings"
        - button "Open tutorial"
    `);
  });
});
