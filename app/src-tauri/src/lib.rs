//! Statscan Grocery App - Tauri desktop application.
//!
//! This library provides the core backend functionality for the Statscan grocery
//! price tracking desktop application, including receipt scanning, image processing,
//! and data management.

pub mod commands;
pub mod db;
pub mod error;
pub mod events;
pub mod image_ops;
pub mod job_queue;
pub mod python;
pub mod services;
pub mod utils;

use db::connection::DbState;
use db::grocery::GroceryDbState;
use sqlx::sqlite::SqliteConnectOptions;
use sqlx::SqlitePool;
#[cfg(target_os = "macos")]
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{Emitter, Manager, WebviewWindowBuilder};
use tauri_plugin_sql::{Builder as SqlBuilder, Migration, MigrationKind};

/// Repositions the three traffic-light buttons (close / minimise / zoom) to
/// the custom x/y coordinates used by this app.
///
/// macOS re-runs its internal layout pass on every window resize, which
/// resets button frames to system defaults.  Calling this function after
/// each resize keeps them pinned at the intended position.
///
/// # Safety
/// Caller must ensure `ns_window` is a valid `NSWindow *` on the main thread.
#[cfg(target_os = "macos")]
#[allow(deprecated)]
#[allow(unexpected_cfgs)]
unsafe fn reposition_traffic_lights(ns_window: cocoa::base::id) {
    use cocoa::foundation::{NSPoint, NSRect};
    use cocoa::base::id;
    use objc::{msg_send, sel, sel_impl};

    let close_btn: id = msg_send![ns_window, standardWindowButton: 0u64];
    let min_btn: id = msg_send![ns_window, standardWindowButton: 1u64];
    let zoom_btn: id = msg_send![ns_window, standardWindowButton: 2u64];
    let base_x: f64 = 16.0;

    // Compute centred y within the 40px visual title bar.
    // The superview is non-flipped (y=0 at bottom), so centre = height - 20.
    let visual_header: f64 = 40.0;
    let compute_y = |btn: id| -> f64 {
        if btn.is_null() {
            return 0.0;
        }
        let frame: NSRect = msg_send![btn, frame];
        let sv: id = msg_send![btn, superview];
        let sv_frame: NSRect = msg_send![sv, frame];
        let btn_h = frame.size.height;
        let y = sv_frame.size.height - (visual_header / 2.0) - (btn_h / 2.0);
        if y < 0.0 { 0.0 } else { y }
    };
    let base_y: f64 = compute_y(close_btn) - 1.0; // nudge down 1px to visually centre in the 40px header

    if !close_btn.is_null() {
        let frame: NSRect = msg_send![close_btn, frame];
        let nf = NSRect::new(NSPoint::new(base_x, base_y), frame.size);
        let _: () = msg_send![close_btn, setFrame: nf];
    }
    if !min_btn.is_null() {
        let frame: NSRect = msg_send![min_btn, frame];
        let nf = NSRect::new(NSPoint::new(base_x + 20.0, base_y), frame.size);
        let _: () = msg_send![min_btn, setFrame: nf];
    }
    if !zoom_btn.is_null() {
        let frame: NSRect = msg_send![zoom_btn, frame];
        let nf = NSRect::new(NSPoint::new(base_x + 40.0, base_y), frame.size);
        let _: () = msg_send![zoom_btn, setFrame: nf];
    }
}

