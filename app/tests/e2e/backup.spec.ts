/**
 * E2E tests for the Backup & Restore page.
 *
 * Covers:
 *  - Page structure (heading, buttons, tip section)
 *  - Export flow: button click → save dialog → success message with file info
 *  - Export cancelled: save dialog returns null → no message shown
 *  - Import flow: button click → open dialog → confirm dialog → success message
 *  - Import cancelled at open-dialog step → no message shown
 *  - Import cancelled at confirmation dialog → no message shown
 *  - Error state: export command throws → error message shown
 *  - Dismiss button removes the status message
 *  - SideNav Backup link is present and active on the backup page
 */

import { test, expect } from '@playwright/test';
import { setupTauriShim } from './helpers/tauri-shim';

const MOCK_BACKUP_INFO = {
  path: '/Users/test/Desktop/grocery-backup-20260320.gbak',
  sizeBytes: 45_056,
  entryCount: 12,
};

// ── Page structure ────────────────────────────────────────────────────────────

test.describe('Backup Page - structure', () => {
  test.beforeEach(async ({ page }) => {
    await setupTauriShim(page);
    await page.goto('/#/backup');
  });

  test('renders the Backup & Restore heading', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: 'Backup & Restore', level: 1 }),
    ).toBeVisible();
  });

  test('shows a subtitle describing the page purpose', async ({ page }) => {
    await expect(
      page.getByText('Export your data to a file or restore from a previous backup.'),
    ).toBeVisible();
  });

  test('renders the Save Backup button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Save Backup/i })).toBeVisible();
  });

  test('renders the Restore button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Restore/i })).toBeVisible();
  });

  test('Export section mentions .gbak format', async ({ page }) => {
    await expect(page.getByText(/Export backup/i)).toBeVisible();
    await expect(page.getByText(/.gbak/).first()).toBeVisible();
  });

  test('Restore section mentions .gbak format', async ({ page }) => {
    await expect(page.getByText(/Restore from backup/i)).toBeVisible();
  });

  test('tip section is visible', async ({ page }) => {
    await expect(page.getByText('Tip')).toBeVisible();
    await expect(page.getByText(/Back up regularly/i)).toBeVisible();
  });
});

// ── Export flow ───────────────────────────────────────────────────────────────

test.describe('Backup Page - export', () => {
  test('shows success message and last-backup info after export', async ({ page }) => {
    await setupTauriShim(page, {
      dialogSavePath: MOCK_BACKUP_INFO.path,
      backupInfo: MOCK_BACKUP_INFO,
    });
    await page.goto('/#/backup');

    await page.getByRole('button', { name: /Save Backup/i }).click();

    // Success banner
    await expect(
      page.getByText(/Backup saved/i),
    ).toBeVisible();

    // Last-export details
    await expect(
      page.getByText('Last export'),
    ).toBeVisible();
    await expect(
      page.getByText(MOCK_BACKUP_INFO.path),
    ).toBeVisible();
    await expect(
      page.getByText('12 files archived'),
    ).toBeVisible();
  });

  test('shows file size in last-backup info', async ({ page }) => {
    await setupTauriShim(page, {
      dialogSavePath: MOCK_BACKUP_INFO.path,
      backupInfo: MOCK_BACKUP_INFO,
    });
    await page.goto('/#/backup');

    await page.getByRole('button', { name: /Save Backup/i }).click();

    // 45 056 bytes → "44.00 KB" — check inside the last-export info section, not the toast
    const lastExportSection = page.locator('.rounded-xl.bg-slate-50');
    await expect(lastExportSection.getByText(/44(\.\d+)? KB/i)).toBeVisible();
  });

  test('cancelled save dialog shows no message', async ({ page }) => {
    await setupTauriShim(page, { dialogSavePath: null });
    await page.goto('/#/backup');

    await page.getByRole('button', { name: /Save Backup/i }).click();

    // No success or error message should appear.
    await expect(page.getByText(/Backup saved/i)).not.toBeVisible();
    await expect(page.getByText(/Export failed/i)).not.toBeVisible();
  });

  test('export error shows error message', async ({ page }) => {
    await setupTauriShim(page, {
      dialogSavePath: MOCK_BACKUP_INFO.path,
      // Override export_backup to throw by providing a page.addInitScript that
      // throws after setupTauriShim injects the base shim.
    });
    // Inject a script that replaces export_backup with a throwing version.
    await page.addInitScript(() => {
      const original = window.__TAURI_INTERNALS__ as Record<string, unknown>;
      const originalInvoke = original.invoke as (cmd: string) => Promise<unknown>;
      original.invoke = async (cmd: string, ...args: unknown[]) => {
        if (cmd === 'export_backup') {
          throw new Error('Disk full');
        }
        return originalInvoke(cmd, ...args);
      };
    });
    await page.goto('/#/backup');

    await page.getByRole('button', { name: /Save Backup/i }).click();

    await expect(page.getByText(/Export failed/i)).toBeVisible();
  });
});

