/**
 * E2E tests for the Categories management page.
 *
 * Covers:
 *  - Page structure: heading, description, add form, category list
 *  - Adding a new category (keyboard + button)
 *  - Validation: empty name, duplicate name
 *  - Inline rename via pencil button
 *  - Delete button presence
 *  - Drag-to-reorder handle (aria-label, cursor)
 *  - Reset to defaults button
 *  - Usage tip below the list
 */

import { test, expect } from '@playwright/test';
import { setupTauriShim } from './helpers/tauri-shim';

test.describe('Categories Page', () => {
  test.beforeEach(async ({ page }) => {
    await setupTauriShim(page);
    await page.goto('/#/categories');
  });

  // ── Page structure ──────────────────────────────────────────────────────────

  test('renders the page heading and description', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: 'Categories', level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByText('Manage the grocery categories used in receipts and auto-categorization.'),
    ).toBeVisible();
  });

  test('renders the Add category section with input and button', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: 'Add category', level: 2 }),
    ).toBeVisible();
    await expect(
      page.getByRole('textbox', { name: 'New category name' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Add' }),
    ).toBeVisible();
  });

  test('renders default categories including Vegetable, Fruit, and Dairy & Eggs', async ({ page }) => {
    await expect(page.getByText('Vegetable')).toBeVisible();
    await expect(page.getByText('Fruit')).toBeVisible();
    await expect(page.getByText('Dairy & Eggs')).toBeVisible();
  });

  test('shows a category count heading', async ({ page }) => {
    await expect(page.getByText(/\d+ categor/)).toBeVisible();
  });

  // ── Drag handle ─────────────────────────────────────────────────────────────

  test('each category row has a drag-to-reorder handle area', async ({ page }) => {
    // Every row renders a grip icon (fa-grip-vertical) regardless of tier.
    const handles = page.locator('[aria-label^="Category row"] .fa-grip-vertical');
    await expect(handles.first()).toBeVisible();
    // There should be one handle per category row (at least 23 defaults).
    await expect(handles).toHaveCount(23);
  });

  // ── Add category ────────────────────────────────────────────────────────────

  test('adds a new category when a unique name is entered and Add is clicked', async ({ page }) => {
    await test.step('Type and submit new category', async () => {
      await page.getByRole('textbox', { name: 'New category name' }).fill('Baby Foods');
      await page.getByRole('button', { name: 'Add' }).click();
    });

    await test.step('Verify success toast and that item appears in the list', async () => {
      await expect(page.getByText(/Added "Baby Foods"/)).toBeVisible();
      await expect(page.getByText('Baby Foods', { exact: true })).toBeVisible();
    });
  });

  test('adds a category when Enter is pressed in the input', async ({ page }) => {
    await page.getByRole('textbox', { name: 'New category name' }).fill('Keto Snacks');
    await page.keyboard.press('Enter');
    await expect(page.getByText('Keto Snacks', { exact: true })).toBeVisible();
  });

  test('shows an error when adding a duplicate category name (case-insensitive)', async ({ page }) => {
    await page.getByRole('textbox', { name: 'New category name' }).fill('vegetable');
    await page.getByRole('button', { name: 'Add' }).click();
    await expect(
      page.getByText('A category with that name already exists.'),
    ).toBeVisible();
  });

  test('shows an error when the Add button is clicked with an empty name', async ({ page }) => {
    await page.getByRole('button', { name: 'Add' }).click();
    await expect(
      page.getByText('Name cannot be empty.'),
    ).toBeVisible();
  });

  // ── Inline rename ───────────────────────────────────────────────────────────

  test('pencil (rename) button is visible for each category row', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: 'Rename Vegetable' }),
    ).toBeVisible();
  });

  test('clicking the pencil button reveals an inline edit input and Save button', async ({ page }) => {
    await page.getByRole('button', { name: 'Rename Vegetable' }).click();

    await expect(
      page.getByRole('textbox', { name: 'Edit category name' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Save' }),
    ).toBeVisible();
  });

  test('saving an inline edit renames the category', async ({ page }) => {
    await page.getByRole('button', { name: 'Rename Vegetable' }).click();

    const editInput = page.getByRole('textbox', { name: 'Edit category name' });
    await editInput.clear();
    await editInput.fill('Fresh Produce');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByText('Fresh Produce', { exact: true })).toBeVisible();
    await expect(page.getByText(/Renamed to "Fresh Produce"/)).toBeVisible();
  });

  test('pressing Escape in the edit input cancels the rename', async ({ page }) => {
    await page.getByRole('button', { name: 'Rename Vegetable' }).click();

    const editInput = page.getByRole('textbox', { name: 'Edit category name' });
    await editInput.fill('Draft Name');
    await editInput.press('Escape');

    // Original name should still be visible, edit input should be gone.
    await expect(page.getByText('Vegetable')).toBeVisible();
    await expect(
      page.getByRole('textbox', { name: 'Edit category name' }),
    ).not.toBeVisible();
  });

  // ── Delete ──────────────────────────────────────────────────────────────────

  test('delete button is visible for each category row', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: 'Delete Vegetable' }),
    ).toBeVisible();
  });

  // ── Reset to defaults ───────────────────────────────────────────────────────

  test('"Reset to defaults" button is present', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: /Reset to defaults/i }),
    ).toBeVisible();
  });

  // ── Usage tip ───────────────────────────────────────────────────────────────

  test('displays a usage tip / upgrade prompt below the list', async ({ page }) => {
    // Under the subscribed (free) tier, customization is locked so the upgrade
    // prompt is shown. Under pro the drag tip is shown. Assert the <p> exists.
    await expect(
      page.getByText(/drag.*reorder|Upgrade to Paid/i),
    ).toBeVisible();
  });
});
