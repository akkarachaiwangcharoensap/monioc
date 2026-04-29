/**
 * E2E tests verifying that category colours from `list_categories` (Tauri DB)
 * flow correctly through the `useCategories` hook into the CategoriesPage UI.
 *
 * Architecture notes:
 *  • `invoke('list_categories')` returns `{ name, color }[]` from the shim.
 *  • `useCategories` loads these on mount, calling `setCategoryColors(colors)`.
 *  • When `rows.length > 0` the hook uses DB colours; it does NOT fall back to
 *    localStorage / built-in defaults.
 *  • Each category row renders a `<div aria-label="Category row {name}">` with
 *    `style.borderLeftColor` set to the category colour — this is ALWAYS present
 *    regardless of the `customizationLocked` (subscription) state.
 *  • The colour swatch `<label title="Change color for {name}">` is only rendered
 *    when customization is unlocked (Pro tier, VITE_TIER_OVERRIDE=pro).
 *    Under Pro access `customizationLocked=false`, so the label/swatch IS visible.
 *    We also assert colours via the always-visible `borderLeftColor` on the row div.
 */

import { test, expect } from '@playwright/test';
import { setupTauriShim } from './helpers/tauri-shim';

// ── helpers ───────────────────────────────────────────────────────────────────

/**
 * Read the inline `style` attribute of the category row div for a given
 * category name.  React sets `borderLeftColor` directly via inline JS style,
 * so the raw attribute string contains the browser-normalised rgb() value.
 */
async function getRowInlineStyle(
  page: import('@playwright/test').Page,
  categoryName: string,
): Promise<string> {
  return page.evaluate((name) => {
    const row = document.querySelector(
      `[aria-label="Category row ${name}"]`,
    ) as HTMLElement | null;
    return row ? (row.getAttribute('style') ?? '') : '';
  }, categoryName);
}

/** Convert a 6-digit hex colour to the `rgb(r, g, b)` form browsers normalise to. */
function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

// ── test data ─────────────────────────────────────────────────────────────────

const MOCK_CATEGORIES = [
  { name: 'Vegetable',     color: '#22c55e' },
  { name: 'Dairy & Eggs', color: '#3b82f6' },
  { name: 'Beverages',   color: '#f97316' },
];

// ── tests ─────────────────────────────────────────────────────────────────────

test.describe('Category colours — CategoriesPage', () => {
  test.beforeEach(async ({ page }) => {
    await setupTauriShim(page, { categories: MOCK_CATEGORIES });
    await page.goto('/#/categories');
    // Wait until at least the first mocked category is visible.
    await expect(page.getByText('Vegetable')).toBeVisible({ timeout: 5_000 });
  });

  // ── DB colours render in category row left-border ─────────────────────────

  test('Vegetable row borderLeftColor reflects the mocked hex colour', async ({ page }) => {
    // When React sets borderLeftColor via inline style, the browser normalises it
    // to rgb() in the DOM attribute — but the sRGB conversion is deterministic
    // from the source hex, regardless of display colour-space.
    const inlineStyle = await getRowInlineStyle(page, 'Vegetable');
    expect(inlineStyle).toContain(hexToRgb('#22c55e'));
  });

  test('Dairy & Eggs row borderLeftColor reflects the mocked hex colour', async ({ page }) => {
    const inlineStyle = await getRowInlineStyle(page, 'Dairy & Eggs');
    expect(inlineStyle).toContain(hexToRgb('#3b82f6'));
  });

  test('Beverages row borderLeftColor reflects the mocked hex colour', async ({ page }) => {
    const inlineStyle = await getRowInlineStyle(page, 'Beverages');
    expect(inlineStyle).toContain(hexToRgb('#f97316'));
  });

  // ── Only mocked categories appear (no built-in defaults) ─────────────────

  test('only the mocked categories are listed when DB returns rows', async ({ page }) => {
    // The hook uses DB rows when rows.length > 0, ignoring localStorage defaults.
    await expect(page.getByText('Vegetable')).toBeVisible();
    await expect(page.getByText('Dairy & Eggs')).toBeVisible();
    await expect(page.getByText('Beverages')).toBeVisible();

    // A category that exists in CUSTOM_GROCERY_CATEGORIES defaults but NOT in the mock
    // should not appear because the hook replaces categories entirely from DB.
    await expect(page.getByText('Snacks', { exact: true })).not.toBeVisible();
  });

  // ── Different colours produce visually distinct rows ──────────────────────

  test('each mocked category row has a distinct left-border colour', async ({ page }) => {
    const [style0, style1, style2] = await Promise.all([
      getRowInlineStyle(page, 'Vegetable'),
      getRowInlineStyle(page, 'Dairy & Eggs'),
      getRowInlineStyle(page, 'Beverages'),
    ]);

    // Each inline style must reference its specific sRGB value.
    expect(style0).toContain(hexToRgb('#22c55e'));
    expect(style1).toContain(hexToRgb('#3b82f6'));
    expect(style2).toContain(hexToRgb('#f97316'));
  });
});

// ── fallback colour when shim returns empty list ──────────────────────────────

test.describe('Category colours — fallback when DB is empty', () => {
  test.beforeEach(async ({ page }) => {
    // Empty categories list → hook seeds from localStorage / CUSTOM_GROCERY_CATEGORIES defaults.
    await setupTauriShim(page, { categories: [] });
    await page.goto('/#/categories');
    await expect(page.getByText('Vegetable')).toBeVisible({ timeout: 5_000 });
  });

  test('default categories are shown when list_categories returns empty', async ({ page }) => {
    await expect(page.getByText('Vegetable')).toBeVisible();
    await expect(page.getByText('Beverages')).toBeVisible();
    await expect(page.getByText('Dairy & Eggs')).toBeVisible();
  });

  test('Vegetable row borderLeftColor is not the mocked green when DB is empty', async ({ page }) => {
    // When DB is empty the hook uses CUSTOM_GROCERY_CATEGORIES with colorForIndex() colours.
    // We verify the inline style does NOT contain the sRGB form of '#22c55e'.
    const inlineStyle = await getRowInlineStyle(page, 'Vegetable');
    expect(inlineStyle).toBeTruthy();
    expect(inlineStyle).not.toContain(hexToRgb('#22c55e'));
  });
});

// ── colour update via update_category_color invoke ───────────────────────────

test.describe('Category colours — colour change via UI (Pro tier required)', () => {
  test('color-change label is visible when customization is unlocked (pro tier)', async ({ page }) => {
    // Under VITE_TIER_OVERRIDE=pro (the default dev tier), customizationLocked=false.
    // The <label title="Change color for Produce"> should be rendered in the DOM.
    await setupTauriShim(page, { categories: MOCK_CATEGORIES });
    await page.goto('/#/categories');
    await expect(page.getByText('Vegetable')).toBeVisible({ timeout: 5_000 });

    // The color-picker label is inside !customizationLocked guard — should be visible under pro.
    await expect(page.locator('[title="Change color for Vegetable"]')).toBeVisible();
  });
});
