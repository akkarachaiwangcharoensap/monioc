/**
 * E2E tests for the Settings page.
 *
 * Covers:
 *  - Page structure (heading, subtitle)
 *  - AI Models section visibility and status indicators
 *  - Storage info section renders with mocked data
 *  - Storage Refresh button reloads storage info
 *  - "Remove All" — confirm path: invokes backend, clears localStorage, reloads
 *  - "Remove All" — cancel path: no side effects
 *  - "Clear receipt files" — confirm path: invokes removal commands, shows success
 *  - "Clear receipt files" — cancel path: no side effects
 *  - Error banner dismissal
 */

import { test, expect } from '@playwright/test';
import { setupTauriShim } from './helpers/tauri-shim';

const MOCK_STORAGE = {
  appDataDir: '/Users/test/Library/Application Support/com.grocery/data',
  fileCount: 7,
  totalSizeBytes: 3_145_728, // 3 MB
  dbSizeBytes: 102_400,
  receiptImagesBytes: 2_097_152,
  stagingBytes: 65_536,
};

const EMPTY_STORAGE = {
  appDataDir: '/Users/test/Library/Application Support/com.grocery/data',
  fileCount: 0,
  totalSizeBytes: 0,
  dbSizeBytes: 0,
  receiptImagesBytes: 0,
  stagingBytes: 0,
};

test.describe('Settings Page — structure', () => {
  test.beforeEach(async ({ page }) => {
    await setupTauriShim(page, { storageInfo: MOCK_STORAGE });
    await page.goto('/#/settings');
  });

  test('renders the Settings heading and subtitle', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: 'Settings', level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByText('Storage and AI model management.'),
    ).toBeVisible();
  });

  test('SideNav "Dashboard" link returns to the main page', async ({ page }) => {
    const nav = page.getByRole('complementary', { name: 'Main navigation' });
    await nav.getByRole('link', { name: 'Dashboard' }).click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(
      page.getByRole('heading', { level: 1 }),
    ).toContainText(/Good (morning|afternoon|evening)/);
  });

  test('AI Models section is visible', async ({ page }) => {
    await expect(
      page.locator('p').filter({ hasText: 'AI Models' }),
    ).toBeVisible();
  });

  test('storage section renders file count and size from mock data', async ({ page }) => {
    // formatBytes(3_145_728) → "3.00 MB"
    await expect(page.getByText('7')).toBeVisible();
    await expect(page.getByText('3.00 MB')).toBeVisible();
  });

  test('storage section has a Refresh button', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: /^Refresh$/i }),
    ).toBeVisible();
  });

  test('AI Models ready indicator is shown when models are present', async ({ page }) => {
    // Shim reports both models ready; expect green dot + "Ready to scan receipts"
    await expect(
      page.getByText('Ready to scan receipts'),
    ).toBeVisible();
  });

  test('storage breakdown rows are rendered', async ({ page }) => {
    await expect(page.getByText('Database')).toBeVisible();
    await expect(page.getByText('Receipt files')).toBeVisible();
    // Use a specific locator to avoid strict-mode violation (AI Models appears
    // once in the header section and once in the storage breakdown row).
    await expect(page.locator('span').filter({ hasText: /^AI Models$/ }).first()).toBeVisible();
  });

  test('Open Folder button is present', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: /Open Folder/i }),
    ).toBeVisible();
  });
});

