import React, { createContext, useContext, useCallback, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTabMemory } from './TabMemoryContext';
import { useJobStatus } from './JobStatusContext';
import { TauriApi } from '../services/api';
import { useReceiptCache } from './ReceiptCacheContext';
import { ROUTES } from '../constants';
import type { JobStatus } from '../types';

// ── Types ─────────────────────────────────────────────────────────────────────

export type TabRole = 'new-scan' | 'viewer' | 'dashboard' | 'receipt-editor' | 'generic';

export interface Tab {
	/** Unique id — the pathname at time of creation (e.g. "/products/dairy"). */
	id: string;
	/** Full hash path (no #). */
	path: string;
	/** Human-readable label. */
	label: string;
	/** Semantic role — derived from path at tab-creation time. */
	tabRole: TabRole;
}

interface TabContextValue {
	tabs: Tab[];
	activeTabId: string | null;
	openTab: (path: string, label?: string) => void;
	closeTab: (id: string) => void;
	/**
	 * Switch the active tab to `id`. Returns `true` if the tab was found (and
	 * navigation fired), or `false` if no tab with that id exists (stale id).
	 * Use the return value when acting on an id that may have come from
	 * `findTabByReceiptId` (whose underlying TabMemory may reference a tab that
	 * was subsequently replaced).
	 */
	switchTab: (id: string) => boolean;
	reorderTabs: (fromIdx: number, toIdx: number) => void;

	/**
	 * Register a callback that fires synchronously when the tab with the given id
	 * is about to be closed (before navigation). Use this to set flags that the
	 * unmount cleanup can read to distinguish a close from a tab-switch.
	 * Return `false` from the handler to cancel the close.
	 * Returns an unregister function; call it in a cleanup effect.
	 */
	registerCloseInterceptor: (tabId: string, handler: () => boolean | void) => () => void;
	/**
	 * Replace the current tab in-place with a new path.
	 * Returns `true` when navigation was handled internally (e.g. receipt-identity
	 * dedup switched to an existing tab). In that case the caller must NOT call
	 * `navigate()` separately — doing so would undo the redirect.
	 * Returns `false` in the normal case; the caller is responsible for navigation.
	 */
	replaceCurrentTab: (path: string, label?: string) => boolean;
	/** Set of tab IDs with in-progress background work (e.g. scanning). */
	workingTabs: ReadonlySet<string>;
	/** Mark a tab as having (or no longer having) background work. */
	setTabWorking: (tabId: string, isWorking: boolean) => void;
	/** Non-null when a close action is waiting for the user to confirm. */
	pendingCloseConfirm: { tabId: string; tabLabel: string } | null;
	/** Call from the confirmation dialog's “OK” button. */
	confirmClose: () => void;
	/** Call from the confirmation dialog’s “Cancel” button. */
	cancelClose: () => void;
	/**
	 * Opens (or switches to) the /receipts/editor tab and appends the given
	 * receipt(s) to its workspace. If a receipt is already loaded, it is not
	 * duplicated.
	 */
	openReceiptEditorTab: (receiptIds: number | number[], label?: string) => void;
	/** Navigate back in browser history (sets isHistoryNavigation flag). */
	navigateBack: () => void;
	/** Navigate forward in browser history (sets isHistoryNavigation flag). */
	navigateForward: () => void;
}

const TABS_STORAGE_KEY = 'app.tabs';
const ACTIVE_TAB_KEY = 'app.tabs.active';
const TERMINAL_PHASES = new Set(['done', 'error', 'cancelled']);

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extracts a single receiptId from a receipt-scanner URL
 * (e.g. "/receipt-scanner?receiptId=42"). Returns null for paths that use
 * `receiptIds` (plural / multi-receipt) or have no receipt param at all.
 */
function parseReceiptIdFromPath(path: string): number | null {
	const qIdx = path.indexOf('?');
	if (qIdx === -1) return null;
	const params = new URLSearchParams(path.slice(qIdx + 1));
	const val = params.get('receiptId');
	if (!val) return null;
	const id = Number(val);
	return Number.isFinite(id) && id > 0 ? id : null;
}

// ── Label derivation ──────────────────────────────────────────────────────────