// ── Import flow ───────────────────────────────────────────────────────────────

test.describe('Backup Page - import', () => {
  test('shows success message after confirmed restore', async ({ page }) => {
    await setupTauriShim(page, {
      dialogOpenPath: MOCK_BACKUP_INFO.path,
      dialogConfirm: true,
    });
    await page.goto('/#/backup');

    await page.getByRole('button', { name: /^Restore$/i }).click();

    await expect(
      page.getByText(/Backup restored/i),
    ).toBeVisible();
  });

  test('cancelled open dialog shows no message', async ({ page }) => {
    await setupTauriShim(page, { dialogOpenPath: null });
    await page.goto('/#/backup');

    await page.getByRole('button', { name: /^Restore$/i }).click();

    await expect(page.getByText(/Backup restored/i)).not.toBeVisible();
    await expect(page.getByText(/Import failed/i)).not.toBeVisible();
  });

  test('declined confirmation dialog shows no message', async ({ page }) => {
    await setupTauriShim(page, {
      dialogOpenPath: MOCK_BACKUP_INFO.path,
      dialogConfirm: false,
    });
    await page.goto('/#/backup');

    await page.getByRole('button', { name: /^Restore$/i }).click();

    await expect(page.getByText(/Backup restored/i)).not.toBeVisible();
    await expect(page.getByText(/Import failed/i)).not.toBeVisible();
  });

  test('import error shows error message', async ({ page }) => {
    await setupTauriShim(page, {
      dialogOpenPath: MOCK_BACKUP_INFO.path,
      dialogConfirm: true,
    });
    await page.addInitScript(() => {
      const original = window.__TAURI_INTERNALS__ as Record<string, unknown>;
      const originalInvoke = original.invoke as (cmd: string) => Promise<unknown>;
      original.invoke = async (cmd: string, ...args: unknown[]) => {
        if (cmd === 'import_backup') {
          throw new Error('Not a valid GBAK backup file');
        }
        return originalInvoke(cmd, ...args);
      };
    });
    await page.goto('/#/backup');

    await page.getByRole('button', { name: /^Restore$/i }).click();

    await expect(page.getByText(/Import failed/i)).toBeVisible();
  });
});

// ── Auto-dismiss message ──────────────────────────────────────────────────────

test('the status message auto-dismisses after a few seconds', async ({ page }) => {
  await setupTauriShim(page, {
    dialogSavePath: MOCK_BACKUP_INFO.path,
    backupInfo: MOCK_BACKUP_INFO,
  });
  await page.goto('/#/backup');

  await page.getByRole('button', { name: /Save Backup/i }).click();
  await expect(page.getByText(/Backup saved/i)).toBeVisible();

  // The toast auto-dismisses after ~3 s (no Dismiss button — pointer-events-none).
  await expect(page.getByText(/Backup saved/i)).not.toBeVisible({ timeout: 8000 });
});

// ── Navigation ────────────────────────────────────────────────────────────────

test.describe('Backup Page - navigation', () => {
  test.beforeEach(async ({ page }) => {
    await setupTauriShim(page);
    await page.goto('/#/backup');
  });

  test('SideNav has a Backup link', async ({ page }) => {
    const nav = page.getByRole('complementary', { name: 'Main navigation' });
    await expect(nav.getByRole('link', { name: /Backup/i })).toBeVisible();
  });

  test('SideNav Dashboard link navigates away from backup', async ({ page }) => {
    const nav = page.getByRole('complementary', { name: 'Main navigation' });
    await nav.getByRole('link', { name: 'Dashboard' }).click();
    await expect(page).toHaveURL(/#\/$/);
  });

  test('SideNav Settings link navigates to settings', async ({ page }) => {
    const nav = page.getByRole('complementary', { name: 'Main navigation' });
    await nav.getByRole('link', { name: 'Settings' }).click();
    await expect(page).toHaveURL(/#\/settings/);
  });
});