/// Registers a permanent `NSNotificationCenter` observer on `ns_window` that
/// calls [`reposition_traffic_lights`] after every `NSWindowDidResizeNotification`.
///
/// AppKit fires this notification at the end of each layout pass during live
/// resize — after it has reset traffic-light button frames to system defaults
/// but before the frame is committed to the display.  By repositioning in this
/// callback we always win the race against AppKit's own layout code.
///
/// The observer class `MoniocTrafficLightObserver` is registered exactly once
/// in the Objective-C runtime; subsequent calls (e.g. multiple windows) reuse
/// the already-registered class.  The observer instance is retained so it
/// lives for the lifetime of the application.
///
/// # Safety
/// Caller must ensure `ns_window` is a valid `NSWindow *` on the main thread.
#[cfg(target_os = "macos")]
#[allow(deprecated)]
#[allow(unexpected_cfgs)]
unsafe fn install_resize_observer(ns_window: cocoa::base::id) {
    use cocoa::base::id;
    use cocoa::foundation::NSString;
    use objc::declare::ClassDecl;
    use objc::runtime::{Object, Sel};
    use objc::{msg_send, sel, sel_impl};

    // Register the helper class exactly once; the ObjC runtime panics if you
    // try to register the same name twice.
    if objc::runtime::Class::get("MoniocTrafficLightObserver").is_none() {
        extern "C" fn window_did_resize(_self: &Object, _cmd: Sel, notification: id) {
            unsafe {
                let window: id = msg_send![notification, object];
                if !window.is_null() {
                    reposition_traffic_lights(window);
                }
            }
        }

        let superclass = objc::runtime::Class::get("NSObject").expect("NSObject");
        let mut decl = ClassDecl::new("MoniocTrafficLightObserver", superclass)
            .expect("MoniocTrafficLightObserver ClassDecl");
        decl.add_method(
            sel!(windowDidResize:),
            window_did_resize as extern "C" fn(&Object, Sel, id),
        );
        decl.register();
    }

    let cls = objc::runtime::Class::get("MoniocTrafficLightObserver")
        .expect("MoniocTrafficLightObserver");
    let observer: id = msg_send![cls, new];
    // Retain the observer so it is never deallocated.
    let _: id = msg_send![observer, retain];

    let nc_cls =
        objc::runtime::Class::get("NSNotificationCenter").expect("NSNotificationCenter");
    let nc: id = msg_send![nc_cls, defaultCenter];
    let name: id =
        NSString::alloc(cocoa::base::nil).init_str("NSWindowDidResizeNotification");
    let _: () = msg_send![nc,
        addObserver: observer
        selector: sel!(windowDidResize:)
        name: name
        object: ns_window
    ];
}

/// Sets up the macOS-native window chrome: transparent titlebar, correct
/// appearance, and positioned traffic-light buttons.
///
/// All `cocoa` and `objc 0.2` APIs used here are soft-deprecated in favour of
/// the `objc2-*` ecosystem. The allows silence the resulting compiler chatter
/// without losing any safety or behaviour.
#[cfg(target_os = "macos")]
#[allow(deprecated)] // cocoa 0.x APIs — kept until objc2 migration
#[allow(unexpected_cfgs)] // sel_impl! in objc 0.2 uses cfg(feature="cargo-clippy")
fn setup_macos_window(window: tauri::WebviewWindow) {
    window
        .with_webview(move |webview| {
            use cocoa::appkit::{NSWindow, NSWindowStyleMask, NSWindowTitleVisibility};
            use cocoa::base::{id, nil};
            use cocoa::foundation::NSString;
            use objc::{msg_send, sel, sel_impl};
            unsafe {
                let ns_window: id = webview.ns_window() as id;

                // Restore standard style flags that decorations(false) cleared.
                let mut style_mask: NSWindowStyleMask = ns_window.styleMask();
                style_mask |= NSWindowStyleMask::NSFullSizeContentViewWindowMask;
                style_mask |= NSWindowStyleMask::NSTitledWindowMask;
                style_mask |= NSWindowStyleMask::NSClosableWindowMask;
                style_mask |= NSWindowStyleMask::NSMiniaturizableWindowMask;
                style_mask |= NSWindowStyleMask::NSResizableWindowMask;
                ns_window.setStyleMask_(style_mask);

                ns_window.setTitlebarAppearsTransparent_(cocoa::base::YES);
                ns_window.setTitleVisibility_(NSWindowTitleVisibility::NSWindowTitleHidden);
                ns_window.setHasShadow_(cocoa::base::YES);
                ns_window.setOpaque_(cocoa::base::NO);

                // Clear the NSWindow background so macOS does not render a 1px
                // frame-highlight border around the window edges.
                let ns_color_cls = objc::runtime::Class::get("NSColor").expect("NSColor");
                let clear_color: id = msg_send![ns_color_cls, clearColor];
                let _: () = msg_send![ns_window, setBackgroundColor: clear_color];

                // Force the light (Aqua) appearance on this window regardless of
                // the system setting.  macOS renders the thin 1-pixel window-frame
                // outline using the window's active appearance; forcing Aqua makes
                // that outline white/light, so it is effectively invisible against
                // the app's light (#f7f7f6) background.
                let appearance_cls =
                    objc::runtime::Class::get("NSAppearance").expect("NSAppearance");
                let appearance_name = NSString::alloc(nil).init_str("NSAppearanceNameAqua");
                let appearance: id = msg_send![appearance_cls, appearanceNamed: appearance_name];
                if !appearance.is_null() {
                    let _: () = msg_send![ns_window, setAppearance: appearance];
                }

                // Position native traffic-light buttons.
                // macOS resets these during resize; the resize handler below
                // re-applies them, but we set them once here for the initial open.
                reposition_traffic_lights(ns_window);
            }
        })
        .expect("with_webview failed");

    // Register an NSNotificationCenter observer for NSWindowDidResizeNotification.
    //
    // Tauri's WindowEvent::Resized fires only after a resize ends, so buttons
    // visibly shift during a live drag.  NSWindowDidResizeNotification is fired
    // by AppKit at the end of *every* layout pass inside the live-resize loop —
    // after the system has reset button frames but before the frame is committed
    // to the display — making it the correct hook to permanently override
    // the system-default positions.
    window
        .with_webview(|webview| {
            #[allow(deprecated)]
            #[allow(unexpected_cfgs)]
            unsafe {
                use cocoa::base::id;
                let ns_window: id = webview.ns_window() as id;
                install_resize_observer(ns_window);
            }
        })
        .expect("with_webview (resize observer) failed");
}

