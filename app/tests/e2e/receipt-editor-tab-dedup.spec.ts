import { test, expect } from '@playwright/test';
import { setupTauriShim } from './helpers/tauri-shim';
import type { MockReceiptRecord } from './helpers/tauri-shim';

const MOCK_RECORDS: MockReceiptRecord[] = [
  {
    id: 1,
    imagePath: '/receipts/superstore.jpg',
    processedImagePath: null,
    data: { rows: [{ name: 'Milk', price: 3.99 }, { name: 'Eggs', price: 5.49 }] },
    createdAt: '2025-01-15 10:30:00',
    updatedAt: '2025-01-15 10:30:00',
    displayName: 'Superstore',
  },
  {
    id: 2,
    imagePath: '/receipts/costco.jpg',
    processedImagePath: null,
    data: { rows: [{ name: 'Butter', price: 7.99 }, { name: 'Cheese', price: 12.5 }] },
    createdAt: '2025-02-20 14:00:00',
    updatedAt: '2025-02-20 14:00:00',
    displayName: 'Costco',
  },
  {
    id: 3,
    imagePath: '/receipts/walmart.jpg',
    processedImagePath: null,
    data: { rows: [{ name: 'Bread', price: 2.49 }] },
    createdAt: '2025-03-05 09:00:00',
    updatedAt: '2025-03-05 09:00:00',
    displayName: 'Walmart',
  },
];

test.describe('Receipt Editor tab dedup — replace, not append', () => {
  test.beforeEach(async ({ page }) => {
    await setupTauriShim(page, { receiptScans: MOCK_RECORDS });
  });

  test('opening a receipt creates the editor tab', async ({ page }) => {
    await page.goto('/#/receipts');
    await page.getByText('Superstore').first().click();
    await expect(page).toHaveURL(/#\/receipts\/editor/);
  });

  test('opening a second receipt replaces the first (does not append)', async ({ page }) => {
    await page.goto('/#/receipts');

    await test.step('open receipt 1', async () => {
      await page.getByText('Superstore').first().click();
      await expect(page).toHaveURL(/#\/receipts\/editor/);
    });

    await test.step('navigate back to receipts dashboard', async () => {
      const nav = page.getByRole('complementary', { name: 'Main navigation' });
      await nav.getByRole('link', { name: 'Receipts' }).click();
      await expect(page).toHaveURL(/#\/receipts$/);
    });

    await test.step('open receipt 2 — should replace, not append', async () => {
      await page.getByText('Costco').first().click();
      await expect(page).toHaveURL(/#\/receipts\/editor/);
    });

    await test.step('only one editor tab exists in the tab bar', async () => {
      const editorTabs = page.getByRole('tab', { name: /Receipts Editor/i });
      await expect(editorTabs).toHaveCount(1);
    });
  });

  test('selecting multiple receipts then opening new ones replaces the set', async ({ page }) => {
    await page.goto('/#/receipts');

    await test.step('select and open receipts 1 & 2', async () => {
      await page.getByRole('button', { name: 'Select' }).click();
      await page.getByText('Superstore').first().click();
      await page.getByText('Costco').first().click();
      await page.getByRole('button', { name: /View 2/i }).click();
      await expect(page).toHaveURL(/#\/receipts\/editor/);
    });

    await test.step('go back and open only receipt 3', async () => {
      const nav = page.getByRole('complementary', { name: 'Main navigation' });
      await nav.getByRole('link', { name: 'Receipts' }).click();
      await page.getByText('Walmart').first().click();
      await expect(page).toHaveURL(/#\/receipts\/editor/);
    });

    await test.step('only one editor tab exists', async () => {
      const editorTabs = page.getByRole('tab', { name: /Receipts Editor/i });
      await expect(editorTabs).toHaveCount(1);
    });
  });
});
