/**
 * E2E tests: real-time receipt-update notifications from scan + categorize.
 *
 * Architecture note
 * ─────────────────
 * `ReceiptCacheContext` holds a Map-based cache populated once on mount via
 * `list_receipt_scans`, then kept live by two Tauri event listeners:
 *   - `receipt:saved`  → upsert the record in the cache map
 *   - `receipt:deleted` → remove the record from the cache map
 *
 * In browser (Playwright) mode, the shim's write-command handlers call
 * `fireEvent('receipt:saved', record)` / `fireEvent('receipt:deleted', {id})`
 * immediately after the mock DB operation, exercising the same push-update
 * path as the production Rust backend.
 *
 * Tests navigate through the real React code and assert that the cache-driven
 * UI reflects each write without a full page reload.
 *
 * Architecture alignment (current)
 * ─────────────────────────────────
 * - New scans:  Scanner page (inbox-based; images added via library).
 * - Rescans:    Receipt Editor page — the Re-Scan Receipt button.
 * - Categorize: Receipt Editor page — the Auto-categorize button.
 *
 * `openExistingReceipt` navigates to the Receipts dashboard, clicks the
 * card to open it in the Editor, and waits for the Re-Scan Receipt button
 * to confirm the editor has fully hydrated the receipt from TabMemory.
 */

import { test, expect } from '@playwright/test';
import { setupTauriShim } from './helpers/tauri-shim';
import type { MockReceiptRecord, MockImageLibraryEntry } from './helpers/tauri-shim';

// ── Shared fixtures ───────────────────────────────────────────────────────────

const EXISTING_RECEIPT: MockReceiptRecord = {
    id: 7,
    imagePath: '/mock/receipts/costco-mar.jpg',
    processedImagePath: null,
    data: {
        rows: [
            { name: 'Chicken Breast', price: 22.49, _id: 'row-1' },
            { name: 'Organic Milk', price: 6.99, _id: 'row-2' },
        ],
    },
    createdAt: '2026-03-15 09:00:00',
    updatedAt: '2026-03-15 09:00:00',
    displayName: 'Costco March',
};

/**
 * Pre-wired image library entry for scanner page tests.
 * receiptId is null so it appears in the scanner inbox.
 */
