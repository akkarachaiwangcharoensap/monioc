/**
 * Unit tests for ImageLibraryContext / addImages.
 *
 * Key behaviours tested:
 *  1. Placeholders appear immediately for genuinely-new paths.
 *  2. Placeholders are NOT shown for paths already visible in the inbox
 *     (receiptId == null) — prevents duplicate flash on reupload.
 *  3. Successful uploads replace the placeholder with the real entry.
 *  4. Failed uploads remove their placeholder, leaving the list clean.
 *  5. The Rust layer now returns the existing entry for duplicate paths,
 *     so the duplicate entry is merged in-place (no double rendering).
 *  6. fetchLibrary (via library:changed event) preserves in-flight
 *     placeholder entries and doesn't wipe them prematurely.
 *  7. clearLibrary resets state to empty.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import React from 'react';
import { ImageLibraryProvider, useImageLibrary } from './ImageLibraryContext';
import type { ImageLibraryEntry } from '../types';

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Capture the library:changed listener so tests can trigger it manually.
let eventListeners: Map<string, (() => void)[]> = new Map();

vi.mock('@tauri-apps/api/event', () => ({
	listen: vi.fn((event: string, handler: () => void) => {
		const arr = eventListeners.get(event) ?? [];
		arr.push(handler);
		eventListeners.set(event, arr);
		// Return a Promise<unlisten fn> just like the real API.
		return Promise.resolve(() => {
			const handlers = eventListeners.get(event) ?? [];
			eventListeners.set(event, handlers.filter((h) => h !== handler));
		});
	}),
}));

// Mock TauriApi methods used by ImageLibraryContext.
const mockGetImageLibrary = vi.fn<() => Promise<ImageLibraryEntry[]>>();
const mockAddImagesToLibrary = vi.fn<(paths: string[]) => Promise<ImageLibraryEntry[]>>();
const mockRemoveFromLibrary = vi.fn<(id: number) => Promise<void>>();
const mockClearLibrary = vi.fn<() => Promise<void>>();
const mockLinkImageToReceipt = vi.fn<(id: number, receiptId: number) => Promise<void>>();
const mockUpdateLibraryEntryStaging = vi.fn<(id: number, stagingPath: string | null) => Promise<void>>();

vi.mock('../services/api', () => ({
	TauriApi: {
		getImageLibrary: (...args: Parameters<typeof mockGetImageLibrary>) =>
			mockGetImageLibrary(...args),
		addImagesToLibrary: (...args: Parameters<typeof mockAddImagesToLibrary>) =>
			mockAddImagesToLibrary(...args),
		removeFromLibrary: (...args: Parameters<typeof mockRemoveFromLibrary>) =>
			mockRemoveFromLibrary(...args),
		clearLibrary: (...args: Parameters<typeof mockClearLibrary>) =>
			mockClearLibrary(...args),
		linkImageToReceipt: (...args: Parameters<typeof mockLinkImageToReceipt>) =>
			mockLinkImageToReceipt(...args),
		updateLibraryEntryStaging: (...args: Parameters<typeof mockUpdateLibraryEntryStaging>) =>
			mockUpdateLibraryEntryStaging(...args),
	},
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEntry(
	overrides: Partial<ImageLibraryEntry> & { id: number; filePath: string },
): ImageLibraryEntry {
	return {
		addedAt: '2024-01-01T00:00:00Z',
		thumbnailPath: null,
		receiptId: null,
		stagingPath: null,
		...overrides,
	};
}

function makeWrapper() {
	return function Wrapper({ children }: { children: React.ReactNode }) {
		return <ImageLibraryProvider>{children}</ImageLibraryProvider>;
	};
}

async function renderLibrary() {
	mockGetImageLibrary.mockResolvedValueOnce([]);
	const { result } = renderHook(() => useImageLibrary(), {
		wrapper: makeWrapper(),
	});
	// Wait for initial fetch to complete.
	await act(async () => {
		await Promise.resolve();
	});
	return result;
}

// Emit a library:changed event (simulates the Rust backend notification).
async function emitLibraryChanged() {
	const handlers = eventListeners.get('library:changed') ?? [];
	handlers.forEach((h) => h());
	// Flush timers for the 50ms debounce + await any pending microtasks.
	await vi.runAllTimersAsync();
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
	vi.useFakeTimers();
	eventListeners = new Map();
	vi.clearAllMocks();
});

afterEach(() => {
	vi.useRealTimers();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ImageLibraryContext — initial load', () => {
	it('starts in loading state and resolves to the fetched list', async () => {
		const entry = makeEntry({ id: 1, filePath: '/a.jpg' });
		mockGetImageLibrary.mockResolvedValueOnce([entry]);

		const { result } = renderHook(() => useImageLibrary(), {
			wrapper: makeWrapper(),
		});

		expect(result.current.isLoading).toBe(true);

		await act(async () => {
			await Promise.resolve();
		});

		expect(result.current.isLoading).toBe(false);
		expect(result.current.images).toHaveLength(1);
		expect(result.current.images[0].filePath).toBe('/a.jpg');
	});
});

describe('ImageLibraryContext — addImages (first-time upload)', () => {
	it('adds placeholder shimmers immediately before upload resolves', async () => {
		const result = await renderLibrary();

		const real = makeEntry({ id: 1, filePath: '/a.jpg', thumbnailPath: '/t/a.jpg' });

		// Don't resolve right away — let us check intermediate state.
		let resolveUpload!: (v: ImageLibraryEntry[]) => void;
		mockAddImagesToLibrary.mockReturnValueOnce(
			new Promise<ImageLibraryEntry[]>((res) => { resolveUpload = res; }),
		);

		// Start addImages without awaiting — we want to inspect mid-flight state.
		let addPromise!: Promise<ImageLibraryEntry[]>;
		act(() => { addPromise = result.current.addImages(['/a.jpg']); });

		// Placeholder (id < 0) should be in the list already.
		expect(result.current.images.some((e) => e.id < 0 && e.filePath === '/a.jpg')).toBe(true);

		// Resolve the upload.
		await act(async () => {
			resolveUpload([real]);
			await addPromise;
		});

		// Placeholder should be replaced with the real entry.
		expect(result.current.images.every((e) => e.id >= 0)).toBe(true);
		expect(result.current.images[0].thumbnailPath).toBe('/t/a.jpg');
	});

	it('returns the new entry from the resolved promise', async () => {
		const result = await renderLibrary();
		const real = makeEntry({ id: 2, filePath: '/b.jpg' });
		mockAddImagesToLibrary.mockResolvedValueOnce([real]);

		let entries!: ImageLibraryEntry[];
		await act(async () => {
			entries = await result.current.addImages(['/b.jpg']);
		});

		expect(entries).toHaveLength(1);
		expect(entries[0].id).toBe(2);
	});

	it('adds placeholder shimmers for ALL paths before any upload starts', async () => {
		const result = await renderLibrary();

		let resolveA!: (v: ImageLibraryEntry[]) => void;
		let resolveB!: (v: ImageLibraryEntry[]) => void;
		let resolveC!: (v: ImageLibraryEntry[]) => void;
		mockAddImagesToLibrary
			.mockReturnValueOnce(new Promise<ImageLibraryEntry[]>((r) => { resolveA = r; }))
			.mockReturnValueOnce(new Promise<ImageLibraryEntry[]>((r) => { resolveB = r; }))
			.mockReturnValueOnce(new Promise<ImageLibraryEntry[]>((r) => { resolveC = r; }));

		let addPromise!: Promise<ImageLibraryEntry[]>;
		act(() => { addPromise = result.current.addImages(['/a.jpg', '/b.jpg', '/c.jpg']); });

		// All three shimmers must appear immediately.
		const placeholders = result.current.images.filter((e) => e.id < 0);
		expect(placeholders).toHaveLength(3);
		expect(placeholders.map((e) => e.filePath).sort()).toEqual(['/a.jpg', '/b.jpg', '/c.jpg']);

		// Resolve each one and verify count goes down.
		await act(async () => {
			resolveA([makeEntry({ id: 1, filePath: '/a.jpg' })]);
			await Promise.resolve();
		});
		expect(result.current.images.filter((e) => e.id < 0)).toHaveLength(2);

		await act(async () => {
			resolveB([makeEntry({ id: 2, filePath: '/b.jpg' })]);
			await Promise.resolve();
		});
		expect(result.current.images.filter((e) => e.id < 0)).toHaveLength(1);

		await act(async () => {
			resolveC([makeEntry({ id: 3, filePath: '/c.jpg' })]);
			await addPromise;
		});
		expect(result.current.images.filter((e) => e.id < 0)).toHaveLength(0);
		expect(result.current.images).toHaveLength(3);
	});

	it('removes placeholder when upload fails', async () => {
		const result = await renderLibrary();
		mockAddImagesToLibrary.mockRejectedValueOnce(new Error('Network error'));

		await act(async () => {
			await result.current.addImages(['/fail.jpg']);
		});

		expect(result.current.images).toHaveLength(0);
	});

	it('removes placeholder when Rust returns empty array (unexpected)', async () => {
		const result = await renderLibrary();
		mockAddImagesToLibrary.mockResolvedValueOnce([]);

		await act(async () => {
			await result.current.addImages(['/empty.jpg']);
		});

		expect(result.current.images).toHaveLength(0);
	});
});

describe('ImageLibraryContext — addImages (reupload / deduplication)', () => {
	it('does NOT add a placeholder when path is already in the inbox (receiptId=null)', async () => {
		// Start with the entry already in state.
		const existing = makeEntry({ id: 5, filePath: '/a.jpg', receiptId: null });
		mockGetImageLibrary.mockResolvedValueOnce([existing]);

		const { result } = renderHook(() => useImageLibrary(), {
			wrapper: makeWrapper(),
		});
		await act(async () => { await Promise.resolve(); });

		// Rust returns the existing entry (receiptId=null) because of dedup fix.
		mockAddImagesToLibrary.mockResolvedValueOnce([existing]);

		await act(async () => {
			await result.current.addImages(['/a.jpg']);
		});

		// Should still be just one entry — no duplicate.
		expect(result.current.images).toHaveLength(1);
		expect(result.current.images[0].id).toBe(5);
	});

	it('updates in-place when Rust returns an existing entry by id', async () => {
		const existing = makeEntry({ id: 7, filePath: '/x.jpg', receiptId: null });
		mockGetImageLibrary.mockResolvedValueOnce([existing]);

		const { result } = renderHook(() => useImageLibrary(), {
			wrapper: makeWrapper(),
		});
		await act(async () => { await Promise.resolve(); });

		const updated = { ...existing, thumbnailPath: '/t/x.jpg' };
		mockAddImagesToLibrary.mockResolvedValueOnce([updated]);

		await act(async () => {
			await result.current.addImages(['/x.jpg']);
		});

		expect(result.current.images).toHaveLength(1);
		expect(result.current.images[0].thumbnailPath).toBe('/t/x.jpg');
	});

	it('shows a new placeholder when re-adding a path that was linked to a receipt', async () => {
		// Path was scanned → receiptId set → filtered out of inbox.
		const linked = makeEntry({ id: 10, filePath: '/linked.jpg', receiptId: 99 });
		mockGetImageLibrary.mockResolvedValueOnce([linked]);

		const { result } = renderHook(() => useImageLibrary(), {
			wrapper: makeWrapper(),
		});
		await act(async () => { await Promise.resolve(); });

		// User picks the same file again — Rust returns the same entry with receiptId.
		let resolveUpload!: (v: ImageLibraryEntry[]) => void;
		mockAddImagesToLibrary.mockReturnValueOnce(
			new Promise<ImageLibraryEntry[]>((r) => { resolveUpload = r; }),
		);

		let addPromise!: Promise<ImageLibraryEntry[]>;
		act(() => { addPromise = result.current.addImages(['/linked.jpg']); });

		// A placeholder should appear (path is NOT in the inbox with receiptId=null).
		expect(result.current.images.some((e) => e.id < 0)).toBe(true);

		await act(async () => {
			resolveUpload([linked]);
			await addPromise;
		});

		// Placeholder removed; existing linked entry still there.
		expect(result.current.images.filter((e) => e.id < 0)).toHaveLength(0);
	});

	it('handles mix of new and already-in-inbox paths correctly', async () => {
		const inInbox = makeEntry({ id: 1, filePath: '/existing.jpg', receiptId: null });
		mockGetImageLibrary.mockResolvedValueOnce([inInbox]);

		const { result } = renderHook(() => useImageLibrary(), {
			wrapper: makeWrapper(),
		});
		await act(async () => { await Promise.resolve(); });

		const newEntry = makeEntry({ id: 2, filePath: '/new.jpg' });
		mockAddImagesToLibrary
			.mockResolvedValueOnce([inInbox])  // existing path returns existing entry
			.mockResolvedValueOnce([newEntry]); // new path returns new entry

		await act(async () => {
			await result.current.addImages(['/existing.jpg', '/new.jpg']);
		});

		// No duplicates — should be exactly 2 unique entries.
		expect(result.current.images).toHaveLength(2);
		const ids = result.current.images.map((e) => e.id).sort((a, b) => a - b);
		expect(ids).toEqual([1, 2]);
	});
});

describe('ImageLibraryContext — library:changed event (fetchLibrary)', () => {
	it('preserves in-flight placeholders when library:changed fires', async () => {
		const result = await renderLibrary();

		let resolveUpload!: (v: ImageLibraryEntry[]) => void;
		mockAddImagesToLibrary.mockReturnValueOnce(
			new Promise<ImageLibraryEntry[]>((r) => { resolveUpload = r; }),
		);

		let addPromise!: Promise<ImageLibraryEntry[]>;
		act(() => { addPromise = result.current.addImages(['/a.jpg']); });

		// Placeholder exists.
		expect(result.current.images.some((e) => e.id < 0)).toBe(true);

		// Backend fires library:changed (e.g. another image was processed).
		mockGetImageLibrary.mockResolvedValueOnce([]);
		await act(async () => {
			await emitLibraryChanged();
		});

		// Placeholder must still be present after the re-fetch.
		expect(result.current.images.some((e) => e.id < 0 && e.filePath === '/a.jpg')).toBe(true);

		// Complete the upload.
		await act(async () => {
			resolveUpload([makeEntry({ id: 1, filePath: '/a.jpg' })]);
			await addPromise;
		});

		expect(result.current.images.filter((e) => e.id < 0)).toHaveLength(0);
	});

	it('refreshes the list when no uploads are in flight', async () => {
		const result = await renderLibrary();

		const entries = [makeEntry({ id: 1, filePath: '/a.jpg' })];
		mockGetImageLibrary.mockResolvedValueOnce(entries);

		await act(async () => {
			await emitLibraryChanged();
		});

		expect(result.current.images).toHaveLength(1);
	});

	it('coalesces rapid library:changed events via 50ms debounce', async () => {
		await renderLibrary();
		// Fire the event 3 times in quick succession.
		mockGetImageLibrary.mockResolvedValue([makeEntry({ id: 1, filePath: '/a.jpg' })]);
		const handlers = eventListeners.get('library:changed') ?? [];

		act(() => {
			handlers.forEach((h) => h()); // fire 1
			handlers.forEach((h) => h()); // fire 2
			handlers.forEach((h) => h()); // fire 3
		});

		await act(async () => { await vi.runAllTimersAsync(); });

		// getImageLibrary should only be called once (second call from mount, debounce fired once).
		// Mount resolves with [] (first call), so total calls = 1 (mount) + 1 (debounce).
		expect(mockGetImageLibrary).toHaveBeenCalledTimes(2);
	});
});

describe('ImageLibraryContext — clearLibrary', () => {
	it('resets images to empty after clearing', async () => {
		const entry = makeEntry({ id: 1, filePath: '/a.jpg' });
		mockGetImageLibrary.mockResolvedValueOnce([entry]);

		const { result } = renderHook(() => useImageLibrary(), {
			wrapper: makeWrapper(),
		});
		await act(async () => { await Promise.resolve(); });

		mockClearLibrary.mockResolvedValueOnce(undefined);
		await act(async () => { await result.current.clearLibrary(); });

		expect(result.current.images).toHaveLength(0);
	});
});
