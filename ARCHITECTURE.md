# Architecture

Monioc is a macOS/Windows/Linux desktop application built with Tauri v2 (Rust backend) and React (TypeScript frontend). It tracks Statistics Canada grocery price data and lets users scan receipts with local AI models.

---

## Repository layout

```
monioc-os/
├── packages/shared/        # Framework-independent shared types, constants, utils
├── app/                    # Tauri desktop application
│   ├── src/                # React frontend
│   ├── src-tauri/          # Rust backend
│   │   ├── src/
│   │   │   ├── lib.rs      # App setup, plugin registration, window chrome
│   │   │   ├── error.rs    # AppError enum (thiserror + structured serde)
│   │   │   ├── events.rs   # Tauri event type aliases
│   │   │   ├── job_queue.rs# Serial job worker (mpsc + CancellationToken)
│   │   │   ├── commands/   # Tauri IPC command handlers (7 modules)
│   │   │   ├── db/         # SQLite pool wrappers (6 modules)
│   │   │   ├── services/   # Business logic called by commands
│   │   │   ├── image_ops/  # Image processing (crop, resize)
│   │   │   ├── python/     # Python subprocess invocation (OCR/LLM)
│   │   │   └── utils.rs    # Shared Rust utilities
│   │   └── tauri.conf.json
│   ├── data/               # Source CSV + ETL scripts
│   │   ├── statscan-full.csv
│   │   └── process_statscan_to_sqlite.py
│   ├── build/              # grocery.sqlite3 (git-tracked, bundled as resource)
│   └── scripts/
│       └── build-grocery-db.sh
└── landing/                # Next.js static landing page (output: "export")
```

The root `package.json` declares npm workspaces (`packages/*`, `app`, `landing`). Install everything with `npm ci` at the repo root.

---

## Shared package (`packages/shared`)

Contains code that is framework-independent and used by both `app/` and `landing/`:

- **`src/constants.ts`** — display names, category colors, timing/size constants, unit conversion factors, `SpreadsheetColumn` enum, `CUSTOM_GROCERY_CATEGORIES`.
- **`src/types/`** — all domain interfaces: grocery records, receipt rows, scan events, image library, job status, subscriptions, tab memory, the `Task` interface.
- **`src/domain/receipt.ts`** — `makeRow()`, `hydrateIds()` (pure factory functions using nanoid).
- **`src/utils/`** — `priceFormatting`, `statistics`, `unitConversion`, `stringUtils`, `fileFormatting`, `receipt-scanner/*` (cardStatus, formatting, receiptData).

Both `app/src/` and `landing/src/` contain thin re-export files at their original paths, so all existing import paths continue to resolve. Vite resolves `@monioc/shared` via a `resolve.alias` pointing to `packages/shared/src`; Next.js uses `transpilePackages: ["@monioc/shared"]`.

App-specific items **not** in shared: `ROUTES`, `STORAGE_KEYS`, `CUSTOM_EVENTS`, `AppEvents`, `APP_VERSION`, `APP_URL`, chart animation durations, and all React contexts/hooks.

---

## Data flow

### Grocery price database

```
app/data/statscan-full.csv
        │
        v
process_statscan_to_sqlite.py   (run via app/scripts/build-grocery-db.sh)
        │
        v
app/build/grocery.sqlite3       (bundled as Tauri resource; git-tracked)
        │  first-launch copy → app-data dir
        v
SqlitePool (read-only)          tauri::State<GroceryDbState>
        │ Tauri IPC
        v
commands/grocery.rs             list_grocery_categories, list_grocery_products,
                                get_grocery_prices, get_grocery_metadata,
                                list_grocery_locations
        │ TauriApi wrapper
        v
app/src/services/api.ts (TauriApi)
        │
  ┌─────┴──────┐
  v            v
GroceryDataContext   ProductDetailPage / CategoryPage / ProductsPage
(dimension tables)   (products + prices fetched on demand)
```

### Receipt scanning

```
User picks image(s)
        │
        v
job_queue.rs (serial mpsc worker, CancellationToken per job)
        │
        v
python/  →  scan_receipt.py  →  Moondream OCR model (local, ~5.4 GB)
                │
                v
        categorize_items.py  →  LLM (MLX / llama-cpp / Ollama, platform-detected)
                │
                v
commands/receipt.rs  →  receipts.sqlite3  (tauri::State<DbState>)
                │ Tauri events (job status, completion)
                v
JobStatusContext  →  TaskManagerContext  →  ReceiptScannerPage / ReceiptEditorPage
```

---

## Frontend layer model

```
pages/          Route-level components. Data fetching via TauriApi or context.
context/        React contexts: grocery data, job status, tab memory, toasts, etc.
hooks/          Logic extracted from pages (useScanReceipt, useModelDownload, …).
services/       TauriApi (centralised invoke wrapper), errors.ts (parseTauriError).
components/     Presentational components with no direct IPC.
domain/         Re-exports from @monioc/shared (makeRow, hydrateIds).
utils/          Re-exports from @monioc/shared + app-specific helpers.
types/          Re-exports from @monioc/shared.
constants.ts    App-specific constants + re-exports everything from @monioc/shared.
```

Direct `invoke()` calls outside `TauriApi` are limited to `invoke('dev_open_devtools')` in dev-only UI components (SideNav, NavButton, TabLink, ReceiptsDashboardPage).

---

## Rust error handling

`AppError` ([error.rs](app/src-tauri/src/error.rs)) uses `thiserror` and serializes to a structured object:

```json
{ "kind": "Io" | "Json" | "Processing" | "Path" | "Database" | "NotFound" | "Image",
  "message": "human-readable description" }
```

The frontend `parseTauriError()` ([services/errors.ts](app/src/services/errors.ts)) extracts the `message` field from this structure (and falls back gracefully for plain strings from older/external errors).

---

## CI

| Workflow | Trigger | Jobs |
|---|---|---|
| `ci.yml` | push to main, PRs | lint (ESLint + `tsc --noEmit` + Clippy + rustfmt), test-unit (Vitest), test-rust (cargo test), test-python (unittest), test-e2e (Playwright + xvfb), build-landing |
| `release.yml` | version tags `v*.*.*` | lint + all test jobs must pass → build-tauri (4-platform matrix) |
| `pages.yml` | push to main, `landing/**` | test-landing-e2e → deploy to GitHub Pages |

---

## Key decisions

**npm workspaces over pnpm** — pnpm was not available in the dev environment; npm workspaces are functionally equivalent for this monorepo's needs.

**Thin re-exports over import rewrites** — existing import paths inside `app/src/` and `landing/src/` are preserved as one-liner re-export files. This avoids touching 400+ import sites across 30+ test files.

**Structured `AppError` serialization** — the previous string-only serialization prevented the frontend from pattern-matching on error kind. The `{ kind, message }` shape enables future per-kind handling without breaking existing catch sites (all use `parseTauriError` which reads `.message`).

**`lib.rs` exit on Tauri runtime failure** — the bare `.expect()` at application startup was replaced with `unwrap_or_else` that prints to stderr and calls `process::exit(1)`, enabling log capture in CI and crash reporters.

**SQLite only, JSON ETL deleted** — `process_statscan_to_json.py` (present in both `app/data/` and `app/src-tauri/`) was never run and produced no output file. It has been removed. The canonical ETL path is `process_statscan_to_sqlite.py` → `app/build/grocery.sqlite3`.