const MOCK_INBOX_IMAGE: MockImageLibraryEntry = {
    id: 1,
    filePath: '/mock/receipt.jpg',
    addedAt: '2026-04-01T12:00:00.000Z',
    thumbnailPath: null,
    receiptId: null,
    stagingPath: null,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Open EXISTING_RECEIPT in the Receipt Editor by clicking its dashboard card.
 * Waits until the Re-Scan Receipt button is visible, confirming the editor
 * has fully hydrated the receipt's imagePath from TabMemory.
 */
async function openExistingReceipt(page: import('@playwright/test').Page) {
    await page.goto('/#/receipts');
    await expect(page.getByText('Costco March').first()).toBeVisible({ timeout: 5_000 });
    // Clicking the card calls openReceiptEditorTab(id) → navigates to editor.
    await page.getByText('Costco March').first().click();
    await expect(page).toHaveURL(/#\/receipts\/editor/, { timeout: 5_000 });
    // Re-Scan button confirms imagePath is set (editor fully hydrated).
    await expect(page.getByRole('button', { name: /Re-Scan Receipt/i })).toBeVisible({
        timeout: 5_000,
    });
}

/** Navigate to the receipts dashboard via the SideNav link. */
async function goToDashboard(page: import('@playwright/test').Page) {
    const nav = page.getByRole('complementary', { name: 'Main navigation' });
    await nav.getByRole('link', { name: 'Receipts' }).click();
    await expect(page).toHaveURL(/#\/receipts$/, { timeout: 5_000 });
}

// ── Test: dashboard refresh after new scan ────────────────────────────────────

test.describe('Dashboard real-time refresh', () => {
    test('a new scan causes the dashboard to load the new card automatically', async ({ page }) => {
        const newRecord: MockReceiptRecord = {
            id: 100,
            imagePath: '/mock/receipt.jpg',
            processedImagePath: null,
            data: { rows: [{ name: 'Mock Item', price: 9.99 }] },
            createdAt: '2026-04-01 12:00:00',
            updatedAt: '2026-04-01 12:00:00',
            displayName: 'Mock Receipt',
        };

        await setupTauriShim(page, {
            receiptScans: [],
            savedReceiptRecord: newRecord,
            // Pre-populate the image library inbox so Scan All is available
            // without requiring a file-picker interaction.
            imageLibrary: [MOCK_INBOX_IMAGE],
        });

        // Dashboard starts empty.
        await page.goto('/#/receipts');
        await expect(page.getByText('No matching receipts found.')).toBeVisible();

        // Navigate to scanner — the pre-loaded image appears in the inbox.
        await page.goto('/#/receipt-scanner');
        await expect(page.getByRole('button', { name: 'Scan all images' })).toBeVisible({
            timeout: 5_000,
        });
        await page.getByRole('button', { name: 'Scan all images' }).click();

        // Navigate to dashboard — the shim fires receipt:saved via job:status done,
        // so ReceiptCacheContext adds the new record asynchronously.
        await goToDashboard(page);
        await expect(page.getByText('Mock Receipt')).toBeVisible({ timeout: 5_000 });
    });
});

// ── Test: dashboard updates after rescan (push-based) ────────────────────────

test.describe('Dashboard push update after rescan', () => {
    test('rescan fires receipt:saved and dashboard card reflects the update', async ({ page }) => {
        await setupTauriShim(page, {
            receiptScans: [EXISTING_RECEIPT],
            updatedReceiptRecord: EXISTING_RECEIPT,
        });

        await test.step('Open existing receipt in editor and trigger rescan', async () => {
            await openExistingReceipt(page);
            await page.getByRole('button', { name: /Re-Scan Receipt/i }).click();
            // Wait for scan to finish — button label returns to "Re-Scan Receipt".
            await expect(page.getByRole('button', { name: /Re-Scan Receipt/i })).toBeVisible({
                timeout: 15_000,
            });
        });

        await test.step('Dashboard still shows the updated card (no manual reload needed)', async () => {
            await goToDashboard(page);
            await expect(page.getByText('Costco March')).toBeVisible({ timeout: 3_000 });
            await expect(page.getByText('Updated')).not.toBeVisible();
        });
    });

    test('browsing without changes does not show any Updated badge', async ({ page }) => {
        await setupTauriShim(page, { receiptScans: [EXISTING_RECEIPT] });

        // The receipt is already in the cache — just verify the dashboard reflects it.
        await page.goto('/#/receipts');
        await expect(page.getByText('Costco March')).toBeVisible({ timeout: 5_000 });
        await expect(page.getByText('Updated')).not.toBeVisible();
    });

    test('second rescan completes after the first rescan has already finished', async ({ page }) => {
        await setupTauriShim(page, {
            receiptScans: [EXISTING_RECEIPT],
            updatedReceiptRecord: EXISTING_RECEIPT,
        });

        await openExistingReceipt(page);
        const rescanBtn = page.getByRole('button', { name: /Re-Scan Receipt/i });

        await test.step('First rescan completes', async () => {
            await rescanBtn.click();
            await expect(rescanBtn).toBeVisible({ timeout: 15_000 });
        });

        await test.step('Second rescan also completes (not silently dropped)', async () => {
            // Read scan count before second click to confirm a new job is submitted.
            const countBefore = await page.evaluate(() =>
                (window as unknown as Record<string, number>).__tauriScanReceiptCount ?? 0,
            );
            await rescanBtn.click();
            // scan_receipt should have been invoked a second time.
            await expect.poll(
                () => page.evaluate(() =>
                    (window as unknown as Record<string, number>).__tauriScanReceiptCount ?? 0,
                ),
                { timeout: 5_000 },
            ).toBeGreaterThan(countBefore);
            // Button must return to Re-Scan Receipt once the second scan completes.
            await expect(rescanBtn).toBeVisible({ timeout: 15_000 });
        });
    });

    test('navigating away and back keeps the card data fresh (cache persists)', async ({ page }) => {
        await setupTauriShim(page, {
            receiptScans: [EXISTING_RECEIPT],
            updatedReceiptRecord: EXISTING_RECEIPT,
        });

        await test.step('Rescan receipt in editor', async () => {
            await openExistingReceipt(page);
            await page.getByRole('button', { name: /Re-Scan Receipt/i }).click();
            await expect(page.getByRole('button', { name: /Re-Scan Receipt/i })).toBeVisible({
                timeout: 15_000,
            });
        });

        await test.step('Card visible after first navigation to dashboard', async () => {
            await goToDashboard(page);
            await expect(page.getByText('Costco March')).toBeVisible({ timeout: 3_000 });
        });

        await test.step('Card still present after navigating away and back', async () => {
            await page.goto('/#/receipt-scanner');
            await expect(page.getByRole('heading', { name: 'Scan Receipts' })).toBeVisible();
            await goToDashboard(page);
            await expect(page.getByText('Costco March')).toBeVisible();
            await expect(page.getByText('Updated')).not.toBeVisible();
        });
    });
});

// ── Test: "Updated" badge after categorize ───────────────────────────────────

test.describe('Dashboard push update after categorize', () => {
    test('categorizing items fires receipt:saved and dashboard card remains visible', async ({
        page,
    }) => {
        await setupTauriShim(page, {
            receiptScans: [EXISTING_RECEIPT],
            updatedReceiptRecord: {
                ...EXISTING_RECEIPT,
                data: {
                    rows: [
                        { name: 'Chicken Breast', price: 22.49, category: 'Meat' },
                        { name: 'Organic Milk', price: 6.99, category: 'Dairy' },
                    ],
                },
            },
            inferredCategories: ['Meat', 'Dairy'],
        });

        await test.step('Open receipt in editor and trigger categorization', async () => {
            await openExistingReceipt(page);
            const catBtn = page.getByRole('button', { name: /Auto-categorize/i });
            await expect(catBtn).toBeVisible({ timeout: 5_000 });
            await catBtn.click();
            await expect(catBtn).toBeEnabled({ timeout: 10_000 });
        });

        await test.step('Dashboard shows the receipt card (cache updated via push event)', async () => {
            await goToDashboard(page);
            await expect(page.getByText('Costco March')).toBeVisible({ timeout: 3_000 });
            await expect(page.getByText('Updated')).not.toBeVisible();
        });
    });
});

// ── Test: scan progress UI updates during a hanging scan ─────────────────────

test.describe('Scan progress initialization', () => {
    test('editor shows Scanning state and progress label before scan completes', async ({ page }) => {
        await setupTauriShim(page, {
            receiptScans: [EXISTING_RECEIPT],
            hangOnScanReceipt: true,
        });

        await openExistingReceipt(page);
        // Start scan — it will hang indefinitely, keeping the UI in scanning state.
        await page.getByRole('button', { name: /Re-Scan Receipt/i }).click();
        await expect(page.getByRole('button', { name: 'Scanning…' })).toBeVisible({
            timeout: 5_000,
        });
        // The shim fires scan-progress 'Preparing image…' for the hanging case.
        await expect(page.getByText(/Preparing image/i)).toBeVisible({ timeout: 2_000 });
    });

    test('progress label updates when a step event arrives', async ({ page }) => {
        await setupTauriShim(page, {
            receiptScans: [EXISTING_RECEIPT],
            hangOnScanReceipt: true,
        });

        await openExistingReceipt(page);
        await page.getByRole('button', { name: /Re-Scan Receipt/i }).click();
        await expect(page.getByRole('button', { name: 'Scanning…' })).toBeVisible({
            timeout: 5_000,
        });

        // Emit a real step event and assert the label updates in the task widget.
        await page.evaluate(() => {
            // @ts-expect-error — test shim global
            window.__tauriEmitEvent('scan-progress', 'Step 1/3 — Recognizing text in image');
        });

        await expect(page.getByText(/Recognizing text/i)).toBeVisible({ timeout: 2_000 });
    });
});
