#!/usr/bin/env python3
"""
Cross-platform Python venv setup for Monioc.
Works on macOS, Linux, and Windows.

Creates a virtualenv and installs all receipt-scanner dependencies.

Fast-path: if requirements.txt has not changed since the last successful
install (tracked via an MD5 hash inside the venv), the script exits immediately.

Usage:
    python3 scripts/setup-python-deps.py [--python /path/to/python3]
"""

from __future__ import annotations

import argparse
import hashlib
import os
import platform
import shutil
import subprocess
import sys
from pathlib import Path

APP_BUNDLE_ID = "com.monioc-app"
MIN_VERSION = (3, 11)
_system = platform.system()


def get_cache_dir() -> Path:
    if _system == "Darwin":
        return Path.home() / "Library" / "Caches" / APP_BUNDLE_ID
    if _system == "Windows":
        base = os.environ.get("LOCALAPPDATA") or (Path.home() / "AppData" / "Local")
        return Path(base) / APP_BUNDLE_ID / "cache"
    return Path.home() / ".cache" / APP_BUNDLE_ID


def get_data_dir() -> Path:
    if _system == "Darwin":
        return Path.home() / "Library" / "Application Support" / APP_BUNDLE_ID
    if _system == "Windows":
        base = os.environ.get("APPDATA") or (Path.home() / "AppData" / "Roaming")
        return Path(base) / APP_BUNDLE_ID
    return Path.home() / ".local" / "share" / APP_BUNDLE_ID


def venv_python(venv_dir: Path) -> Path:
    if _system == "Windows":
        return venv_dir / "Scripts" / "python.exe"
    return venv_dir / "bin" / "python3"


def venv_pip(venv_dir: Path) -> Path:
    if _system == "Windows":
        return venv_dir / "Scripts" / "pip.exe"
    return venv_dir / "bin" / "pip"


def python_version(exe: str) -> tuple[int, int] | None:
    try:
        out = subprocess.check_output(
            [exe, "-c", "import sys; print(sys.version_info.major, sys.version_info.minor)"],
            stderr=subprocess.DEVNULL, text=True, timeout=5,
        )
        major, minor = map(int, out.strip().split())
        return (major, minor)
    except Exception:
        return None


def meets_min(exe: str) -> bool:
    v = python_version(exe)
    return v is not None and v >= MIN_VERSION


def find_python(requested: str) -> str:
    if meets_min(requested):
        return requested

    candidates = (
        ["python3.13", "python3.12", "python3.11",
         "/opt/homebrew/bin/python3.13", "/opt/homebrew/bin/python3.12", "/opt/homebrew/bin/python3.11"]
        if _system != "Windows"
        else ["python3.13", "python3.12", "python3.11", "python3", "python"]
    )
    for c in candidates:
        if shutil.which(c) and meets_min(c):
            return c

    v = python_version(requested)
    ver_str = f"{v[0]}.{v[1]}" if v else "unknown"
    sys.exit(
        f"Python {MIN_VERSION[0]}.{MIN_VERSION[1]}+ is required (found {ver_str}). "
        "Install from https://www.python.org/downloads/ and rerun."
    )


def md5(path: Path) -> str:
    return hashlib.md5(path.read_bytes()).hexdigest()


def run(*args: str) -> None:
    result = subprocess.run(list(args))
    if result.returncode != 0:
        sys.exit(result.returncode)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--python", default="python3" if _system != "Windows" else "python")
    args = parser.parse_args()

    root_dir = Path(__file__).resolve().parent.parent
    venv_dir = get_cache_dir() / "venv"
    requirements = root_dir / "data" / "requirements.txt"
    hash_file = venv_dir / ".requirements-hash"
    py = venv_python(venv_dir)
    check_models = root_dir / "src-tauri" / "check_models.py"

    if not requirements.exists():
        sys.exit(f"requirements.txt not found at: {requirements}")

    # Fast path: skip when requirements.txt is unchanged.
    if py.exists() and hash_file.exists() and hash_file.read_text().strip() == md5(requirements):
        print("[setup-python-deps] Python dependencies are up to date — skipping install.")
        print(f"  Using: {py}")
        if check_models.exists():
            r = subprocess.run([str(py), str(check_models)], capture_output=True, text=True, timeout=30)
            json_out = r.stdout or "{}"
            if '"ocr": false' in json_out or '"llm": false' in json_out:
                print("[setup-python-deps] Some AI models are missing — downloading …")
                subprocess.run([str(py), str(check_models), "--download"])
            else:
                print("[setup-python-deps] AI models are up to date.")
        return

    python_exe = find_python(args.python)
    v = python_version(python_exe)
    ver_str = f"{v[0]}.{v[1]}" if v else "?"

    print(f"[setup-python-deps] App data directory : {get_data_dir()}")
    print(f"[setup-python-deps] Python interpreter : Python {ver_str} ({python_exe})")
    print(f"[setup-python-deps] Virtual environment: {venv_dir}")
    print()

    get_data_dir().mkdir(parents=True, exist_ok=True)
    get_cache_dir().mkdir(parents=True, exist_ok=True)

    if not venv_dir.exists():
        print("Creating Python virtual environment …")
        run(python_exe, "-m", "venv", str(venv_dir))
    else:
        print("Virtual environment already exists — updating packages …")

    print("Upgrading pip …")
    run(str(py), "-m", "pip", "install", "--upgrade", "pip", "--quiet")

    print("Installing receipt-scanner dependencies (this may take several minutes on first run) …")
    run(str(venv_pip(venv_dir)), "install", "--upgrade", "-r", str(requirements))

    hash_file.write_text(md5(requirements))

    if check_models.exists():
        print("\nPre-downloading AI models (PaddleOCR + LLM) …")
        result = subprocess.run([str(py), str(check_models), "--download"])
        if result.returncode != 0:
            print("  Model download had issues — the app can still download models on first launch.")
    else:
        print("  check_models.py not found — skipping model pre-download.")

    print(f"\n✓ Python environment ready.")
    print(f"  The app will use: {py}")


if __name__ == "__main__":
    main()
