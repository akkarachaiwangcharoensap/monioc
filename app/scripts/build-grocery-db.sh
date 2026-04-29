#!/usr/bin/env bash
# build-grocery-db.sh
#
# Build the grocery.sqlite3 reference database from the StatsCan CSV.
#
# This script is called automatically as part of the Tauri build pipeline
# (see tauri.conf.json beforeBuildCommand / package.json prebuild hooks).
# It is safe to run multiple times — the database is only rebuilt when
# the source CSV is newer than the existing artifact.
#
# The generated file is placed at:
#   build/grocery.sqlite3
#
# …which is bundled as a Tauri resource (see tauri.conf.json) and later
# copied to the user's app-data directory on first launch by the Rust
# startup code.
#
# Environment variables:
#   FORCE_REBUILD=1   — delete and rebuild the database unconditionally
#   PYTHON            — override the Python interpreter (default: python3)
#
# Usage:
#   ./scripts/build-grocery-db.sh
#   FORCE_REBUILD=1 ./scripts/build-grocery-db.sh

set -euo pipefail

# ── Paths ─────────────────────────────────────────────────────────────────────
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT="$ROOT_DIR/src-tauri/process_statscan_to_sqlite.py"
CSV_INPUT="$ROOT_DIR/data/statscan-full.csv"
DB_OUTPUT="$ROOT_DIR/build/grocery.sqlite3"

# ── Python interpreter ────────────────────────────────────────────────────────
# Prefer the project venv if it exists (matches the Tauri runtime environment),
# then fall back to the PYTHON env var or system python3.
APP_BUNDLE_ID="com.monioc-app"
VENV_PYTHON="$HOME/Library/Caches/$APP_BUNDLE_ID/venv/bin/python3"

if [[ -x "$VENV_PYTHON" ]]; then
  PYTHON_CMD="$VENV_PYTHON"
elif [[ -n "${PYTHON:-}" ]]; then
  PYTHON_CMD="$PYTHON"
else
  PYTHON_CMD="python3"
fi

# On CI (Linux/Windows), fall back further if the venv path doesn't apply.
if [[ "$(uname -s)" != "Darwin" ]]; then
  # Try project-local venv first (created by CI pipeline)
  LOCAL_VENV="$ROOT_DIR/venv/bin/python3"
  if [[ -x "$LOCAL_VENV" ]]; then
    PYTHON_CMD="$LOCAL_VENV"
  else
    PYTHON_CMD="${PYTHON:-python3}"
  fi
fi

# ── Sanity checks ─────────────────────────────────────────────────────────────
if [[ ! -f "$CSV_INPUT" ]]; then
  echo "[build-grocery-db] ERROR: CSV not found: $CSV_INPUT" >&2
  echo "  Place the StatsCan CSV at data/statscan-full.csv and retry." >&2
  exit 1
fi

if ! command -v "$PYTHON_CMD" >/dev/null 2>&1; then
  echo "[build-grocery-db] ERROR: Python interpreter not found: $PYTHON_CMD" >&2
  exit 1
fi

# Ensure pandas is available
if ! "$PYTHON_CMD" -c "import pandas" >/dev/null 2>&1; then
  echo "[build-grocery-db] pandas not found — installing into current environment..."
  "$PYTHON_CMD" -m pip install --quiet pandas
fi

# ── Up-to-date check ──────────────────────────────────────────────────────────
# Skip rebuild when the database is newer than the CSV source, FORCE_REBUILD
# is not set, AND the database is actually populated (has rows in grocery_prices).
_db_is_populated() {
  command -v sqlite3 >/dev/null 2>&1 || return 1
  local count
  count="$(sqlite3 "$DB_OUTPUT" "SELECT count(*) FROM grocery_prices;" 2>/dev/null || echo 0)"
  [[ "$count" -gt 0 ]]
}

if [[ -f "$DB_OUTPUT" ]] && [[ "${FORCE_REBUILD:-0}" != "1" ]]; then
  if [[ "$DB_OUTPUT" -nt "$CSV_INPUT" ]] && _db_is_populated; then
    echo "[build-grocery-db] grocery.sqlite3 is up to date — skipping rebuild."
    echo "  Set FORCE_REBUILD=1 to force a full rebuild."
    exit 0
  fi
fi

# ── Build ─────────────────────────────────────────────────────────────────────
echo "[build-grocery-db] Building grocery.sqlite3..."
echo "  Python   : $PYTHON_CMD ($("$PYTHON_CMD" --version 2>&1))"
echo "  Input    : $CSV_INPUT"
echo "  Output   : $DB_OUTPUT"
echo ""

mkdir -p "$(dirname "$DB_OUTPUT")"

"$PYTHON_CMD" "$SCRIPT" "$CSV_INPUT" "$DB_OUTPUT"

echo ""
echo "[build-grocery-db] Build complete: $DB_OUTPUT"
echo "  Size: $(du -sh "$DB_OUTPUT" | cut -f1)"
