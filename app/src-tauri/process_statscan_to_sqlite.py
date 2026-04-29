"""
Statistics Canada CSV to SQLite Processor.

==========================================

Processes Statistics Canada grocery price data and stores it in a normalized
SQLite database for efficient querying in the Tauri desktop app.

Schema (3NF) Third Norm Form:
    grocery_categories(id, name)
    grocery_locations(id, location, city, province)
    grocery_products(id, name, category_id, unit)
    grocery_prices(id, date, product_id, location_id, price_per_unit)

Usage:
    python process_statscan_to_sqlite.py input.csv output.sqlite3

Example:
    python process_statscan_to_sqlite.py data/statscan-full.csv \\
        build/grocery.sqlite3
"""

import re
import sqlite3
import sys
from pathlib import Path
from typing import Dict, List, Tuple

import pandas as pd


# ── Schema DDL ────────────────────────────────────────────────────────────────

SCHEMA_SQL = """
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

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
"""


class StatCanSQLiteProcessor:
    """Process Statistics Canada grocery price data into a normalized SQLite DB.

    This processor transforms raw StatCan CSV data into a structured SQLite
    database with proper relational tables for efficient querying. It applies
    the same cleaning/normalization logic as the JSON processor:

    - Product name cleaning and normalization
    - Weight/unit extraction from package sizes and per-unit pricing
    - Category inference based on product keywords
    - Price normalization (per-unit pricing)
    - Location parsing into city + province

    The key logic:
    - Products with "per kilogram" in description: price is already per kg
    - Products with "500 grams" in description: package price / 0.5 = per kg
    """

    # Regex patterns for data extraction
    PER_UNIT_EXPR = (
        r"per\s+(kilogram|kg|gram|g|litre|l|ml|millilitre)s?\b"
    )
    PACKAGE_SIZE_EXPR = (
        r"\b(\d+(\.\d+)?)\s*"
        r"(kg|kilogram(s)?|g|gram(s)?|l|litre(s)?|ml|millilitre(s)?)\b"
    )
    PER_EXPR = r",?\s*per\b.*$"
    QUANTITY_EXPR = r"\b\d+\s*(dozen|bags?|packs?|items?)\b"
    UNIT_GARBAGE = (
        r"\b(kilo)?gram(s)?\b|"
        r"\b(litre|litres|liter|liters)\b|"
        r"\bunit\b"
    )

    # Category keywords for classification.
    # Order matters — more specific categories must precede general ones.
    CATEGORY_KEYWORDS: Dict[str, List[str]] = {
        "produce": [
            "potatoes", "sweet potatoes", "tomatoes", "carrots", "onions",
            "celery", "cucumber", "iceberg lettuce", "romaine lettuce",
            "broccoli", "bell pepper", "peppers", "avocado", "cabbage",
            "mushrooms", "squash", "salad greens",
            "cantaloupe", "apples", "oranges", "bananas", "pears",
            "grapes", "strawberries", "lemons", "limes",
        ],
        "meat_and_seafood": [
            "pork loin", "pork", "bacon",
            "beef stewing", "beef striploin", "beef top sirloin",
            "beef rib", "ground beef", "beef",
            "whole chicken", "chicken breast", "chicken thigh",
            "chicken drumsticks", "chicken",
            "wieners",
            "salmon", "shrimp", "tuna",
        ],
        "dairy_and_eggs": [
            "milk", "cow milk", "soy milk", "nut milk", "cream", "butter",
            "block cheese", "yogurt", "eggs", "tofu"
        ],
        "bakery": [
            "white bread", "flatbread", "pita",
        ],
        "pantry": [
            "dry pasta", "fresh pasta", "pasta", "brown rice", "white rice",
            "crackers", "crisp bread",
            "peanut butter", "pasta sauce", "cereal",
            "wheat flour", "wheet flour", "flour",
            "margarine", "vegetable oil", "canola oil", "olive oil",
            "white sugar", "brown sugar",
            "ketchup", "mayonnaise", "salad dressing",
            "peanuts", "almonds", "sunflower seeds",
            "dried lentils", "dry beans and legumes", "dry bean", "legume", "bean",
            "canned tomatoes", "canned baked beans", "canned soup",
            "canned beans and lentils", "canned beans", "canned lentils", "canned corn",
            "canned peach", "canned pear", "canned salmon", "canned tuna",
        ],
        "frozen": [
            "frozen french fries potatoes", "frozen broccoli", "frozen green beans",
            "frozen corn", "frozen mixed vegetables", "frozen peas",
            "frozen pizza", "frozen spinach", "frozen strawberries",
        ],
        "snacks": [
            "cookie", "cookies", "sweet biscuit", "biscuit",
        ],
        "beverages": [
            "apple juice", "roasted coffee", "ground coffee", "coffee", "tea",
        ],
        "deli_and_prepared": [
            "meatless burgers", "hummus", "salsa",
        ],
        "baby": [
            "baby food", "infant formula",
        ],
        "household": [
            "laundry detergent",
        ],
        "personal_care": [
            "deodorant", "toothpaste", "tooth paste", "shampoo", "conditioner",
        ],
    }

    def __init__(self) -> None:
        """Initialize the processor and compile regex patterns."""
        self.per_unit_regex = re.compile(self.PER_UNIT_EXPR, re.IGNORECASE)
        self.package_size_regex = re.compile(self.PACKAGE_SIZE_EXPR, re.IGNORECASE)
        self.clean_regex = re.compile(
            (
                f"({self.PACKAGE_SIZE_EXPR})|"
                f"({self.QUANTITY_EXPR})|"
                f"({self.UNIT_GARBAGE})"
            ),
            re.IGNORECASE,
        )

    def process(self, input_file: str, output_file: str) -> None:
        """Process CSV file and write to SQLite.

        Args:
            input_file: Path to the input StatsCan CSV file.
            output_file: Path to the output SQLite database file.

        Raises:
            FileNotFoundError: If the input file does not exist.
            pd.errors.EmptyDataError: If the CSV is empty.
        """
        print(f"Reading data from {input_file}...")
        df = pd.read_csv(input_file, low_memory=False)
        print(f"Loaded {len(df)} rows")

        print("\nTransforming data...")
        df = self._transform(df)

        output_path = Path(output_file)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        # Remove stale database so we always produce a clean build artifact.
        if output_path.exists():
            output_path.unlink()
            print(f"Removed existing database at {output_file}")

        print(f"\nWriting to SQLite: {output_file}")
        conn = sqlite3.connect(output_file)
        try:
            conn.executescript(SCHEMA_SQL)
            self._insert_data(conn, df)
            conn.commit()
        finally:
            conn.close()

        print(f"\nDone! Processed {len(df)} rows → {output_file}")
        self._print_summary(df, output_file)

    # ── Transform ─────────────────────────────────────────────────────────────

    def _transform(self, df: pd.DataFrame) -> pd.DataFrame:
        """Transform raw CSV data into clean, structured format.

        Steps applied in order:
        1. Rename columns to standardized names
        2. Format dates to YYYY-MM-DD
        3. Detect per-unit pricing vs package pricing
        4. Extract weight/unit from product descriptions
        5. Clean product names
        6. Infer product categories
        7. Normalize prices (divide package price by weight when needed)
        8. Format and parse location strings into city + province
        9. Filter out invalid prices (≤ 0)

        Args:
            df: Raw DataFrame from CSV.

        Returns:
            Transformed DataFrame.
        """
        df = df.rename(
            columns={
                "REF_DATE": "date",
                "GEO": "location",
                "Products": "product_raw",
                "VALUE": "product_price",
            }
        )

        df["date"] = df["date"].apply(self._format_date)

        df["is_per_unit"] = df["product_raw"].str.contains(
            self.PER_UNIT_EXPR, regex=True, case=False, na=False
        )

        df[["product_weight", "product_unit"]] = df["product_raw"].apply(
            lambda x: pd.Series(self._extract_weight_and_unit(x))
        )

        df["product_name"] = df["product_raw"].apply(self._clean_product_name)
        df["product_category"] = df["product_name"].apply(self._infer_category)

        df["price_per_unit"] = df.apply(
            lambda row: (
                row["product_price"]
                if row["is_per_unit"]
                else (
                    row["product_price"] / row["product_weight"]
                    if row["product_weight"] > 0
                    else row["product_price"]
                )
            ),
            axis=1,
        ).round(2)

        df["location"] = df["location"].str.strip().str.title()
        df[["city", "province"]] = df["location"].apply(
            lambda x: pd.Series(self._parse_location(x))
        )

        # Drop rows with invalid prices
        df = df[df["price_per_unit"] > 0].copy()

        return df

    # ── SQLite insertion ──────────────────────────────────────────────────────

    def _insert_data(self, conn: sqlite3.Connection, df: pd.DataFrame) -> None:
        """Insert transformed data into all four relational tables.

        Uses INSERT OR IGNORE for dimension tables to handle duplicates
        gracefully, then performs bulk-insert for the fact table.

        Args:
            conn: Open SQLite connection (caller manages commit/rollback).
            df: Transformed DataFrame from :meth:`_transform`.
        """
        print("  Inserting categories...")
        categories = df["product_category"].unique().tolist()
        conn.executemany(
            "INSERT OR IGNORE INTO grocery_categories (name) VALUES (?)",
            [(c,) for c in categories],
        )

        print("  Inserting locations...")
        locations = (
            df[["location", "city", "province"]]
            .drop_duplicates(subset=["location"])
            .to_dict("records")
        )
        conn.executemany(
            "INSERT OR IGNORE INTO grocery_locations (location, city, province) VALUES (?, ?, ?)",
            [(r["location"], r["city"], r["province"]) for r in locations],
        )

        print("  Inserting products...")
        products = (
            df[["product_name", "product_category", "product_unit"]]
            .drop_duplicates(subset=["product_name"])
            .to_dict("records")
        )
        conn.executemany(
            """INSERT OR IGNORE INTO grocery_products (name, category_id, unit)
               VALUES (
                   ?,
                   (SELECT id FROM grocery_categories WHERE name = ?),
                   ?
               )""",
            [(r["product_name"], r["product_category"], r["product_unit"]) for r in products],
        )

        print(f"  Inserting {len(df)} price records...")
        price_rows = df[
            ["date", "product_name", "location", "price_per_unit"]
        ].to_dict("records")

        conn.executemany(
            """INSERT OR IGNORE INTO grocery_prices (date, product_id, location_id, price_per_unit)
               VALUES (
                   ?,
                   (SELECT id FROM grocery_products  WHERE name     = ?),
                   (SELECT id FROM grocery_locations WHERE location = ?),
                   ?
               )""",
            [
                (r["date"], r["product_name"], r["location"], r["price_per_unit"])
                for r in price_rows
            ],
        )

    # ── Cleaning helpers ──────────────────────────────────────────────────────

    def _format_date(self, date_str: str) -> str:
        """Format date string to YYYY-MM-DD.

        Converts "YYYY-MM" to "YYYY-MM-01"; passes through other formats.

        Args:
            date_str: Date string from CSV.

        Returns:
            Formatted date string (YYYY-MM-DD).
        """
        date_str = str(date_str).strip()
        if re.match(r"^\d{4}-\d{2}$", date_str):
            return f"{date_str}-01"
        return date_str

    def _extract_weight_and_unit(self, text: str) -> Tuple[float, str]:
        """Extract weight value and unit from product description.

        Handles two cases:
        1. "per kilogram" → weight=1.0, unit="kg" (already per-unit)
        2. "500 grams"    → weight=0.5, unit="kg" (package size, divide price)

        All weights are normalized to standard SI units (kg, L).

        Args:
            text: Product description text.

        Returns:
            Tuple of (normalized_weight, unit_string).
        """
        per_match = self.per_unit_regex.search(text)
        if per_match:
            unit_text = per_match.group(1).lower()
            if unit_text in ("kilogram", "kg"):
                return 1.0, "kg"
            elif unit_text in ("gram", "g"):
                return 1.0, "kg"
            elif unit_text in ("litre", "l"):
                return 1.0, "L"
            elif unit_text in ("ml", "millilitre"):
                return 1.0, "L"
            else:
                return 1.0, "kg"

        package_match = self.package_size_regex.search(text)
        if package_match:
            value = float(package_match.group(1))
            unit = package_match.group(3).lower()

            if unit == "g" or (
                unit.startswith("gram") and not unit.startswith("kilogram")
            ):
                return value / 1000, "kg"
            if "ml" in unit or unit.startswith("millilitre"):
                return value / 1000, "L"
            if unit == "l" or unit.startswith("litre"):
                return value, "L"
            return value, "kg"

        return 1.0, "unit"

    def _clean_product_name(self, text: str) -> str:
        """Clean product name by removing weights, units, and extra text.

        Removes weight/unit info, "per X" phrases, quantity phrases,
        parenthetical content, and normalizes whitespace.

        Args:
            text: Raw product name from CSV.

        Returns:
            Cleaned product name in title case.
        """
        text = re.sub(self.PER_EXPR, "", text, flags=re.IGNORECASE)
        text = self.clean_regex.sub("", text)
        text = re.sub(r"\(.*?\)", "", text)
        text = re.sub(r"[^\w\s]", "", text)
        text = re.sub(r"\s{2,}", " ", text)
        return text.strip().title()

    def _infer_category(self, name: str) -> str:
        """Infer product category from product name using word-boundary matching.

        Iterates category keywords in declaration order (most-specific first)
        and returns the first match. Returns "other" if nothing matches.

        Args:
            name: Cleaned product name.

        Returns:
            Category key string (e.g. "produce", "dairy_and_eggs").
        """
        name_lower = name.lower()
        for category, keywords in self.CATEGORY_KEYWORDS.items():
            for keyword in keywords:
                pattern = rf"\b{re.escape(keyword)}\b"
                if re.search(pattern, name_lower):
                    return category
        return "other"

    def _parse_location(self, location: str) -> Tuple[str, str]:
        """Parse location string into city and province.

        Handles:
        - "Canada"            → ("", "Canada")
        - "Toronto, Ontario"  → ("Toronto", "Ontario")

        Args:
            location: Location string from CSV.

        Returns:
            Tuple of (city, province).
        """
        parts = [p.strip() for p in location.split(",")]
        if len(parts) >= 2:
            return parts[0], parts[1]
        return "", location

    # ── Summary ───────────────────────────────────────────────────────────────

    def _print_summary(self, df: pd.DataFrame, output_file: str) -> None:
        """Print processing summary statistics to stdout.

        Args:
            df: Transformed DataFrame.
            output_file: Path to the output SQLite file (to report file size).
        """
        size_mb = Path(output_file).stat().st_size / (1024 * 1024)
        print("\n" + "=" * 60)
        print("PROCESSING SUMMARY")
        print("=" * 60)
        print(f"Total price records : {len(df)}")
        print(f"Unique products     : {df['product_name'].nunique()}")
        print(f"Unique categories   : {df['product_category'].nunique()}")
        print(f"Unique locations    : {df['location'].nunique()}")
        print(f"Date range          : {df['date'].min()} → {df['date'].max()}")
        print(f"Database size       : {size_mb:.2f} MB")
        print("\nCategory breakdown:")
        for cat, count in df["product_category"].value_counts().head(10).items():
            print(f"  {cat:<25} {count:>7} records")
        print("=" * 60)


def main() -> None:
    """Entry point: parse CLI args and run the processing pipeline.

    Usage:
        python process_statscan_to_sqlite.py input.csv output.sqlite3
    """
    if len(sys.argv) != 3:
        print(
            "Usage: python process_statscan_to_sqlite.py "
            "input.csv output.sqlite3"
        )
        print("\nExample:")
        print(
            "  python process_statscan_to_sqlite.py "
            "data/statscan-full.csv build/grocery.sqlite3"
        )
        sys.exit(1)

    input_file = sys.argv[1]
    output_file = sys.argv[2]

    if not Path(input_file).exists():
        print(f"Error: Input file not found: {input_file}")
        sys.exit(1)

    processor = StatCanSQLiteProcessor()
    processor.process(input_file, output_file)


if __name__ == "__main__":
    main()
