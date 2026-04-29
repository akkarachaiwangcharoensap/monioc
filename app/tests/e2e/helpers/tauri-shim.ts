/**
 * Shared Tauri bridge shim for e2e tests running in browser (Chromium) mode.
 *
 * Because Playwright cannot run inside a real Tauri process, this helper
 * injects a minimal `window.__TAURI_INTERNALS__` stub before each page
 * navigation. The stub:
 *  - Returns configurable mock data for whitelisted `invoke` commands.
 *  - Handles `plugin:dialog|save`, `plugin:dialog|open`, and
 *    `plugin:dialog|message` (which confirm() and ask() route through) so
 *    BackupPage and SettingsPage dialogs resolve without a native OS window.
 *  - Silences `plugin:event|listen` / `unlisten` so drag-drop and
 *    event listeners in components mount without throwing.
 *  - Replaces `convertFileSrc` with an identity function (path → path).
 *  - Provides a numeric-ID `transformCallback` for event-bridge compat.
 */

import type { Page } from '@playwright/test';

export interface MockReceiptRecord {
  id: number;
  imagePath: string | null;
  processedImagePath: string | null;
  data: { rows: Array<{ name: string; price: number; category?: string }> };
  createdAt: string;
  updatedAt: string;
  displayName: string | null;
  purchaseDate?: string | null;
}

export interface MockStorageInfo {
  appDataDir: string;
  fileCount: number;
  totalSizeBytes: number;
  dbSizeBytes?: number;
  receiptImagesBytes?: number;
  stagingBytes?: number;
  otherBytes?: number;
}

export interface MockBackupInfo {
  path: string;
  sizeBytes: number;
  entryCount: number;
}

export interface MockCategoryRecord {
  name: string;
  color: string;
}

export interface MockGroceryCategory {
  id: number;
  name: string;
  count: number;
}

export interface MockGroceryLocation {
  id: number;
  location: string;
  city: string;
  province: string;
}

export interface MockGroceryProduct {
  id: number;
  name: string;
  category: string;
  unit: string;
}

export interface MockGroceryMetadata {
  totalRecords: number;
  totalProducts: number;
  totalLocations: number;
  totalCategories: number;
  dateMin: string;
  dateMax: string;
}

export interface MockImageLibraryEntry {
  id: number;
  filePath: string;
  addedAt: string;
  thumbnailPath: string | null;
  receiptId: number | null;
  stagingPath: string | null;
}

export interface MockGroceryPriceRecord {
  date: string;
  productName: string;
  category: string;
  pricePerUnit: number;
  unit: string;
  location: string;
  city: string;
  province: string;
}