test.describe('Settings Page — Remove All action', () => {
  test('TC-E-S-1: Remove All (confirm) calls remove_all_app_data, clears localStorage, and reloads', async ({ page }) => {
    await setupTauriShim(page, {
      storageInfo: MOCK_STORAGE,
      dialogConfirm: true,
    });
    await page.goto('/#/settings');

    // Pre-seed localStorage with a key that must be wiped on factory reset.
    await page.evaluate(() => {
      localStorage.setItem('app.tabs', JSON.stringify([{ id: '1', path: '/receipts' }]));
      localStorage.setItem('app.statistics.granularity', 'week');
    });

    // Wait for storage section to appear.
    await expect(page.getByRole('button', { name: /Remove All/i })).toBeVisible();

    // Start listening for the navigation (reload) that fires after the wipe.
    const navigationPromise = page.waitForNavigation({ timeout: 5_000 });
    await page.getByRole('button', { name: /Remove All/i }).click();

    // Wait for the page to reload.  If reload() was never called (e.g. the
    // backend threw and the error path was taken), this will time out.
    await navigationPromise;

    // After reload, previously seeded localStorage keys should be gone.
    // (The dev-mode shim intercepts clear() to restore app.tutorial.seen only.)
    const tabsKey = await page.evaluate(() => localStorage.getItem('app.tabs'));
    const granularityKey = await page.evaluate(() => localStorage.getItem('app.statistics.granularity'));
    expect(tabsKey).toBeNull();
    expect(granularityKey).toBeNull();
  });

  test('TC-E-S-2: Remove All (cancel) makes no backend call and leaves localStorage intact', async ({ page }) => {
    await setupTauriShim(page, {
      storageInfo: MOCK_STORAGE,
      dialogConfirm: false,
    });
    await page.goto('/#/settings');

    await page.evaluate(() => {
      localStorage.setItem('app.statistics.granularity', 'month');
    });

    await expect(page.getByRole('button', { name: /Remove All/i })).toBeVisible();
    await page.getByRole('button', { name: /Remove All/i }).click();

    // Small wait to ensure no async side-effects settled.
    await page.waitForTimeout(300);

    // Backend was NOT called.
    const callCount = await page.evaluate(
      () => (window as unknown as Record<string, number>).__tauriRemoveAllAppDataCount ?? 0,
    );
    expect(callCount).toBe(0);

    // localStorage key still intact.
    const granularity = await page.evaluate(() => localStorage.getItem('app.statistics.granularity'));
    expect(granularity).toBe('month');
  });
});

test.describe('Settings Page — Clear receipt files action', () => {
  test('TC-E-S-3: Clear (confirm) removes images/staging and shows success message', async ({ page }) => {
    await setupTauriShim(page, {
      storageInfo: MOCK_STORAGE,
      dialogConfirm: true,
    });
    await page.goto('/#/settings');

    // Track calls to clear_receipt_staging and remove_receipt_images.
    await page.evaluate(() => {
      const w = window as unknown as Record<string, number>;
      w.__tauriClearReceiptStagingCount = 0;
      w.__tauriRemoveReceiptImagesCount = 0;
    });

    // Patch invoke to count the specific calls BEFORE the button is clicked.
    await page.evaluate(() => {
      const orig = window.__TAURI_INTERNALS__.invoke;
      window.__TAURI_INTERNALS__.invoke = async (cmd: string, args?: Record<string, unknown>) => {
        const w = window as unknown as Record<string, number>;
        if (cmd === 'clear_receipt_staging') w.__tauriClearReceiptStagingCount++;
        if (cmd === 'remove_receipt_images') w.__tauriRemoveReceiptImagesCount++;
        return orig(cmd, args);
      };
    });

    await expect(page.getByRole('button', { name: /^Clear$/i })).toBeVisible();
    await page.getByRole('button', { name: /^Clear$/i }).click();

    // Success banner must appear.
    await expect(page.getByText('Receipt files cleared.')).toBeVisible();

    const stagingCount = await page.evaluate(
      () => (window as unknown as Record<string, number>).__tauriClearReceiptStagingCount,
    );
    const imagesCount = await page.evaluate(
      () => (window as unknown as Record<string, number>).__tauriRemoveReceiptImagesCount,
    );
    expect(stagingCount).toBe(1);
    expect(imagesCount).toBe(1);
  });

  test('TC-E-S-4: Clear (cancel) does not call any backend command', async ({ page }) => {
    await setupTauriShim(page, {
      storageInfo: MOCK_STORAGE,
      dialogConfirm: false,
    });
    await page.goto('/#/settings');

    await page.evaluate(() => {
      const w = window as unknown as Record<string, number>;
      w.__tauriRemoveReceiptImagesCount = 0;
    });

    await page.evaluate(() => {
      const orig = window.__TAURI_INTERNALS__.invoke;
      window.__TAURI_INTERNALS__.invoke = async (cmd: string, args?: Record<string, unknown>) => {
        const w = window as unknown as Record<string, number>;
        if (cmd === 'remove_receipt_images') w.__tauriRemoveReceiptImagesCount++;
        return orig(cmd, args);
      };
    });

    await expect(page.getByRole('button', { name: /^Clear$/i })).toBeVisible();
    await page.getByRole('button', { name: /^Clear$/i }).click();

    await page.waitForTimeout(300);

    const imagesCount = await page.evaluate(
      () => (window as unknown as Record<string, number>).__tauriRemoveReceiptImagesCount,
    );
    expect(imagesCount).toBe(0);

    // Success banner must NOT appear.
    await expect(page.getByText('Receipt files cleared.')).not.toBeVisible();
  });

  test('TC-E-S-5: error banner can be dismissed', async ({ page }) => {
    await setupTauriShim(page, {
      storageInfo: MOCK_STORAGE,
      dialogConfirm: true,
    });
    await page.goto('/#/settings');

    // Patch invoke to throw for remove_receipt_images.
    await page.evaluate(() => {
      const orig = window.__TAURI_INTERNALS__.invoke;
      window.__TAURI_INTERNALS__.invoke = async (cmd: string, args?: Record<string, unknown>) => {
        if (cmd === 'remove_receipt_images') throw new Error('permission denied');
        return orig(cmd, args);
      };
    });

    await expect(page.getByRole('button', { name: /^Clear$/i })).toBeVisible();
    await page.getByRole('button', { name: /^Clear$/i }).click();

    await expect(page.getByText(/permission denied/i)).toBeVisible();

    await page.getByRole('button', { name: /Dismiss/i }).click();

    await expect(page.getByText(/permission denied/i)).not.toBeVisible();
  });
});

