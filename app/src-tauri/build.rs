use std::path::Path;

fn main() {
    // Ensure build/grocery.sqlite3 exists before tauri-build validates resources.
    //
    // During a full `npm run tauri:build` the database is already produced by
    // the `prebuild` hook (`scripts/build-grocery-db.sh`) with real data.
    // For plain `cargo check` / IDE usage, we create a schema-only placeholder
    // so the resource path is valid without requiring Python to run.
    let db_path = Path::new("../build/grocery.sqlite3");
    if !db_path.exists() {
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent).ok();
        }
        create_placeholder_grocery_db(db_path);
    }

    tauri_build::build()
}

/// Create a minimal grocery.sqlite3 containing only the schema (no data rows).
/// This satisfies Tauri's resource-existence check without needing Python.
fn create_placeholder_grocery_db(path: &Path) {
    let conn = match rusqlite::Connection::open(path) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("Warning: could not create placeholder grocery.sqlite3: {e}");
            return;
        }
    };

    let schema = "
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS grocery_categories (
            id   INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT    NOT NULL UNIQUE
        );
        CREATE TABLE IF NOT EXISTS grocery_locations (
            id       INTEGER PRIMARY KEY AUTOINCREMENT,
            location TEXT    NOT NULL UNIQUE,
            city     TEXT    NOT NULL DEFAULT '',
            province TEXT    NOT NULL DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS grocery_products (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT    NOT NULL UNIQUE,
            category_id INTEGER NOT NULL REFERENCES grocery_categories(id),
            unit        TEXT    NOT NULL DEFAULT 'unit'
        );
        CREATE TABLE IF NOT EXISTS grocery_prices (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            date           TEXT    NOT NULL,
            product_id     INTEGER NOT NULL REFERENCES grocery_products(id),
            location_id    INTEGER NOT NULL REFERENCES grocery_locations(id),
            price_per_unit REAL    NOT NULL,
            UNIQUE(date, product_id, location_id)
        );
        CREATE INDEX IF NOT EXISTS idx_prices_product_id  ON grocery_prices(product_id);
        CREATE INDEX IF NOT EXISTS idx_prices_location_id ON grocery_prices(location_id);
        CREATE INDEX IF NOT EXISTS idx_prices_date        ON grocery_prices(date);
        CREATE INDEX IF NOT EXISTS idx_products_category  ON grocery_products(category_id);
    ";

    if let Err(e) = conn.execute_batch(schema) {
        eprintln!("Warning: could not initialize placeholder grocery.sqlite3 schema: {e}");
    }
}