export interface TauriShimOptions {
  /** Returned by `invoke('list_receipt_scans')`. Defaults to []. */
  receiptScans?: MockReceiptRecord[];
  /** Returned by `invoke('get_storage_info')`. */
  storageInfo?: MockStorageInfo;
  /**
   * Returned by `invoke('list_categories')`. Defaults to [].
   * Provide named categories with hex colors to test color-driven UI.
   */
  categories?: MockCategoryRecord[];
  /**
   * Path returned by the OS "Save" file picker dialog (`plugin:dialog|save`).
   * Pass `null` to simulate the user cancelling the dialog.
   * Default: `'/mock/backup/grocery-backup-20260320.gbak'`
   */
  dialogSavePath?: string | null;
  /**
   * Path returned by the OS "Open" file picker dialog (`plugin:dialog|open`).
   * Pass `null` to simulate the user cancelling the dialog.
   * Default: `'/mock/backup/existing-backup.gbak'`
   */
  dialogOpenPath?: string | null;
  /**
   * Boolean returned by confirmation / ask dialogs (`plugin:dialog|confirm`,
   * `plugin:dialog|ask`).  Default: `true` (user confirms).
   */
  dialogConfirm?: boolean;
  /**
   * Value returned by `invoke('export_backup')`.
   * Default: a plausible MockBackupInfo object.
   */
  backupInfo?: MockBackupInfo;
  /**
   * When true, `invoke('scan_receipt')` returns a pending promise that never
   * resolves. This keeps the page in `status === 'ocr'` so tests can fire
   * synthetic `scan-progress` events and observe the download-progress UI.
   * Default: false.
   */
  hangOnScanReceipt?: boolean;
  /** Returned by `invoke('get_grocery_metadata')`. */
  groceryMetadata?: MockGroceryMetadata;
  /** Returned by `invoke('list_grocery_categories')`. */
  groceryCategories?: MockGroceryCategory[];
  /** Returned by `invoke('list_grocery_locations')`. */
  groceryLocations?: MockGroceryLocation[];
  /**
   * Returned by `invoke('list_grocery_products')`, optionally filtered by
   * the `category` argument passed to the IPC call.
   */
  groceryProducts?: MockGroceryProduct[];
  /**
   * Returned by `invoke('list_grocery_prices')`, optionally filtered by
   * the `productName` argument passed to the IPC call.
   */
  groceryPrices?: MockGroceryPriceRecord[];
  /**
   * Result returned by `invoke('scan_receipt')` when `hangOnScanReceipt` is false.
   * Defaults to a minimal one-row receipt.
   */
  scanReceiptResult?: { data: { rows: Array<{ name: string; price: number; _id: string; category?: string }> }; processedImagePath?: string | null };
  /**
   * Returned by `invoke('save_receipt_scan')`.  Defaults to a new record with id=100.
   */
  savedReceiptRecord?: MockReceiptRecord;
  /**
   * Returned by `invoke('update_receipt_scan')`.  Defaults to the first record in
   * `receiptScans` (or a synthetic record with id matching the update arg if none).
   */
  updatedReceiptRecord?: MockReceiptRecord;
  /**
   * Returned by `invoke('infer_item_categories')`.  Defaults to an empty array (no
   * categories assigned) so pages don’t crash when the call resolves.
   */
  inferredCategories?: string[];  /**
   * Returned by `invoke('get_image_library')`.  Defaults to `[]`.
   * Pass entries with `id < 0` to simulate in-flight uploads (shimmer cards).
   * Pass entries with `receiptId != null` to simulate already-linked images.
   */
  imageLibrary?: MockImageLibraryEntry[];
}

const DEFAULT_STORAGE: MockStorageInfo = {
  appDataDir: '/test/appdata',
  fileCount: 0,
  totalSizeBytes: 0,
};

const DEFAULT_BACKUP_INFO: MockBackupInfo = {
  path: '/mock/backup/grocery-backup-20260320.gbak',
  sizeBytes: 45_056,
  entryCount: 12,
};

const DEFAULT_GROCERY_METADATA: MockGroceryMetadata = {
  totalRecords: 0,
  totalProducts: 0,
  totalLocations: 0,
  totalCategories: 0,
  dateMin: '2020-01',
  dateMax: '2024-12',
};

const DEFAULT_GROCERY_CATEGORIES: MockGroceryCategory[] = [];
const DEFAULT_GROCERY_LOCATIONS: MockGroceryLocation[] = [];

const DEFAULT_SCAN_RESULT = {
  data: { rows: [{ name: 'Mock Item', price: 9.99, _id: 'mock-id-1' }] },
  processedImagePath: null,
};

const DEFAULT_SAVED_RECORD: MockReceiptRecord = {
  id: 100,
  imagePath: '/mock/receipt.jpg',
  processedImagePath: null,
  data: { rows: [{ name: 'Mock Item', price: 9.99 }] },
  createdAt: '2026-04-01 12:00:00',
  updatedAt: '2026-04-01 12:00:00',
  displayName: 'Mock Receipt',
};

/**
 * Inject the Tauri shim into `page` **before** any navigation.
 * Must be called before `page.goto(...)`.
 */
