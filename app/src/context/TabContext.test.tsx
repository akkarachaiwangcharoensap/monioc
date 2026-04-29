/**
 * Unit tests for TabContext additions:
 * - same-path no-op in openTab
 * - navigateBack / navigateForward exposed on the context value
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { useTabContext, TabProvider } from './TabContext';

// ── Mocks for context dependencies ──────────────────────────────────────────

vi.mock('./TabMemoryContext', () => ({
	useTabMemory: () => ({
		getTabMemory: () => ({ jobKeys: {} }),
		setTabMemory: vi.fn(),
		evictTabMemory: vi.fn(),
		findTabByReceiptId: () => null,
		acquireWriteLock: vi.fn(),
		releaseWriteLock: vi.fn(),
	}),
}));

vi.mock('./JobStatusContext', () => ({
	useJobStatus: () => ({ jobs: new Map() }),
}));

vi.mock('./ReceiptCacheContext', () => ({
	useReceiptCache: () => ({ getReceipt: vi.fn() }),
}));

vi.mock('../services/api', () => ({
	TauriApi: { cancelJob: vi.fn() },
}));

function wrapper({ children }: { children: React.ReactNode }) {
	return (
		<MemoryRouter initialEntries={['/']}>
			<TabProvider>{children}</TabProvider>
		</MemoryRouter>
	);
}

describe('TabContext', () => {
	beforeEach(() => {
		localStorage.clear();
	});

	it('exposes navigateBack and navigateForward functions', () => {
		const { result } = renderHook(() => useTabContext(), { wrapper });
		expect(typeof result.current.navigateBack).toBe('function');
		expect(typeof result.current.navigateForward).toBe('function');
	});

	it('openTab is a no-op when the path matches the active tab', () => {
		const { result } = renderHook(() => useTabContext(), { wrapper });
		// Initial state: dashboard tab at '/'
		const initialTabs = result.current.tabs.length;
		act(() => { result.current.openTab('/'); });
		// Should not create a new tab
		expect(result.current.tabs.length).toBe(initialTabs);
	});

	it('openTab creates a new tab for a different path', () => {
		const { result } = renderHook(() => useTabContext(), { wrapper });
		const initialTabs = result.current.tabs.length;
		act(() => { result.current.openTab('/statistics'); });
		expect(result.current.tabs.length).toBe(initialTabs + 1);
		expect(result.current.activeTabId).toBe('/statistics');
	});

	it('replaceCurrentTab updates the active tab path in-place without adding a new tab', () => {
		const { result } = renderHook(() => useTabContext(), { wrapper });
		const initialCount = result.current.tabs.length;
		act(() => { result.current.replaceCurrentTab('/meat'); });
		// Tab count must stay the same — replace, not add
		expect(result.current.tabs.length).toBe(initialCount);
		// Active tab path must now be the new route
		const active = result.current.tabs.find((t) => t.id === result.current.activeTabId);
		expect(active?.path).toBe('/meat');
	});

	it('replaceCurrentTab returns false for a normal in-place replacement', () => {
		const { result } = renderHook(() => useTabContext(), { wrapper });
		let returned = true;
		act(() => { returned = result.current.replaceCurrentTab('/statistics'); });
		// false means "I replaced the tab; caller must still call navigate()"
		expect(returned).toBe(false);
	});
});
