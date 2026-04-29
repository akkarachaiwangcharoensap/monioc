/**
 * E2E tests for the SideNav sidebar navigation component.
 *
 * The sidebar is rendered on every page via AppLayout and includes:
 *  - Brand logo + `${APP_NAME}` link
 *  - Primary nav: Dashboard, Receipts, Prices, Categories
 *  - "Action" section with Scan Receipt CTA
 *  - Settings link at the bottom
 *  - Collapse / expand toggle button
 *
 * Covers:
 *  - Structure: all nav items are present
 *  - "Action" section label and Scan Receipt visibility
 *  - Navigation to each target route
 *  - Collapse hides text labels; expand restores them
 *  - Collapsed state persists across page loads (localStorage)
 */

import { test, expect } from '@playwright/test';
import { setupTauriShim } from './helpers/tauri-shim';
import { APP_NAME } from '../../src/constants';

test.describe('SideNav - structure', () => {
  test.beforeEach(async ({ page }) => {
    await setupTauriShim(page);
    await page.goto('/#/');
  });

  test('sidebar aside landmark is present', async ({ page }) => {
    await expect(
      page.getByRole('complementary', { name: 'Main navigation' }),
    ).toBeVisible();
  });

  test(`shows the brand logo area with "${APP_NAME}" link`, async ({ page }) => {
    const nav = page.getByRole('complementary', { name: 'Main navigation' });
    await expect(nav.getByRole('link', { name: `${APP_NAME} home` })).toBeVisible();
  });

  test('shows all primary nav links', async ({ page }) => {
    const nav = page.getByRole('complementary', { name: 'Main navigation' });
    await expect(nav.getByRole('link', { name: 'Dashboard' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Receipts' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Prices' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Categories' })).toBeVisible();
  });

  test('shows the "Action" section label', async ({ page }) => {
    await expect(page.getByText('Action', { exact: true })).toBeVisible();
  });

  test('shows the "Scan Receipt" CTA in the Action section', async ({ page }) => {
    const nav = page.getByRole('complementary', { name: 'Main navigation' });
    await expect(nav.getByRole('link', { name: 'Scan Receipt' })).toBeVisible();
  });

  test('shows the Settings link at the bottom', async ({ page }) => {
    const nav = page.getByRole('complementary', { name: 'Main navigation' });
    await expect(nav.getByRole('link', { name: 'Settings' })).toBeVisible();
  });

  test('collapse/expand toggle button is present', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: /Collapse navigation|Expand navigation/i }),
    ).toBeVisible();
  });
});

// ── Navigation ────────────────────────────────────────────────────────────────

test.describe('SideNav - navigation', () => {
  test.beforeEach(async ({ page }) => {
    await setupTauriShim(page);
    await page.goto('/#/');
  });

  test('"Dashboard" link is active / highlighted on the dashboard route', async ({ page }) => {
    const nav = page.getByRole('complementary', { name: 'Main navigation' });
    const dashLink = nav.getByRole('link', { name: 'Dashboard' });
    // Active NavLink gets bg-violet-600 class.
    await expect(dashLink).toHaveClass(/bg-violet-600/);
  });

  test('"Receipts" link navigates to the receipts dashboard', async ({ page }) => {
    const nav = page.getByRole('complementary', { name: 'Main navigation' });
    await nav.getByRole('link', { name: 'Receipts' }).click();
    await expect(page).toHaveURL(/#\/receipts$/);
    await expect(
      page.getByRole('heading', { name: 'Receipts', level: 1 }),
    ).toBeVisible();
  });

  test('"Prices" link navigates to Product Categories page', async ({ page }) => {
    const nav = page.getByRole('complementary', { name: 'Main navigation' });
    await nav.getByRole('link', { name: 'Prices' }).click();
    await expect(page).toHaveURL(/#\/products$/);
    await expect(
      page.getByRole('heading', { name: 'Product Categories' }),
    ).toBeVisible();
  });

  test('"Categories" link navigates to the categories page', async ({ page }) => {
    const nav = page.getByRole('complementary', { name: 'Main navigation' });
    await nav.getByRole('link', { name: 'Categories' }).click();
    await expect(page).toHaveURL(/#\/categories$/);
    await expect(
      page.getByRole('heading', { name: 'Categories', level: 1 }),
    ).toBeVisible();
  });

  test('"Scan Receipt" navigates to the receipt scanner', async ({ page }) => {
    const nav = page.getByRole('complementary', { name: 'Main navigation' });
    await nav.getByRole('link', { name: 'Scan Receipt' }).click();
    await expect(page).toHaveURL(/#\/receipt-scanner/);
  });

  test('"Settings" navigates to the settings page', async ({ page }) => {
    const nav = page.getByRole('complementary', { name: 'Main navigation' });
    await nav.getByRole('link', { name: 'Settings' }).click();
    await expect(page).toHaveURL(/#\/settings$/);
  });

  test('brand link returns to dashboard from receipts page', async ({ page }) => {
    await page.goto('/#/receipts');
    const nav = page.getByRole('complementary', { name: 'Main navigation' });
    await nav.getByRole('link', { name: `${APP_NAME} home` }).click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      /Good (morning|afternoon|evening)/,
    );
  });
});

// ── Collapse / expand ─────────────────────────────────────────────────────────

test.describe('SideNav - collapse and expand', () => {
  test.beforeEach(async ({ page }) => {
    await setupTauriShim(page);
    await page.goto('/#/');
    // Reset to expanded state after the page has loaded so that addInitScript
    // does not interfere with the persistence test (it runs on every reload).
    await page.evaluate(() => localStorage.setItem('app.nav.collapsed', '0'));
    await page.reload();
  });

  test('clicking Collapse hides text labels and the "Action" section label', async ({ page }) => {
    await page.getByRole('button', { name: 'Collapse navigation' }).click();

    // Text labels should be hidden (sidebar collapses to icon-only).
    await expect(page.getByText('Action', { exact: true })).toBeHidden();
    await expect(
      page.getByRole('button', { name: 'Expand navigation' }),
    ).toBeVisible();
  });

  test('clicking Expand restores text labels and the "Action" section label', async ({ page }) => {
    // Collapse first.
    await page.getByRole('button', { name: 'Collapse navigation' }).click();
    await expect(page.getByText('Action', { exact: true })).toBeHidden();

    // Now expand.
    await page.getByRole('button', { name: 'Expand navigation' }).click();
    await expect(page.getByText('Action', { exact: true })).toBeVisible();
  });

  test('collapsed state persists across page reloads via localStorage', async ({ page }) => {
    await page.getByRole('button', { name: 'Collapse navigation' }).click();
    await page.reload();
    // After reload the sidebar should still be collapsed.
    await expect(page.getByText('Action', { exact: true })).toBeHidden();
    await expect(
      page.getByRole('button', { name: 'Expand navigation' }),
    ).toBeVisible();
  });
});