const ROUTE_LABELS: Record<string, string> = {
	'/': 'Dashboard',
	'/grocery': 'Grocery',
	'/products': 'Prices',
	'/receipt-scanner': 'Scan Receipt',
	'/receipt-scanner/new': 'New Scan',
	'/receipts': 'Receipts',
	'/receipts/editor': 'Receipts Editor',
	'/settings': 'Settings',
	'/categories': 'Categories',
	'/settings/categories': 'Categories',
	'/backup': 'Backup',
	'/statistics': 'Statistics',
};

/** Derive a semantic tab role from a path. */
function roleForPath(path: string): TabRole {
	const pathname = path.split('?')[0];
	if (pathname === '/receipt-scanner/new') return 'new-scan';
	if (pathname === '/receipts/editor') return 'receipt-editor';
	if (pathname === '/') return 'dashboard';
	if (pathname === '/receipt-scanner' || pathname === '/receipt-scanner/') {
		const qIdx = path.indexOf('?');
		if (qIdx !== -1) {
			const params = new URLSearchParams(path.slice(qIdx + 1));
			if (params.has('receiptId')) return 'viewer';
		}
	}
	return 'generic';
}

function labelForPath(path: string): string {
	// Strip query string for route label lookup
	const pathname = path.split('?')[0];
	const exact = ROUTE_LABELS[pathname];
	if (exact) return exact;
	const segments = pathname.split('/').filter(Boolean);
	const last = segments[segments.length - 1] ?? 'Page';
	return decodeURIComponent(last).replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Persistence helpers ───────────────────────────────────────────────────────

function loadTabs(): Tab[] {
	// Always start fresh with only the Dashboard tab — no stale tabs from a
	// previous session.  Clear any persisted tab state so that subsequent saves
	// within this session start from a clean baseline.
	try { localStorage.removeItem(TABS_STORAGE_KEY); } catch { /* ignore */ }
	try { localStorage.removeItem(ACTIVE_TAB_KEY); } catch { /* ignore */ }
	return [{ id: '/', path: '/', label: 'Dashboard', tabRole: 'dashboard' }];
}

function loadActiveTabId(): string | null {
	return '/';
}

function saveTabs(tabs: Tab[]): void {
	try { localStorage.setItem(TABS_STORAGE_KEY, JSON.stringify(tabs)); } catch { /* ignore */ }
}

function saveActiveTabId(id: string | null): void {
	try {
		if (id) localStorage.setItem(ACTIVE_TAB_KEY, id);
		else localStorage.removeItem(ACTIVE_TAB_KEY);
	} catch { /* ignore */ }
}

// ── Context ───────────────────────────────────────────────────────────────────

const TabContext = createContext<TabContextValue | null>(null);

export function useTabContext(): TabContextValue {
	const ctx = useContext(TabContext);
	if (!ctx) throw new Error('useTabContext must be used within TabProvider');
	return ctx;
}

export function TabProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
	const navigate = useNavigate();
	const location = useLocation();

	// Job-aware close: check for active jobs before closing.
	const { getTabMemory, setTabMemory, evictTabMemory, findTabByReceiptId, acquireWriteLock, releaseWriteLock } = useTabMemory();
	const { getReceipt } = useReceiptCache();
	const { jobs } = useJobStatus();
	// Store in refs so closeTab doesn't recreate on every job-status change.
	const jobsRef = useRef<ReadonlyMap<string, JobStatus>>(new Map());
	const getTabMemoryRef = useRef(getTabMemory);
	const setTabMemoryRef = useRef(setTabMemory);
	const evictTabMemoryRef = useRef(evictTabMemory);
	const findTabByReceiptIdRef = useRef(findTabByReceiptId);
	const acquireWriteLockRef = useRef(acquireWriteLock);
	const releaseWriteLockRef = useRef(releaseWriteLock);
	const getReceiptRef = useRef(getReceipt);
	jobsRef.current = jobs;
	getTabMemoryRef.current = getTabMemory;
	setTabMemoryRef.current = setTabMemory;
	evictTabMemoryRef.current = evictTabMemory;
	findTabByReceiptIdRef.current = findTabByReceiptId;
	acquireWriteLockRef.current = acquireWriteLock;
	releaseWriteLockRef.current = releaseWriteLock;
	getReceiptRef.current = getReceipt;

	// Flag that suppresses the location-sync effect during programmatic
	// back/forward navigation (where the location change is intentional and
	// should NOT create a new tab).
	const isHistoryNavigationRef = useRef(false);

	// Pending close waiting for React dialog confirmation.
	const [pendingCloseConfirm, setPendingCloseConfirm] = useState<{ tabId: string; tabLabel: string } | null>(null);

	// Close interceptors: callbacks fired synchronously before a tab is removed.
	const closeInterceptorsRef = useRef(new Map<string, () => boolean | void>());

	// Background work indicator — per-tab working state.
	const workingTabsRef = useRef<Set<string>>(new Set());
	const workingListenersRef = useRef(new Set<() => void>());
	const subscribeWorking = useCallback((listener: () => void) => {
		workingListenersRef.current.add(listener);
		return () => { workingListenersRef.current.delete(listener); };
	}, []);
	const workingSnapshotRef = useRef<ReadonlySet<string>>(new Set());
	const getWorkingSnapshot = useCallback(() => workingSnapshotRef.current, []);
	const workingTabs = useSyncExternalStore(subscribeWorking, getWorkingSnapshot);

	const setTabWorking = useCallback((tabId: string, isWorking: boolean) => {
		const set = workingTabsRef.current;
		if (isWorking ? set.has(tabId) : !set.has(tabId)) return;
		if (isWorking) set.add(tabId); else set.delete(tabId);
		workingSnapshotRef.current = new Set(set);
		for (const l of workingListenersRef.current) l();
	}, []);

	// Derive working-tab state from always-mounted contexts so it persists
	// across tab switches (the page-level effect clears on unmount).
	React.useEffect(() => {
		const set = workingTabsRef.current;
		const tabs = stateRef.current.tabs;
		let changed = false;
		for (const tab of tabs) {
			const memory = getTabMemory(tab.id);
			const hasWork = Object.values(memory.jobKeys).some((jkey) => {
				const s = jobs.get(jkey);
				return s != null && !TERMINAL_PHASES.has(s.phase);
			});
			const prev = set.has(tab.id);
			if (hasWork && !prev) { set.add(tab.id); changed = true; }
			else if (!hasWork && prev) { set.delete(tab.id); changed = true; }
		}
		if (changed) {
			workingSnapshotRef.current = new Set(set);
			for (const l of workingListenersRef.current) l();
		}
	}, [getTabMemory, jobs]);

	const registerCloseInterceptor = useCallback((tabId: string, handler: () => boolean | void) => {
		closeInterceptorsRef.current.set(tabId, handler);
		return () => { closeInterceptorsRef.current.delete(tabId); };
	}, []);

	// Mutable state stored in ref + external store pattern for perf
	const stateRef = useRef<{ tabs: Tab[]; activeTabId: string | null }>({
		tabs: loadTabs(),
		activeTabId: loadActiveTabId(),
	});
	const listenersRef = useRef(new Set<() => void>());

	const subscribe = useCallback((listener: () => void) => {
		listenersRef.current.add(listener);
		return () => { listenersRef.current.delete(listener); };
	}, []);
	const getSnapshot = useCallback(() => stateRef.current, []);

	const state = useSyncExternalStore(subscribe, getSnapshot);

	const emit = useCallback(() => {
		// Create new reference to trigger re-renders
		stateRef.current = { ...stateRef.current };
		for (const l of listenersRef.current) l();
	}, []);

	// Sync: when the location changes externally (back/forward, NavLink), ensure a tab exists.
	// Use pathname + search so receipt pages (/receipt-scanner?receiptId=1) get unique tabs.
	React.useEffect(() => {
		// If this location change was caused by navigateBack/navigateForward,
		// skip creating new tabs — just switch to the matching one if it exists,
		// or update the active tab's path in-place if no tab matches the new location
		// (e.g. the previous page was reached via replaceCurrentTab, so the original
		// path no longer has its own tab entry).
		if (isHistoryNavigationRef.current) {
			isHistoryNavigationRef.current = false;
			const path = location.pathname + location.search;
			const existing = stateRef.current.tabs.find((t) => t.path === path);
			if (existing) {
				if (stateRef.current.activeTabId !== existing.id) {
					stateRef.current.activeTabId = existing.id;
					saveActiveTabId(existing.id);
					emit();
				}
			} else {
				// No tab owns this path — we navigated back to a location that was
				// replaced in-place (e.g. Dashboard → replaceCurrentTab(Meat) →
				// back → /). Update the active tab to reflect the new location so
				// the tab bar stays in sync with the visible page.
				const { activeTabId, tabs } = stateRef.current;
				if (activeTabId) {
					const derivedLabel = labelForPath(path);
					const derivedRole = roleForPath(path);
					const next = tabs.map((t) =>
						t.id === activeTabId
							? { id: path, path, label: derivedLabel, tabRole: derivedRole }
							: t,
					);
					stateRef.current.tabs = next;
					stateRef.current.activeTabId = path;
					saveTabs(next);
					saveActiveTabId(path);
					emit();
				}
			}
			return;
		}
		const path = location.pathname + location.search;
		const { tabs } = stateRef.current;
		const existing = tabs.find((t) => t.path === path);
		if (existing) {
			if (stateRef.current.activeTabId !== existing.id) {
				stateRef.current.activeTabId = existing.id;
				saveActiveTabId(existing.id);
				emit();
			}
		} else {
			const newTab: Tab = { id: path, path, label: labelForPath(path), tabRole: roleForPath(path) };
			stateRef.current.tabs = [...tabs, newTab];
			stateRef.current.activeTabId = newTab.id;
			saveTabs(stateRef.current.tabs);
			saveActiveTabId(newTab.id);
			emit();
		}
	}, [location.pathname, location.search, emit]);

	const openTab = useCallback((path: string, label?: string) => {
		const { tabs, activeTabId } = stateRef.current;
		// Same-path no-op: if the active tab already points to this path, bail.
		const activeTab = tabs.find((t) => t.id === activeTabId);
		if (activeTab && activeTab.path === path) return;
		// Exact-path dedup: tab for this URL already exists — just switch to it.
		const existing = tabs.find((t) => t.path === path);
		if (existing) {
			stateRef.current.activeTabId = existing.id;
			saveActiveTabId(existing.id);
			emit();
			navigate(path);
			return;
		}
		// Receipt-identity dedup: if another tab already has this receipt open
		// (matched by selectedScanId in TabMemory), switch to it instead of
		// creating a duplicate tab that would own independent state.
		const receiptId = parseReceiptIdFromPath(path);
		if (receiptId !== null) {
			const ownerTabId = findTabByReceiptIdRef.current(receiptId);
			if (ownerTabId) {
				const ownerTab = tabs.find((t) => t.id === ownerTabId);
				if (ownerTab) {
					stateRef.current.activeTabId = ownerTabId;
					saveActiveTabId(ownerTabId);
					emit();
					navigate(ownerTab.path, { replace: true });
					return;
				}
				// ownerTabId came from stale TabMemory (tab was replaced, not closed).
				// Evict the dangling entry so future lookups don't hit it again.
				evictTabMemoryRef.current(ownerTabId);
			}
		}
		const newTab: Tab = { id: path, path, label: label ?? labelForPath(path), tabRole: roleForPath(path) };
		stateRef.current.tabs = [...tabs, newTab];
		stateRef.current.activeTabId = newTab.id;
		saveTabs(stateRef.current.tabs);
		saveActiveTabId(newTab.id);
		emit();
		navigate(path);
	}, [navigate, emit]);

	const closeTab = useCallback((id: string) => {
		// Job-aware close: warn if the tab has running scan/categorize jobs.
		const tabMemory = getTabMemoryRef.current(id);
		const activeJobKeys = Object.values(tabMemory.jobKeys);
		const hasActiveWork = activeJobKeys.some((jobKey) => {
			const s = jobsRef.current.get(jobKey);
			return s != null && !TERMINAL_PHASES.has(s.phase);
		});
		if (hasActiveWork) {
			// Show React confirmation dialog instead of native confirm().
			const tab = stateRef.current.tabs.find((t) => t.id === id);
			setPendingCloseConfirm({ tabId: id, tabLabel: tab?.label ?? 'this tab' });
			return;
		}
		executeClose(id);
	}, [navigate, emit]); // eslint-disable-line react-hooks/exhaustive-deps

	/** Actually remove the tab — shared by closeTab and confirmClose. */
	const executeClose = useCallback((id: string) => {
		const tabMemory = getTabMemoryRef.current(id);
		const activeJobKeys = Object.values(tabMemory.jobKeys);

		// Cancel all active jobs belonging to this tab.
		for (const jobKey of activeJobKeys) {
			const s = jobsRef.current.get(jobKey);
			if (s != null && !TERMINAL_PHASES.has(s.phase)) {
				void TauriApi.cancelJob(jobKey);
			}
		}

		// Notify the page mounted in this tab before navigation triggers unmount.
		// If the interceptor returns false, cancel the close.
		const interceptor = closeInterceptorsRef.current.get(id);
		if (interceptor && interceptor() === false) return;

		// Evict tab memory before removing the tab.
		evictTabMemoryRef.current(id);

		const { tabs, activeTabId } = stateRef.current;
		const idx = tabs.findIndex((t) => t.id === id);
		if (idx === -1) return;
		const next = tabs.filter((t) => t.id !== id);
		stateRef.current.tabs = next;
		saveTabs(next);

		if (activeTabId === id) {
			// Switch to the adjacent tab
			const newActive = next[Math.min(idx, next.length - 1)] ?? null;
			stateRef.current.activeTabId = newActive?.id ?? null;
			saveActiveTabId(newActive?.id ?? null);
			if (newActive) {
				navigate(newActive.path);
			} else {
				// All tabs closed → open the dashboard.
				const dash: Tab = { id: '/', path: '/', label: 'Dashboard', tabRole: 'dashboard' };
				stateRef.current.tabs = [dash];
				stateRef.current.activeTabId = dash.id;
				saveTabs([dash]);
				saveActiveTabId(dash.id);
				navigate('/');
			}
		}
		emit();
	}, [navigate, emit]);

	const confirmClose = useCallback(() => {
		if (!pendingCloseConfirm) return;
		const { tabId } = pendingCloseConfirm;
		setPendingCloseConfirm(null);
		executeClose(tabId);
	}, [pendingCloseConfirm, executeClose]);

	const cancelClose = useCallback(() => {
		setPendingCloseConfirm(null);
	}, []);

	const switchTab = useCallback((id: string): boolean => {
		const { tabs } = stateRef.current;
		const tab = tabs.find((t) => t.id === id);
		if (!tab) return false;
		stateRef.current.activeTabId = id;
		saveActiveTabId(id);
		emit();
		navigate(tab.path, { replace: true });
		return true;
	}, [navigate, emit]);

	const reorderTabs = useCallback((fromIdx: number, toIdx: number) => {
		const { tabs } = stateRef.current;
		if (fromIdx === toIdx || fromIdx < 0 || toIdx < 0 || fromIdx >= tabs.length || toIdx >= tabs.length) return;
		const next = [...tabs];
		const [moved] = next.splice(fromIdx, 1);
		next.splice(toIdx, 0, moved);
		stateRef.current = { ...stateRef.current, tabs: next };
		saveTabs(next);
		emit();
	}, [emit]);

	const replaceCurrentTab = useCallback((path: string, label?: string): boolean => {
		const { tabs, activeTabId } = stateRef.current;
		// Exact-path dedup: tab for this URL already exists — just switch to it.
		// Caller may still navigate to the same path, which is a benign no-op.
		const existing = tabs.find((t) => t.path === path);
		if (existing) {
			if (stateRef.current.activeTabId !== existing.id) {
				stateRef.current.activeTabId = existing.id;
				saveActiveTabId(existing.id);
				emit();
			}
			return false;
		}
		// Receipt-identity dedup: if another tab already has this receipt open
		// (matched by selectedScanId in TabMemory), switch to it instead of
		// replacing the current tab and creating a duplicate with independent state.
		// We navigate internally here; the caller must NOT navigate separately
		// (indicated by the `true` return value).
		const receiptId = parseReceiptIdFromPath(path);
		if (receiptId !== null) {
			const ownerTabId = findTabByReceiptIdRef.current(receiptId);
			if (ownerTabId) {
				const ownerTab = tabs.find((t) => t.id === ownerTabId);
				if (ownerTab) {
					stateRef.current.activeTabId = ownerTabId;
					saveActiveTabId(ownerTabId);
					emit();
					navigate(ownerTab.path, { replace: true });
					return true;
				}
				// ownerTabId came from stale TabMemory (tab was replaced, not closed).
				// Evict the dangling entry so future lookups don't hit it again.
				evictTabMemoryRef.current(ownerTabId);
			}
		}
		// Replace the currently active tab in-place
		const derivedLabel = label ?? labelForPath(path);
		const hasActiveTab = activeTabId && tabs.find((t) => t.id === activeTabId);
		if (!hasActiveTab) {
			const newTab: Tab = { id: path, path, label: derivedLabel, tabRole: roleForPath(path) };
			stateRef.current.tabs = [...tabs, newTab];
			stateRef.current.activeTabId = newTab.id;
			saveTabs(stateRef.current.tabs);
			saveActiveTabId(newTab.id);
			emit();
			return false;
		}
		const next = tabs.map((t) => t.id === activeTabId ? { id: path, path, label: derivedLabel, tabRole: roleForPath(path) } : t);
		stateRef.current.tabs = next;
		stateRef.current.activeTabId = path;
		saveTabs(next);
		saveActiveTabId(path);
		emit();
		// actual navigation delegated to the caller
		return false;
	}, [navigate, emit]);

	// ── openReceiptEditorTab ─────────────────────────────────────────────────
	const openReceiptEditorTab = useCallback((receiptIds: number | number[], label?: string) => {
		const ids = Array.isArray(receiptIds) ? receiptIds : [receiptIds];
		const editorPath = ROUTES.RECEIPTS_EDITOR;
		const { tabs } = stateRef.current;
		const existingTab = tabs.find((t) => t.path === editorPath);

		if (!existingTab) {
			// Always use the route label for the editor tab so the tab strip shows
			// "Receipts Editor" regardless of which receipt was opened.  The `label`
			// parameter is still accepted for callers that want to override, but no
			// current call site passes one.
			const derivedLabel = label ?? labelForPath(editorPath);
			const newTab: Tab = { id: editorPath, path: editorPath, label: derivedLabel, tabRole: 'receipt-editor' };
			stateRef.current.tabs = [...tabs, newTab];
			stateRef.current.activeTabId = newTab.id;
			saveTabs(stateRef.current.tabs);
			saveActiveTabId(newTab.id);
			// Initialise TabMemory with the provided receipt IDs.
			const wsItems = ids.map((id) => ({ key: String(id), scanId: id }));
			setTabMemoryRef.current(editorPath, (prev) => ({
				...prev,
				loadedReceiptIds: ids,
				// Dual-write: workspace fields
				workspaceItems: wsItems,
				activeWorkspaceKey: wsItems[0]?.key ?? null,
			}));
			for (const id of ids) acquireWriteLockRef.current(editorPath, id);
			emit();
			navigate(editorPath);
			return;
		}

		// Editor tab already exists — replace receipts instead of merging.
		const currentMemory = getTabMemoryRef.current(editorPath);
		const oldIds = currentMemory.loadedReceiptIds ?? [];
		// Release write locks held by the old receipts.
		for (const id of oldIds) releaseWriteLockRef.current(editorPath, id);
		// Replace with the new set of receipts and reset all scan-related state
		// so stale thumbnails / scan results from the previous session don't
		// bleed into the new one.
		const wsItems = ids.map((id) => ({ key: String(id), scanId: id }));
		setTabMemoryRef.current(editorPath, (prev) => ({
			...prev,
			loadedReceiptIds: ids,
			activeReceiptId: ids[0] ?? prev.activeReceiptId,
			workspaceItems: wsItems,
			activeWorkspaceKey: wsItems[0]?.key ?? null,
			// Reset scan state so re-opened receipts hydrate fresh.
			imageQueue: [],
			queueScanResults: {},
			queueEdits: {},
			jobKeys: {},
			queueErrors: {},
			selectedScanId: null,
			activeBasePath: null,
			receiptBasePathMap: {},
			cancellingPaths: new Set<string>(),
		}));
		for (const id of ids) acquireWriteLockRef.current(editorPath, id);
		// Switch to the editor tab.
		stateRef.current.activeTabId = existingTab.id;
		saveActiveTabId(existingTab.id);
		emit();
		navigate(editorPath);
	}, [navigate, emit]);

	const navigateBack = useCallback(() => {
		isHistoryNavigationRef.current = true;
		navigate(-1);
	}, [navigate]);

	const navigateForward = useCallback(() => {
		isHistoryNavigationRef.current = true;
		navigate(1);
	}, [navigate]);

	const value = useMemo<TabContextValue>(() => ({
		tabs: state.tabs,
		activeTabId: state.activeTabId,
		openTab,
		closeTab,
		switchTab,
		reorderTabs,
		replaceCurrentTab,
		registerCloseInterceptor,
		workingTabs,
		setTabWorking,
		pendingCloseConfirm,
		confirmClose,
		cancelClose,
		openReceiptEditorTab,
		navigateBack,
		navigateForward,
	}), [state, openTab, closeTab, switchTab, reorderTabs, replaceCurrentTab, registerCloseInterceptor, workingTabs, setTabWorking, pendingCloseConfirm, confirmClose, cancelClose, openReceiptEditorTab, navigateBack, navigateForward]);

	return <TabContext.Provider value={value}>{children}</TabContext.Provider>;
}
