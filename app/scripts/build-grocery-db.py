#!/usr/bin/env python3
"""
Cross-platform grocery.sqlite3 builder for Monioc.
Works on macOS, Linux, and Windows.

Skips rebuild when grocery.sqlite3 is newer than the source CSV and is
populated, unless --force is passed.

Usage:
    python3 scripts/build-grocery-db.py [--force]
"""

import argparse
import os
import platform
import sqlite3
import subprocess
import sys
from pathlib import Path

APP_BUNDLE_ID = "com.monioc-app"
_system = platform.system()


def get_venv_python(root_dir: Path) -> str:
    """Return the venv Python path, falling back to system Python."""
    if _system == "Darwin":
        p = Path.home() / "Library" / "Caches" / APP_BUNDLE_ID / "venv" / "bin" / "python3"
        if p.exists():
            return str(p)
    elif _system == "Windows":
        base = os.environ.get("LOCALAPPDATA") or (Path.home() / "AppData" / "Local")
        p = Path(base) / APP_BUNDLE_ID / "venv" / "Scripts" / "python.exe"
        if p.exists():
            return str(p)
    else:
        p = Path.home() / ".cache" / APP_BUNDLE_ID / "venv" / "bin" / "python3"
        if p.exists():
            return str(p)

    # CI / local fallback: project-local venv
    local_venv = (
        root_dir / "venv" / "Scripts" / "python.exe"
        if _system == "Windows"
        else root_dir / "venv" / "bin" / "python3"
    )
    if local_venv.exists():
        return str(local_venv)

    return os.environ.get("PYTHON") or ("python" if _system == "Windows" else "python3")


def db_is_populated(db_path: Path) -> bool:
    try:
        con = sqlite3.connect(str(db_path))
        count = con.execute("SELECT count(*) FROM grocery_prices").fetchone()[0]
        con.close()
        return count > 0
    except Exception:
        return False


def ensure_pandas(python_exe: str) -> None:
    result = subprocess.run([python_exe, "-c", "import pandas"], capture_output=True)
    if result.returncode != 0:
        print("[build-grocery-db] pandas not found — installing into current environment...")
        r = subprocess.run([python_exe, "-m", "pip", "install", "--quiet", "pandas"])
        if r.returncode != 0:
            sys.exit("[build-grocery-db] Failed to install pandas. Run: python3 scripts/setup-python-deps.py")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="Unconditionally rebuild the database")
    args = parser.parse_args()
    force = args.force or os.environ.get("FORCE_REBUILD") == "1"

    root_dir = Path(__file__).resolve().parent.parent
    py_script = root_dir / "src-tauri" / "process_statscan_to_sqlite.py"
    csv_input = root_dir / "data" / "statscan-full.csv"
    db_output = root_dir / "build" / "grocery.sqlite3"

    if not csv_input.exists():
        sys.exit(
            f"[build-grocery-db] ERROR: CSV not found: {csv_input}\n"
            "  Place the StatsCan CSV at data/statscan-full.csv and retry."
        )

    python_exe = get_venv_python(root_dir)
    ensure_pandas(python_exe)

    # Up-to-date check.
    if not force and db_output.exists():
        if db_output.stat().st_mtime > csv_input.stat().st_mtime and db_is_populated(db_output):
            print("[build-grocery-db] grocery.sqlite3 is up to date — skipping rebuild.")
            print("  Pass --force to unconditionally rebuild.")
            return

    ver = subprocess.check_output([python_exe, "--version"], text=True).strip()
    print("[build-grocery-db] Building grocery.sqlite3...")
    print(f"  Python   : {python_exe} ({ver})")
    print(f"  Input    : {csv_input}")
    print(f"  Output   : {db_output}")
    print()

    db_output.parent.mkdir(parents=True, exist_ok=True)
    result = subprocess.run([python_exe, str(py_script), str(csv_input), str(db_output)])
    if result.returncode != 0:
        sys.exit(result.returncode)

    size_mb = db_output.stat().st_size / 1024 / 1024
    print(f"\n[build-grocery-db] Build complete: {db_output}")
    print(f"  Size:  {size_mb:.0f}M")


if __name__ == "__main__":
    main()
