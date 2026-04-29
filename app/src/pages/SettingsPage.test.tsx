/**
 * Unit tests for SettingsPage.
 *
 * Covers the three primary storage actions:
 *  - "Remove All"         → confirms → backend wipe → localStorage clear → reload
 *  - "Clear receipt files" → confirms → images + staging removed → storage refresh
 *  - "Remove All" cancel  → no backend calls, no side effects
 *  - "Clear receipt files" cancel → no backend calls
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ── Module mocks (hoisted before imports) ──────────────────────────────────────

vi.mock('../services/api', () => ({
	TauriApi: {
		getStorageInfo: vi.fn(),
		removeAllAppData: vi.fn(),
		removeReceiptImages: vi.fn(),
		clearReceiptStaging: vi.fn(),
		openAppDataDir: vi.fn(),
		modelDownloadProgress: vi.fn(),
	},
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
	confirm: vi.fn(),
}));

vi.mock('../hooks/useModelDownload', () => ({
	useModelDownload: () => ({
		checking: false,
		modelStatus: { ocr: true, llm: true },
		downloading: false,
		progress: null,
		removing: false,
		error: null,
		handleDownload: vi.fn(),
		handleRemove: vi.fn(),
		recheckStatus: vi.fn(),
	}),
}));

vi.mock('../context/ReceiptCacheContext', () => ({
	useReceiptCache: vi.fn(),
}));

// ── Late imports (after mocks are set up) ─────────────────────────────────────

import SettingsPage from './SettingsPage';
import { TauriApi } from '../services/api';
import { confirm as confirmDialog } from '@tauri-apps/plugin-dialog';
import * as ReceiptCacheContext from '../context/ReceiptCacheContext';

const { useReceiptCache } = ReceiptCacheContext;

// ── Fixtures ──────────────────────────────────────────────────

const MOCK_STORAGE = {
	appDataDir: '/test/appdata',
	fileCount: 5,
	totalSizeBytes: 1_048_576,
	dbSizeBytes: 102_400,
	receiptImagesBytes: 512_000,
	stagingBytes: 65_536,
	modelsBytes: 0,
	otherBytes: 0,
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function renderSettings() {
	return render(<SettingsPage />);
}

// ── Setup / teardown ───────────────────────────────────────────────────────────

let reloadMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
	vi.resetAllMocks();

	// Default: storage resolves with mock data.
	vi.mocked(TauriApi.getStorageInfo).mockResolvedValue(MOCK_STORAGE);
	vi.mocked(TauriApi.modelDownloadProgress).mockResolvedValue({
		downloadedBytes: 5_800_000_000,
		totalBytes: 5_800_000_000,
		downloadedFiles: 2,
		totalFiles: 2,
	});

	// Default: dialog confirms.
	vi.mocked(confirmDialog).mockResolvedValue(true);

	// Default: cache always resolves.
	vi.mocked(useReceiptCache).mockReturnValue({
		receipts: [],
		isInitialLoading: false,
		getReceipt: vi.fn(),
		applyOptimistic: vi.fn(),
		applyUpdate: vi.fn(),
		applyOptimisticDelete: vi.fn(),
		forceReload: vi.fn().mockResolvedValue(undefined),
	});

	// Replace window.location with a writable mock so reload can be tracked.
	reloadMock = vi.fn();
	Object.defineProperty(window, 'location', {
		configurable: true,
		writable: true,
		value: { href: 'http://localhost/#/settings', reload: reloadMock },
	});

	// Spy on localStorage.clear.
	vi.spyOn(window.localStorage, 'clear');
});

afterEach(() => cleanup());

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('SettingsPage', () => {
	// TC-S-1: Page structure
	it('TC-S-1: renders the Settings heading', async () => {
		renderSettings();
		await waitFor(() =>
			expect(screen.getByRole('heading', { name: 'Settings', level: 1 })).toBeInTheDocument(),
		);
	});

	// TC-S-2: Storage section renders data
	it('TC-S-2: renders storage file count and total size', async () => {
		renderSettings();
		await waitFor(() => {
			expect(screen.getByText('5')).toBeInTheDocument(); // fileCount
			expect(screen.getByText('1.00 MB')).toBeInTheDocument(); // totalSizeBytes
		});
	});

	// TC-S-3: Remove All – confirm path
	it('TC-S-3: Remove All calls removeAllAppData, clears localStorage, and reloads on confirm', async () => {
		vi.mocked(TauriApi.removeAllAppData).mockResolvedValue(undefined);

		// Seed localStorage with keys that must be wiped on factory reset.
		localStorage.setItem('app.tabs', '[{"id":"1"}]');
		localStorage.setItem('app.statistics.granularity', 'week');

		renderSettings();

		// Wait for storage section to load so the Remove All button is rendered.
		await waitFor(() => screen.getByRole('button', { name: /Remove All/i }));

		const user = userEvent.setup();
		await user.click(screen.getByRole('button', { name: /Remove All/i }));

		// Confirm dialog should have been shown.
		expect(confirmDialog).toHaveBeenCalledOnce();
		expect(vi.mocked(confirmDialog).mock.calls[0][0]).toMatch(/Remove all app data/i);

		// Backend wipe called.
		await waitFor(() => expect(TauriApi.removeAllAppData).toHaveBeenCalledOnce());

		// localStorage must have been cleared — seeded keys are gone.
		expect(localStorage.getItem('app.tabs')).toBeNull();
		expect(localStorage.getItem('app.statistics.granularity')).toBeNull();

		// Window reloaded so in-memory React state is fully reset.
		expect(reloadMock).toHaveBeenCalledOnce();
	});

	// TC-S-4: Remove All – cancel path
	it('TC-S-4: Remove All does nothing when the user cancels the dialog', async () => {
		vi.mocked(confirmDialog).mockResolvedValue(false);

		localStorage.setItem('app.tabs', 'should-survive');

		renderSettings();
		await waitFor(() => screen.getByRole('button', { name: /Remove All/i }));

		const user = userEvent.setup();
		await user.click(screen.getByRole('button', { name: /Remove All/i }));

		await waitFor(() => expect(confirmDialog).toHaveBeenCalledOnce());
		expect(TauriApi.removeAllAppData).not.toHaveBeenCalled();
		// localStorage was NOT cleared — key survives.
		expect(localStorage.getItem('app.tabs')).toBe('should-survive');
		expect(reloadMock).not.toHaveBeenCalled();
	});

	// TC-S-5: Remove All – backend error shows message, no reload
	it('TC-S-5: Remove All shows an error message when the backend throws', async () => {
		vi.mocked(TauriApi.removeAllAppData).mockRejectedValue(new Error('disk full'));

		localStorage.setItem('app.tabs', 'should-survive-on-error');

		renderSettings();
		await waitFor(() => screen.getByRole('button', { name: /Remove All/i }));

		const user = userEvent.setup();
		await user.click(screen.getByRole('button', { name: /Remove All/i }));

		await waitFor(() => expect(screen.getByText(/disk full/i)).toBeInTheDocument());

		// On error: localStorage was NOT cleared, window was NOT reloaded.
		expect(localStorage.getItem('app.tabs')).toBe('should-survive-on-error');
		expect(reloadMock).not.toHaveBeenCalled();
	});

	// TC-S-6: Clear receipt files – confirm path
	it('TC-S-6: Clear receipt files removes images/staging and shows success message', async () => {
		vi.mocked(TauriApi.removeReceiptImages).mockResolvedValue(undefined);
		vi.mocked(TauriApi.clearReceiptStaging).mockResolvedValue(undefined);
		// Keep returning MOCK_STORAGE on all calls so the Clear button stays visible
		// throughout (the default from beforeEach covers this).

		renderSettings();

		// Wait for storage section to render the Clear button
		// (receiptImagesBytes + stagingBytes > 0 in MOCK_STORAGE).
		const clearBtn = await screen.findByRole('button', { name: /^Clear$/ });
		const user = userEvent.setup();
		await user.click(clearBtn);

		expect(confirmDialog).toHaveBeenCalledOnce();
		expect(vi.mocked(confirmDialog).mock.calls[0][0]).toMatch(/Remove all receipt images/i);

		await waitFor(() => {
			expect(TauriApi.removeReceiptImages).toHaveBeenCalledOnce();
			expect(TauriApi.clearReceiptStaging).toHaveBeenCalledOnce();
		});

		// Storage refreshed and success message shown.
		await waitFor(() =>
			expect(screen.getByText('Receipt files cleared.')).toBeInTheDocument(),
		);

		// Storage must have been re-fetched after the clear (2 on mount + 1 after clear = ≥3).
		expect(vi.mocked(TauriApi.getStorageInfo).mock.calls.length).toBeGreaterThanOrEqual(3);
	});

	// TC-S-7: Clear receipt files – cancel path
	it('TC-S-7: Clear receipt files does nothing when the user cancels the dialog', async () => {
		vi.mocked(confirmDialog).mockResolvedValue(false);

		renderSettings();
		const clearBtn = await screen.findByRole('button', { name: /^Clear$/ });

		const user = userEvent.setup();
		await user.click(clearBtn);

		await waitFor(() => expect(confirmDialog).toHaveBeenCalledOnce());
		expect(TauriApi.removeReceiptImages).not.toHaveBeenCalled();
		expect(TauriApi.clearReceiptStaging).not.toHaveBeenCalled();
	});

	// TC-S-8: Refresh button re-fetches storage info
	it('TC-S-8: Refresh button triggers an additional storage info reload', async () => {
		renderSettings();

		// Wait for initial load to complete (file count tile appears).
		await screen.findByText('5');

		const callsBefore = vi.mocked(TauriApi.getStorageInfo).mock.calls.length;

		const user = userEvent.setup();
		await user.click(screen.getByRole('button', { name: /^Refresh$/i }));

		// At least one more call should have been made.
		await waitFor(() =>
			expect(TauriApi.getStorageInfo).toHaveBeenCalledTimes(callsBefore + 1),
		);
	});

	// TC-S-9: Error banner can be dismissed
	it('TC-S-9: error banner shows a Dismiss button that hides it', async () => {
		vi.mocked(TauriApi.removeAllAppData).mockRejectedValue(new Error('backend error'));

		renderSettings();
		await waitFor(() => screen.getByRole('button', { name: /Remove All/i }));

		const user = userEvent.setup();
		await user.click(screen.getByRole('button', { name: /Remove All/i }));

		await waitFor(() => screen.getByText(/backend error/i));
		await user.click(screen.getByRole('button', { name: /Dismiss/i }));

		await waitFor(() =>
			expect(screen.queryByText(/backend error/i)).not.toBeInTheDocument(),
		);
	});

	// TC-S-CACHE-1: Refresh Cache button is visible
	it('TC-S-CACHE-1: Refresh Cache button is visible in the actions section', async () => {
		renderSettings();
		const btn = await screen.findByRole('button', { name: /Refresh Cache/i });
		expect(btn).toBeInTheDocument();
		expect(btn).not.toBeDisabled();
	});

	// TC-S-CACHE-2: Refresh Cache calls forceReload
	it('TC-S-CACHE-2: clicking Refresh Cache calls forceReload on the receipt cache', async () => {
		const forceReload = vi.fn().mockResolvedValue(undefined);
		vi.mocked(useReceiptCache).mockReturnValue({
			receipts: [],
			isInitialLoading: false,
			getReceipt: vi.fn(),
			applyOptimistic: vi.fn(),
			applyUpdate: vi.fn(),
			applyOptimisticDelete: vi.fn(),
			forceReload,
		});

		renderSettings();
		const btn = await screen.findByRole('button', { name: /Refresh Cache/i });

		const user = userEvent.setup();
		await user.click(btn);

		await waitFor(() => expect(forceReload).toHaveBeenCalledOnce());
	});

	// TC-S-CACHE-3: Refresh Cache shows success message
	it('TC-S-CACHE-3: Refresh Cache shows a success message after forceReload resolves', async () => {
		renderSettings();
		const btn = await screen.findByRole('button', { name: /Refresh Cache/i });

		const user = userEvent.setup();
		await user.click(btn);

		await waitFor(() =>
			expect(screen.getByText('Cache refreshed successfully.')).toBeInTheDocument(),
		);
	});

	// TC-S-CACHE-4: Refresh Cache shows error message on failure
	it('TC-S-CACHE-4: Refresh Cache shows an error message when forceReload rejects', async () => {
		const forceReload = vi.fn().mockRejectedValue(new Error('cache error'));
		vi.mocked(useReceiptCache).mockReturnValue({
			receipts: [],
			isInitialLoading: false,
			getReceipt: vi.fn(),
			applyOptimistic: vi.fn(),
			applyUpdate: vi.fn(),
			applyOptimisticDelete: vi.fn(),
			forceReload,
		});

		renderSettings();
		const btn = await screen.findByRole('button', { name: /Refresh Cache/i });

		const user = userEvent.setup();
		await user.click(btn);

		await waitFor(() =>
			expect(screen.getByText(/cache error/i)).toBeInTheDocument(),
		);
	});
});