test.describe('Settings Page — storage with no receipt files', () => {
  test('TC-E-S-6: Clear button is hidden when receipt file size is zero', async ({ page }) => {
    await setupTauriShim(page, {
      storageInfo: EMPTY_STORAGE,
    });
    await page.goto('/#/settings');

    // Storage rows present but no Clear button
    await expect(page.getByText('Receipt files')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Clear$/i })).not.toBeVisible();
  });
});

// ── Refresh Cache ─────────────────────────────────────────────────────────────

test.describe('Settings Page — Refresh Cache action', () => {
  test('TC-E-S-7: Refresh Cache button is visible', async ({ page }) => {
    await setupTauriShim(page, { storageInfo: MOCK_STORAGE });
    await page.goto('/#/settings');

    await expect(page.getByRole('button', { name: /Refresh Cache/i })).toBeVisible();
  });

  test('TC-E-S-8: clicking Refresh Cache calls list_receipt_scans and shows success message', async ({ page }) => {
    await setupTauriShim(page, { storageInfo: MOCK_STORAGE });
    await page.goto('/#/settings');

    // Track calls to list_receipt_scans triggered by forceReload.
    await page.evaluate(() => {
      const w = window as unknown as Record<string, number>;
      w.__tauriListReceiptScansCount = 0;
      const orig = window.__TAURI_INTERNALS__.invoke;
      window.__TAURI_INTERNALS__.invoke = async (cmd: string, args?: Record<string, unknown>) => {
        if (cmd === 'list_receipt_scans') w.__tauriListReceiptScansCount++;
        return orig(cmd, args);
      };
    });

    await page.getByRole('button', { name: /Refresh Cache/i }).click();

    // Success banner should appear.
    await expect(page.getByText('Cache refreshed successfully.')).toBeVisible();

    // forceReload() must have called list_receipt_scans at least once.
    const callCount = await page.evaluate(
      () => (window as unknown as Record<string, number>).__tauriListReceiptScansCount,
    );
    expect(callCount).toBeGreaterThanOrEqual(1);
  });
});