export async function setupTauriShim(
  page: Page,
  options: TauriShimOptions = {},
): Promise<void> {
  const scans: unknown[] = options.receiptScans ?? [];
  const storage: unknown = options.storageInfo ?? DEFAULT_STORAGE;
  const categories: unknown[] = options.categories ?? [];
  const groceryMetadata: unknown = options.groceryMetadata ?? DEFAULT_GROCERY_METADATA;
  const groceryCategories: unknown[] = options.groceryCategories ?? DEFAULT_GROCERY_CATEGORIES;
  const groceryLocations: unknown[] = options.groceryLocations ?? DEFAULT_GROCERY_LOCATIONS;
  const groceryProducts: MockGroceryProduct[] = options.groceryProducts ?? [];
  const imageLibrary: MockImageLibraryEntry[] = options.imageLibrary ?? [];
  const groceryPrices: MockGroceryPriceRecord[] = options.groceryPrices ?? [];
  const scanReceiptResult: unknown = options.scanReceiptResult ?? DEFAULT_SCAN_RESULT;
  const savedReceiptRecord: unknown = options.savedReceiptRecord ?? DEFAULT_SAVED_RECORD;
  const updatedReceiptRecord: MockReceiptRecord | null = options.updatedReceiptRecord ?? null;
  const inferredCategories: string[] = options.inferredCategories ?? [];
  // Dialog responses — use explicit undefined-check so callers can pass null.
  const dialogSavePath: string | null =
    options.dialogSavePath !== undefined
      ? options.dialogSavePath
      : '/mock/backup/grocery-backup-20260320.gbak';
  const dialogOpenPath: string | null =
    options.dialogOpenPath !== undefined
      ? options.dialogOpenPath
      : '/mock/backup/existing-backup.gbak';
  const dialogConfirm: boolean = options.dialogConfirm !== undefined ? options.dialogConfirm : true;
  const backupInfo: unknown = options.backupInfo ?? DEFAULT_BACKUP_INFO;
  const hangOnScanReceipt: boolean = options.hangOnScanReceipt ?? false;

  await page.addInitScript(
    ({ scans, storage, categories, dialogSavePath, dialogOpenPath, dialogConfirm, backupInfo, hangOnScanReceipt, groceryMetadata, groceryCategories, groceryLocations, groceryProducts, groceryPrices, savedReceiptRecord, updatedReceiptRecord, imageLibrary }) => {
      // Dismiss the first-launch tutorial modal so it doesn't block test clicks.
      // In development mode, index.tsx uses removeItem() to wipe stale state on
      // every startup, which would clear this key before React reads it.
      // Intercept both clear() and removeItem() to re-apply keys that must survive.
      const _PROTECTED = new Set(['app.tutorial.seen', 'app.nav.collapsed']);
      const _origClear = window.localStorage.clear.bind(window.localStorage);
      window.localStorage.clear = () => {
        const collapsed = window.localStorage.getItem('app.nav.collapsed');
        _origClear();
        window.localStorage.setItem('app.tutorial.seen', '1');
        if (collapsed != null) window.localStorage.setItem('app.nav.collapsed', collapsed);
      };
      const _origRemoveItem = window.localStorage.removeItem.bind(window.localStorage);
      window.localStorage.removeItem = (key: string) => {
        if (_PROTECTED.has(key)) return;
        _origRemoveItem(key);
      };
      window.localStorage.setItem('app.tutorial.seen', '1');

      let _nextId = 1;

      /**
       * Callback registry: transformCallback() stores handlers here keyed by
       * their numeric ID so that plugin:event|listen can fire them later.
       */
      const _callbacks = new Map<number, (event: unknown) => void>();

      /**
       * Event listener registry: maps event name → array of callback IDs.
       * Populated by plugin:event|listen, consumed by window.__tauriEmitEvent.
       */
      const _eventListeners = new Map<string, number[]>();

      /**
       * Dynamic scan-hang control.  Initialized from the static option but
       * can be toggled at runtime via window.__tauriSetHangOnScan(true/false).
       * When true, scan_receipt fires queued+scanning events but never resolves,
       * keeping the UI in the "Scanning…" state.  Tests can later call
       * window.__tauriCompleteScan() to fire the done event for the last
       * hanging scan job.
       */
      let _hangOnScan = hangOnScanReceipt;
      /** Last hanging scan's metadata — used by __tauriCompleteScan. */
      let _pendingHangJob: { jobKey: string; record: MockReceiptRecord } | null = null;

      const invoke = async (cmd: string, args?: Record<string, unknown>): Promise<unknown> => {
        const fireEvent = (name: string, payload: unknown): void => {
          const ids = _eventListeners.get(name) ?? [];
          for (const cbId of ids) {
            const fn = _callbacks.get(cbId);
            if (fn) fn({ id: 0, event: name, payload });
          }
        };

        switch (cmd) {
          // ── Receipts ──────────────────────────────────────────────────
          case 'list_receipt_scans':
            return scans;
          case 'get_processing_statuses':
            return [];

          // ── Scanner ───────────────────────────────────────────────────
          case 'scan_receipt': {
            // Expose an invocation counter so tests can assert the scan was actually submitted.
            (window as unknown as Record<string, number>).__tauriScanReceiptCount =
              (((window as unknown as Record<string, number>).__tauriScanReceiptCount) ?? 0) + 1;
            // The real Rust backend uses imagePath as the job key string and fires
            // job:status events asynchronously while save happens inside the job.
            const jobKey = (args?.imagePath as string | undefined) ?? '/mock/receipt.jpg';
            // Determine which saved record to emit: rescans (receiptId provided) use
            // updatedReceiptRecord; new scans use savedReceiptRecord.
            const hasReceiptId = args?.receiptId != null;
            const completedRecord: MockReceiptRecord = (() => {
              if (hasReceiptId) {
                if (updatedReceiptRecord) return updatedReceiptRecord;
                const rid = args?.receiptId as number | undefined;
                const existing = (scans as MockReceiptRecord[]).find((s) => s.id === rid);
                if (existing) return { ...existing, updatedAt: new Date().toISOString() };
              }
              return savedReceiptRecord as MockReceiptRecord;
            })();

            if (_hangOnScan) {
              _pendingHangJob = { jobKey, record: completedRecord };
              fireEvent('job:status', { jobKey, phase: 'queued', record: null, error: null, seq: 0 });
              Promise.resolve().then(() => {
                fireEvent('job:status', { jobKey, phase: 'scanning', record: null, error: null, seq: 1 });
                fireEvent('scan-progress', 'Preparing image\u2026');
              });
              return new Promise(() => { /* never resolves */ });
            }

            // Non-hanging: fire queued → done via setTimeout so React event listeners
            // are registered before the events arrive.
            setTimeout(() => {
              fireEvent('job:status', { jobKey, phase: 'queued', record: null, error: null, seq: 0 });
              setTimeout(() => {
                fireEvent('job:status', { jobKey, phase: 'done', record: completedRecord, error: null, seq: 1 });
                fireEvent('receipt:saved', completedRecord);
              }, 0);
            }, 0);

            // Return the job key string — matching the Rust backend contract.
            return jobKey;
          }

          // ── DB write-backs ────────────────────────────────────────────
          case 'save_receipt_scan':
            fireEvent('receipt:saved', savedReceiptRecord);
            return savedReceiptRecord;
          case 'update_receipt_scan': {
            // Return the configured override, or find the matching scan in the list,
            // or synthesise a minimal record so the code doesn't throw.
            const result: MockReceiptRecord = (() => {
              if (updatedReceiptRecord) return updatedReceiptRecord;
              const id = (args?.id as number | undefined) ?? 0;
              const existing = (scans as MockReceiptRecord[]).find((s) => s.id === id);
              if (existing) return existing;
              return { ...savedReceiptRecord, id } as MockReceiptRecord;
            })();
            fireEvent('receipt:saved', result);
            return result;
          }
          case 'update_receipt_purchase_date': {
            const id = (args?.id as number | undefined) ?? 0;
            const existing = (scans as MockReceiptRecord[]).find((s) => s.id === id);
            if (existing) fireEvent('receipt:saved', { ...existing, purchaseDate: (args?.purchaseDate as string | null) ?? null });
            return null;
          }
          case 'update_receipt_created_at': {
            const id = (args?.id as number | undefined) ?? 0;
            const existing = (scans as MockReceiptRecord[]).find((s) => s.id === id);
            if (existing) fireEvent('receipt:saved', { ...existing, createdAt: String(args?.createdAt ?? existing.createdAt) });
            return null;
          }
          case 'rename_receipt_scan': {
            const id = (args?.id as number | undefined) ?? 0;
            const existing = (scans as MockReceiptRecord[]).find((s) => s.id === id);
            if (existing) fireEvent('receipt:saved', { ...existing, displayName: (args?.name as string | null) ?? null });
            return null;
          }
          case 'delete_receipt_scan': {
            const id = (args?.id as number | undefined) ?? 0;
            fireEvent('receipt:deleted', { id });
            return null;
          }

          // ── AI categorization ────────────────────────────
          case 'infer_item_categories': {
            // Real backend returns the receipt scan ID as a numeric string job key.
            // A non-numeric key would cause deriveScanStatuses to treat it as an
            // in-flight scan job (status='scanning'), hiding the result section.
            const catJobKey = String((args?.receiptId as number | undefined) ?? 0);
            const catRecord: MockReceiptRecord = (() => {
              // If the test supplied an explicit override, use it directly.
              if (updatedReceiptRecord) return updatedReceiptRecord;
              const rid = args?.receiptId as number | undefined;
              const existing = (scans as MockReceiptRecord[]).find((s) => s.id === rid);
              const baseRecord = existing ?? savedReceiptRecord as MockReceiptRecord;
              // Simulate the fixed Rust behaviour: apply_categories operates on the
              // caller-supplied data (args.data) rather than the stale DB snapshot.
              // This mirrors the Bug 2 fix in process_categorize (job_queue.rs).
              type FrontendRow = { name: string; price: number; category?: string; _id?: string };
              const frontendData = args?.data as { rows: FrontendRow[] } | undefined;
              if (frontendData?.rows && inferredCategories.length > 0) {
                const rows = frontendData.rows.map((r: FrontendRow, i: number) => ({
                  ...r,
                  category: inferredCategories[i] ?? r.category,
                }));
                return { ...baseRecord, data: { rows } };
              }
              return baseRecord;
            })();
            // Use seq: 10 so these events are accepted even if JobStatusContext already
            // holds a remapped done-phase entry (seq: 1) for this receipt ID from a
            // prior scan_receipt done event.
            setTimeout(() => {
              fireEvent('job:status', { jobKey: catJobKey, phase: 'queued', record: null, error: null, seq: 10 });
              setTimeout(() => {
                fireEvent('job:status', { jobKey: catJobKey, phase: 'done', record: catRecord, error: null, seq: 11 });
                fireEvent('receipt:saved', catRecord);
              }, 0);
            }, 0);
            return catJobKey;
          }
          case 'list_categories':
            return categories;
          case 'save_categories':
          case 'update_category_color':
          case 'rename_category':
          case 'delete_category':
          case 'add_category':
          case 'update_category_order':
            return null;

          // ── Backup / Restore ──────────────────────────────────────────
          case 'export_backup':
            return backupInfo;
          case 'import_backup':
            return null;
          // ── Grocery reference data ─────────────────────────────────────
          case 'get_grocery_metadata':
            return groceryMetadata;
          case 'list_grocery_categories':
            return groceryCategories;
          case 'list_grocery_locations':
            return groceryLocations;
          case 'list_grocery_products': {
            const cat = args?.category as string | undefined;
            const search = ((args?.search as string | undefined) ?? '').toLowerCase();
            const filtered = groceryProducts.filter((p) => {
              const matchesCat = !cat || p.category === cat;
              const matchesSearch = !search || p.name.toLowerCase().includes(search);
              return matchesCat && matchesSearch;
            });
            return { products: filtered, total: filtered.length, page: args?.page ?? 1, pageSize: args?.pageSize ?? 200 };
          }
          case 'get_grocery_prices': {
            const name = (args?.productName as string | undefined) ?? '';
            const filtered = name
              ? groceryPrices.filter((p) => p.productName === name)
              : groceryPrices;
            return { prices: filtered, total: filtered.length, page: args?.page ?? 1, pageSize: args?.pageSize ?? 500 };
          }          // ── Image Library ──────────────────────────────────────────────
          case 'get_image_library':
            return imageLibrary;
          case 'get_library_entry': {
            const id = args?.id as number | undefined;
            return imageLibrary.find((e) => e.id === id) ?? null;
          }
          case 'add_images_to_library': {
            const paths = (args?.paths as string[] | undefined) ?? [];
            const now = new Date().toISOString();
            return paths.map((p, i) => {
              // Simulate Rust dedup: if the path already exists in the library,
              // return the existing entry with cleared staging/thumbnail/receipt
              // (mirrors the real backend's INSERT OR IGNORE + UPDATE behaviour).
              const existing = (imageLibrary as MockImageLibraryEntry[]).find(
                (e) => e.filePath === p,
              );
              if (existing) {
                existing.receiptId = null;
                existing.stagingPath = null;
                existing.thumbnailPath = null;
                return existing;
              }
              return {
                id: Date.now() + i + 1,
                filePath: p,
                addedAt: now,
                thumbnailPath: null,
                receiptId: null,
                stagingPath: null,
              };
            });
          }
          case 'remove_from_library':
          case 'link_image_to_receipt':
          case 'update_library_entry_staging':
          case 'clear_library':
            return null;
          // ── AI model status ────────────────────────────────────────────
          case 'check_model_status':
            // Report both models as ready so the scanner / editor scan buttons
            // are never disabled due to modelsAbsent in tests.
            return { ocr: true, llm: true };
          case 'model_download_progress':
            return null;
          case 'cancel_model_download':
          case 'delete_models':
            return null;
          // ── Misc ──────────────────────────────────────────────────────
          case 'get_app_version':
            return '0.1.0';
          case 'get_storage_info':
            return storage;
          case 'clear_receipt_staging':
          case 'remove_receipt_images':
          case 'open_app_data_dir':
            return null;
          case 'remove_all_app_data': {
            // Track call count so E2E tests can assert the command was invoked.
            const w = window as unknown as Record<string, number>;
            w.__tauriRemoveAllAppDataCount = (w.__tauriRemoveAllAppDataCount ?? 0) + 1;
            return null;
          }

          // ── Tauri dialog plugin ────────────────────────────────────────
          // @tauri-apps/plugin-dialog calls invoke('plugin:dialog|<fn>', opts)
          // and the return value is passed directly back to the awaiting caller.
          case 'plugin:dialog|save':
            return dialogSavePath;
          case 'plugin:dialog|open':
            return dialogOpenPath;
          // plugin-dialog@2.x routes confirm() and ask() through messageCommand(),
          // which calls plugin:dialog|message and compares the return value to the
          // "ok" label ('Ok' for OkCancel, 'Yes' for YesNo).  Returning the right
          // string makes confirm/ask resolve as true/false per dialogConfirm.
          case 'plugin:dialog|message': {
            const buttons = args?.buttons as string | Record<string, unknown> | undefined;
            if (dialogConfirm) {
              if (typeof buttons === 'string') {
                return buttons === 'YesNo' || buttons === 'YesNoCancel' ? 'Yes' : 'Ok';
              }
              if (buttons && 'OkCancelCustom' in buttons) {
                return (buttons.OkCancelCustom as string[])[0];
              }
              return 'Ok';
            } else {
              if (typeof buttons === 'string') {
                return buttons === 'YesNo' || buttons === 'YesNoCancel' ? 'No' : 'Cancel';
              }
              if (buttons && 'OkCancelCustom' in buttons) {
                return (buttons.OkCancelCustom as string[])[1];
              }
              return null;
            }
          }
          case 'plugin:dialog|confirm':
          case 'plugin:dialog|ask':
            return dialogConfirm;

          // ── Tauri event bridge ─────────────────────────────────────────
          case 'plugin:event|emit': {
            // Route frontend emit() calls back to local listeners so Tauri events
            // work as a within-window EventBus during browser-mode E2E tests.
            const eventName = args?.event as string | undefined;
            const payload = args?.payload;
            if (typeof eventName === 'string') {
              const ids = _eventListeners.get(eventName) ?? [];
              for (const id of ids) {
                const fn = _callbacks.get(id);
                if (fn) fn({ id: 0, event: eventName, payload });
              }
            }
            return null;
          }
          case 'plugin:event|unlisten':
            return null;
          case 'plugin:event|listen': {
            // args.handler is the numeric callback ID registered by transformCallback.
            // args.event is the event name string.
            const handlerIdRaw = args?.handler;
            const eventName = args?.event;
            if (typeof handlerIdRaw === 'number' && typeof eventName === 'string') {
              const ids = _eventListeners.get(eventName) ?? [];
              ids.push(handlerIdRaw);
              _eventListeners.set(eventName, ids);
            }
            return ++_nextId;
          }

          default:
            return null;
        }
      };

      // @ts-expect-error — runtime shim; types not available in page context.
      window.__TAURI_INTERNALS__ = {
        invoke,
        /** Identity: tests serve files from localhost, not tauri:// protocol. */
        convertFileSrc: (path: string): string => path,
        /**
         * In real Tauri, transformCallback registers a JS callback so Rust can
         * call it back by ID.  Here we store it in _callbacks and return its ID
         * so plugin:event|listen can later wire up event → callback.
         */
        transformCallback: (fn: (event: unknown) => void): number => {
          const id = ++_nextId;
          _callbacks.set(id, fn);
          return id;
        },
        metadata: {
          currentWindow: { label: 'main' },
          currentWebview: { label: 'main' },
        },
        plugins: {
          globalShortcut: {
            isRegistered: async (): Promise<boolean> => false,
            register: async (): Promise<void> => { },
            unregister: async (): Promise<void> => { },
            unregisterAll: async (): Promise<void> => { },
          },
        },
      };

      /**
       * Test helper: fire a synthetic Tauri event from Playwright tests.
       *
       * Example:
       *   await page.evaluate(() =>
       *     window.__tauriEmitEvent('scan-progress', 'Downloading model… (42%)')
       *   );
       */
      // @ts-expect-error — test-only global
      window.__tauriEmitEvent = (eventName: string, payload: unknown): void => {
        const ids = _eventListeners.get(eventName) ?? [];
        for (const id of ids) {
          const fn = _callbacks.get(id);
          if (fn) fn({ id: 0, event: eventName, payload });
        }
      };

      /**
       * Test helper: toggle scan hanging at runtime.
       * After calling __tauriSetHangOnScan(true), subsequent scan_receipt calls
       * will fire queued+scanning events but never resolve, freezing the UI in
       * scanning state.  Call with false to revert to instant completion.
       */
      // @ts-expect-error — test-only global
      window.__tauriSetHangOnScan = (hang: boolean): void => {
        _hangOnScan = hang;
      };

      /**
       * Test helper: complete the last hanging scan job.
       * Fires job:status done + receipt:saved events so the UI transitions from
       * "Scanning…" to "done".  No-op if no scan is currently hanging.
       */
      // @ts-expect-error — test-only global
      window.__tauriCompleteScan = (): void => {
        if (!_pendingHangJob) return;
        const { jobKey, record } = _pendingHangJob;
        _pendingHangJob = null;
        const ids = _eventListeners.get('job:status') ?? [];
        for (const cbId of ids) {
          const fn = _callbacks.get(cbId);
          if (fn) fn({ id: 0, event: 'job:status', payload: { jobKey, phase: 'done', record, error: null, seq: 2 } });
        }
        const savedIds = _eventListeners.get('receipt:saved') ?? [];
        for (const cbId of savedIds) {
          const fn = _callbacks.get(cbId);
          if (fn) fn({ id: 0, event: 'receipt:saved', payload: record });
        }
      };

      /**
       * The event.js _unlisten() helper calls unregisterListener on this object.
       * We provide a no-op stub so unlisten() doesn't throw in browser-mode tests.
       */
      // @ts-expect-error — runtime shim
      window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
        unregisterListener: (_event: string, _eventId: number): void => { },
      };
    },
    { scans, storage, categories, dialogSavePath, dialogOpenPath, dialogConfirm, backupInfo, hangOnScanReceipt, groceryMetadata, groceryCategories, groceryLocations, groceryProducts, groceryPrices, scanReceiptResult, savedReceiptRecord, updatedReceiptRecord, inferredCategories, imageLibrary },
  );
}