/// Start the Tauri application event loop.
///
/// Initializes all Tauri plugins, opens the SQLite database, registers it as
/// managed state, then registers all command handlers.
///
/// # Schema Migrations
///
/// Migrations are declared here and handed to `tauri-plugin-sql`, which runs
/// any pending ones during plugin initialization (triggered by
/// `plugins.sql.preload` in `tauri.conf.json`).  Each migration is tracked
/// by version in the `_sqlx_migrations` table so it runs **exactly once** per
/// database file.
///
/// # Plugins Initialized
///
/// - **sql**: Migration-aware SQLite access (tauri-plugin-sql)
/// - **opener**: OS default handler for URLs and files
/// - **store**: Persistent key-value storage (JSON-backed)
/// - **fs**: File system access
/// - **shell**: Shell command execution (for Python scripts)
/// - **dialog**: Native file picker dialogs
/// - **clipboard-manager**: Native clipboard access for spreadsheet copy
pub fn run() {
    // ── Schema migrations ──────────────────────────────────────────────────
    // Migrations are versioned and tracked in `_sqlx_migrations`; each runs
    // exactly once regardless of how many times the app is launched.
    let migrations = vec![
        // Migration 1 – create the canonical `receipt_scans` table.
        Migration {
            version: 1,
            description: "create_receipt_scans_table",
            sql: "CREATE TABLE IF NOT EXISTS receipt_scans (
                    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
                    display_name         TEXT,
                    image_path           TEXT,
                    processed_image_path TEXT,
                    rows_json            TEXT NOT NULL DEFAULT '[]',
                    created_at           TEXT NOT NULL DEFAULT (datetime('now')),
                    updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
                );",
            kind: MigrationKind::Up,
        },
        // Migration 2 – normalise any empty / NULL `rows_json` values to `'[]'`.
        Migration {
            version: 2,
            description: "backfill_rows_json",
            sql: "UPDATE receipt_scans
                  SET rows_json = '[]'
                  WHERE rows_json IS NULL OR trim(rows_json) = '';",
            kind: MigrationKind::Up,
        },
        // Migration 3 – rebuild `receipt_scans` without legacy NOT-NULL columns
        // (`items_json`, `taxes_json`, `total`) that cause constraint failures on
        // old installs.  Uses a rename→create→copy→drop pattern.
        Migration {
            version: 3,
            description: "rebuild_table_remove_legacy_not_null_columns",
            sql: "CREATE TABLE receipt_scans_new (
                    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
                    display_name         TEXT,
                    image_path           TEXT,
                    processed_image_path TEXT,
                    rows_json            TEXT NOT NULL DEFAULT '[]',
                    created_at           TEXT NOT NULL DEFAULT (datetime('now')),
                    updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
                );
                INSERT INTO receipt_scans_new
                    (id, display_name, image_path, processed_image_path, rows_json, created_at, updated_at)
                    SELECT id,
                           display_name,
                           image_path,
                           processed_image_path,
                           COALESCE(NULLIF(trim(rows_json), ''), '[]'),
                           created_at,
                           updated_at
                    FROM receipt_scans;
                DROP TABLE receipt_scans;
                ALTER TABLE receipt_scans_new RENAME TO receipt_scans;",
            kind: MigrationKind::Up,
        },
        // Migration 4 – create the `categories` table for persisting user-managed
        // grocery category names, colours, and display order.
        Migration {
            version: 4,
            description: "create_categories_table",
            sql: "CREATE TABLE IF NOT EXISTS categories (
                    id         INTEGER PRIMARY KEY AUTOINCREMENT,
                    name       TEXT NOT NULL UNIQUE,
                    color      TEXT NOT NULL DEFAULT '#94A3B8',
                    sort_order INTEGER NOT NULL DEFAULT 0
                );",
            kind: MigrationKind::Up,
        },
        // Migration 5 – add `purchase_date` to receipt_scans so users can
        // record the date printed on the receipt, separate from created_at.
        Migration {
            version: 5,
            description: "add_purchase_date_to_receipt_scans",
            sql: "ALTER TABLE receipt_scans ADD COLUMN purchase_date TEXT;",
            kind: MigrationKind::Up,
        },
        // Migration 6 – create `image_library` table for persistent image
        // staging.  Images survive app restarts and tab closes.  The
        // `receipt_id` foreign key links a library entry to a scanned receipt;
        // ON DELETE SET NULL ensures receipt deletion does not remove the image.
        Migration {
            version: 6,
            description: "create_image_library_table",
            sql: "CREATE TABLE IF NOT EXISTS image_library (
                    id             INTEGER PRIMARY KEY AUTOINCREMENT,
                    file_path      TEXT NOT NULL UNIQUE,
                    added_at       TEXT NOT NULL DEFAULT (datetime('now')),
                    thumbnail_path TEXT,
                    receipt_id     INTEGER REFERENCES receipt_scans(id) ON DELETE SET NULL,
                    staging_path   TEXT
                );",
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        // ── One-time setup ─────────────────────────────────────────────────
        // `tauri-plugin-sql` runs all pending migrations during its own setup
        // phase (triggered by `plugins.sql.preload` in `tauri.conf.json`),
        // which completes before this closure runs.  We open a separate
        // `SqlitePool` here for the Rust-side CRUD commands registered in
        // `invoke_handler`.
        .setup(|app| {
            // ── Receipts DB ────────────────────────────────────────────────
            let db_path = app.path().app_data_dir()?.join("receipts.sqlite3");
            let parent = db_path.parent().ok_or_else(|| {
                crate::error::AppError::Path("Cannot resolve database parent directory".into())
            })?;
            std::fs::create_dir_all(parent)?;
            let url = format!("sqlite:{}", db_path.display());
            let pool = tauri::async_runtime::block_on(SqlitePool::connect(&url))
                .map_err(|e| crate::error::AppError::Database(e.to_string()))?;
            app.manage(DbState(tauri::async_runtime::RwLock::new(pool)));
            app.manage(commands::misc::ModelDownloadState::new());
            app.manage(commands::python_setup::PythonSetupState::new());

            // Serial job queue — processes receipt scan + categorize jobs one
            // at a time on a background tokio task and emits `job:status` events.
            let queue = crate::job_queue::JobQueue::spawn(app.handle().clone());
            app.manage(queue);

            // ── Grocery DB (read-only, bundled) ────────────────────────────
            // Copy the bundled grocery.sqlite3 to app-data so that rebuilt
            // databases are picked up on the next launch.  The file is pure
            // reference data (never mutated at runtime) so overwriting is safe.
            //
            // Guard: only overwrite if the bundled file is larger than 1 MB.
            // An empty/schema-only database is ~56 KB; a fully populated one
            // is ~12 MB.  This prevents a bad build artifact from wiping good
            // data that may already be in app-data.
            const GROCERY_DB_MIN_BYTES: u64 = 1_024 * 1_024; // 1 MB
            let grocery_dest = app.path().app_data_dir()?.join("grocery.sqlite3");
            {
                let resource_dir = app
                    .path()
                    .resource_dir()
                    .map_err(|e| crate::error::AppError::Path(e.to_string()))?;
                let grocery_src = resource_dir.join("grocery.sqlite3");
                if grocery_src.exists() {
                    let src_size = std::fs::metadata(&grocery_src)
                        .map(|m| m.len())
                        .unwrap_or(0);
                    if src_size >= GROCERY_DB_MIN_BYTES {
                        std::fs::copy(&grocery_src, &grocery_dest)?;
                    } else {
                        eprintln!(
                            "WARNING: Bundled grocery.sqlite3 is too small ({src_size} bytes < \
                             {GROCERY_DB_MIN_BYTES} bytes) — refusing to overwrite app-data. \
                             Rebuild with a populated database."
                        );
                    }
                } else {
                    eprintln!(
                        "WARNING: Bundled grocery.sqlite3 not found at {}; \
                         grocery data will be unavailable.",
                        grocery_src.display()
                    );
                }
            }

            if grocery_dest.exists() {
                let grocery_url = format!("sqlite:{}?mode=ro", grocery_dest.display());
                let opts = grocery_url
                    .parse::<SqliteConnectOptions>()
                    .map_err(|e| crate::error::AppError::Database(e.to_string()))?
                    .read_only(true);
                let grocery_pool = tauri::async_runtime::block_on(SqlitePool::connect_with(opts))
                    .map_err(|e| crate::error::AppError::Database(e.to_string()))?;
                app.manage(GroceryDbState(grocery_pool));
            }

            // ── Create main window ──────────────────────────────────────────
            // Window is created programmatically (not via tauri.conf.json
            // "windows" array) so we can call NSWindow::setBackgroundColor_
            // right after build() — before macOS paints anything — making the
            // corner pixels truly transparent so the CSS border-radius shows
            // and macOS renders the drop-shadow around the rounded shape.
            let win_config = app.config().app.windows[0].clone();
            let window = WebviewWindowBuilder::from_config(app, &win_config)?.build()?;

            // Apply macOS-native window styling: transparent titlebar,
            // correct appearance, and positioned traffic-light buttons.
            #[cfg(target_os = "macos")]
            setup_macos_window(window);

            // ── macOS native menu bar ──────────────────────────────────────
            #[cfg(target_os = "macos")]
            {
                let app_menu = Submenu::with_items(
                    app,
                    "Monioc",
                    true,
                    &[
                        &MenuItem::with_id(app, "about", "About Monioc", true, None::<&str>)?,
                        &PredefinedMenuItem::separator(app)?,
                        &MenuItem::with_id(app, "settings", "Settings…", true, Some("Cmd+,"))?,
                        &PredefinedMenuItem::separator(app)?,
                        &PredefinedMenuItem::hide(app, None)?,
                        &PredefinedMenuItem::hide_others(app, None)?,
                        &PredefinedMenuItem::show_all(app, None)?,
                        &PredefinedMenuItem::separator(app)?,
                        &PredefinedMenuItem::quit(app, None)?,
                    ],
                )?;

                let file_menu = Submenu::with_items(
                    app,
                    "File",
                    true,
                    &[
                        &MenuItem::with_id(
                            app,
                            "scan_receipt",
                            "Scan Receipt",
                            true,
                            Some("Cmd+N"),
                        )?,
                        &PredefinedMenuItem::separator(app)?,
                        &MenuItem::with_id(
                            app,
                            "backup_export",
                            "Export Backup…",
                            true,
                            Some("Cmd+Shift+E"),
                        )?,
                        &MenuItem::with_id(
                            app,
                            "backup_import",
                            "Restore from Backup…",
                            true,
                            None::<&str>,
                        )?,
                    ],
                )?;

                let edit_menu = Submenu::with_items(
                    app,
                    "Edit",
                    true,
                    &[
                        &PredefinedMenuItem::undo(app, None)?,
                        &PredefinedMenuItem::redo(app, None)?,
                        &PredefinedMenuItem::separator(app)?,
                        &PredefinedMenuItem::cut(app, None)?,
                        &PredefinedMenuItem::copy(app, None)?,
                        &PredefinedMenuItem::paste(app, None)?,
                        &PredefinedMenuItem::separator(app)?,
                        &PredefinedMenuItem::select_all(app, None)?,
                    ],
                )?;

                let view_menu = Submenu::with_items(
                    app,
                    "View",
                    true,
                    &[
                        &MenuItem::with_id(app, "nav_dashboard", "Dashboard", true, Some("Cmd+1"))?,
                        &MenuItem::with_id(app, "nav_receipts", "Receipts", true, Some("Cmd+2"))?,
                        &MenuItem::with_id(
                            app,
                            "nav_statistics",
                            "Statistics",
                            true,
                            Some("Cmd+3"),
                        )?,
                        &MenuItem::with_id(app, "nav_prices", "Prices", true, Some("Cmd+4"))?,
                        &PredefinedMenuItem::separator(app)?,
                        &MenuItem::with_id(
                            app,
                            "nav_categories",
                            "Categories",
                            true,
                            None::<&str>,
                        )?,
                        &MenuItem::with_id(
                            app,
                            "nav_backup",
                            "Backup & Restore",
                            true,
                            None::<&str>,
                        )?,
                    ],
                )?;

                let window_menu = Submenu::with_items(
                    app,
                    "Window",
                    true,
                    &[
                        &PredefinedMenuItem::minimize(app, None)?,
                        &PredefinedMenuItem::maximize(app, None)?,
                        &PredefinedMenuItem::fullscreen(app, None)?,
                        &PredefinedMenuItem::separator(app)?,
                        &PredefinedMenuItem::close_window(app, None)?,
                    ],
                )?;

                let menu = Menu::with_items(
                    app,
                    &[&app_menu, &file_menu, &edit_menu, &view_menu, &window_menu],
                )?;

                app.set_menu(menu)?;

                let app_handle = app.handle().clone();
                app.on_menu_event(move |_app, event| {
                    let route = match event.id().as_ref() {
                        "settings" => Some("settings"),
                        "scan_receipt" => Some("scan_receipt"),
                        "backup_export" => Some("backup_export"),
                        "backup_import" => Some("backup_import"),
                        "nav_dashboard" => Some("nav_dashboard"),
                        "nav_receipts" => Some("nav_receipts"),
                        "nav_statistics" => Some("nav_statistics"),
                        "nav_prices" => Some("nav_prices"),
                        "nav_categories" => Some("nav_categories"),
                        "nav_backup" => Some("nav_backup"),
                        "about" => Some("about"),
                        _ => None,
                    };
                    if let Some(payload) = route {
                        let _ = app_handle.emit("menu-navigate", payload);
                    }
                });
            }

            Ok(())
        })
        // ── Tauri plugins ──────────────────────────────────────────────────
        // Migration-aware SQLite access; migrations defined above are applied
        // on startup via the `plugins.sql.preload` entry in `tauri.conf.json`.
        .plugin(
            SqlBuilder::default()
                .add_migrations("sqlite:receipts.sqlite3", migrations)
                .build(),
        )
        // Opens URLs / files using the OS default handler.
        .plugin(tauri_plugin_opener::init())
        // Persistent key-value store backed by JSON files in app-data-dir.
        .plugin(tauri_plugin_store::Builder::new().build())
        // File-system access (read CSVs / JSON data files).
        .plugin(tauri_plugin_fs::init())
        // Shell command execution (runs the Python data-processor script).
        .plugin(tauri_plugin_shell::init())
        // Native open/save file-picker dialogs.
        .plugin(tauri_plugin_dialog::init())
        // Native clipboard access used by receipt spreadsheet copy.
        .plugin(tauri_plugin_clipboard_manager::init())
        // ── Custom commands ────────────────────────────────────────────────
        .invoke_handler(tauri::generate_handler![
            commands::grocery::get_grocery_metadata,
            commands::grocery::list_grocery_categories,
            commands::grocery::list_grocery_locations,
            commands::grocery::list_grocery_products,
            commands::grocery::get_grocery_prices,
            commands::receipt::scan_receipt,
            commands::receipt::save_receipt_scan,
            commands::receipt::list_receipt_scans,
            commands::receipt::update_receipt_scan,
            commands::receipt::delete_receipt_scan,
            commands::receipt::export_receipt_csv,
            commands::receipt::rename_receipt_scan,
            commands::receipt::update_receipt_purchase_date,
            commands::receipt::update_receipt_created_at,
            commands::receipt::infer_item_categories,
            commands::receipt::cancel_job,
            commands::category::list_categories,
            commands::category::save_categories,
            commands::category::update_category_color,
            commands::category::rename_category,
            commands::category::delete_category,
            commands::category::add_category,
            commands::category::update_category_order,
            commands::backup::export_backup,
            commands::backup::import_backup,
            commands::misc::get_app_version,
            commands::misc::dev_open_devtools,
            commands::misc::edit_image,
            commands::misc::get_storage_info,
            commands::misc::clear_receipt_staging,
            commands::misc::remove_receipt_images,
            commands::misc::remove_all_app_data,
            commands::misc::open_app_data_dir,
            commands::misc::check_model_status,
            commands::misc::download_models,
            commands::misc::cancel_model_download,
            commands::misc::model_download_progress,
            commands::misc::remove_models,
            commands::python_setup::check_python_env,
            commands::python_setup::setup_python_env,
            commands::python_setup::cancel_python_setup,
            commands::image_library::add_images_to_library,
            commands::image_library::get_image_library,
            commands::image_library::get_library_entry,
            commands::image_library::remove_from_library,
            commands::image_library::clear_library,
            commands::image_library::link_image_to_receipt,
            commands::image_library::update_library_entry_staging,
        ])
        .run(tauri::generate_context!())
        .unwrap_or_else(|e| {
            eprintln!("fatal: tauri application error: {e}");
            std::process::exit(1);
        });
}
