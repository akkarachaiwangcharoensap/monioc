#!/usr/bin/env bash
# setup-python-deps.sh
#
# Creates a Python virtualenv at the app's data directory and installs all
# receipt-scanner dependencies (paddlepaddle, paddleocr, mlx-lm, etc.).
#
# Hooked automatically into `npm run tauri:build` and `npm run tauri:build:app`
# via the npm `pre` lifecycle (pretauri:build / pretauri:build:app).
# Can also be run manually to set up or refresh the environment:
#
#   ./scripts/macos/setup-python-deps.sh [--python /path/to/python3]
#
# The venv is created at:
#   ~/Library/Caches/com.monioc-app/venv
#
# The Rust interpreter resolver checks this path at runtime so the app picks
# it up automatically in production without RECEIPT_PYTHON being set.
#
# Fast-path: if requirements.txt has not changed since the last successful
# install (checked via an MD5 hash stored inside the venv), the script exits
# immediately so CI and local builds stay fast.

set -euo pipefail

# ── Non-macOS: graceful no-op ─────────────────────────────────────────────────
if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "[setup-python-deps] Non-macOS platform detected — skipping Python venv setup."
  echo "  Run the appropriate setup for your platform before deploying."
  exit 0
fi

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
APP_BUNDLE_ID="com.monioc-app"
APP_DATA_DIR="$HOME/Library/Application Support/$APP_BUNDLE_ID"
APP_CACHE_DIR="$HOME/Library/Caches/$APP_BUNDLE_ID"
VENV_DIR="$APP_CACHE_DIR/venv"
REQUIREMENTS="$ROOT_DIR/requirements.txt"
HASH_FILE="$VENV_DIR/.requirements-hash"
PYTHON_BIN="python3"

# ── Parse optional --python flag ─────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --python)
      PYTHON_BIN="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

# ── Sanity checks ─────────────────────────────────────────────────────────────
if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  echo "Python not found: $PYTHON_BIN" >&2
  echo "Install Python 3.11+ from https://www.python.org/downloads/ and rerun." >&2
  exit 1
fi

PYTHON_VERSION="$("$PYTHON_BIN" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')"
PYTHON_MAJOR="${PYTHON_VERSION%%.*}"
PYTHON_MINOR="${PYTHON_VERSION#*.}"
if [[ "$PYTHON_MAJOR" -lt 3 ]] || { [[ "$PYTHON_MAJOR" -eq 3 ]] && [[ "$PYTHON_MINOR" -lt 11 ]]; }; then
  echo "Python 3.11 or newer is required (found $PYTHON_VERSION). Aborting." >&2
  exit 1
fi

if [[ ! -f "$REQUIREMENTS" ]]; then
  echo "requirements.txt not found at: $REQUIREMENTS" >&2
  exit 1
fi

# ── Fast-path: skip when requirements.txt is unchanged ───────────────────────
CURRENT_HASH="$(md5 -q "$REQUIREMENTS" 2>/dev/null || md5sum "$REQUIREMENTS" | cut -d' ' -f1)"
VENV_PYTHON="$VENV_DIR/bin/python3"
CHECK_MODELS="$ROOT_DIR/src-tauri/check_models.py"

if [[ -d "$VENV_DIR" ]] && [[ -x "$VENV_PYTHON" ]] && \
   [[ -f "$HASH_FILE" ]] && [[ "$(cat "$HASH_FILE")" == "$CURRENT_HASH" ]]; then
  echo "[setup-python-deps] Python dependencies are up to date — skipping install."
  echo "  Using: $VENV_PYTHON"
  # Even when deps are cached, verify AI models are downloaded.
  if [[ -f "$CHECK_MODELS" ]]; then
    MODEL_JSON="$("$VENV_PYTHON" "$CHECK_MODELS" 2>/dev/null || echo '{}')"
    if echo "$MODEL_JSON" | grep -q '"ocr": false\|"llm": false'; then
      echo "[setup-python-deps] Some AI models are missing — downloading …"
      "$VENV_PYTHON" "$CHECK_MODELS" --download 2>&1 || true
    else
      echo "[setup-python-deps] AI models are up to date."
    fi
  fi
  exit 0
fi

# ── Set up virtualenv ─────────────────────────────────────────────────────────
echo "[setup-python-deps] App data directory : $APP_DATA_DIR"
echo "[setup-python-deps] Python interpreter : $("$PYTHON_BIN" --version)"
echo "[setup-python-deps] Virtual environment: $VENV_DIR"
echo ""

mkdir -p "$APP_DATA_DIR"
mkdir -p "$APP_CACHE_DIR"

if [[ ! -d "$VENV_DIR" ]]; then
  echo "Creating Python virtual environment …"
  "$PYTHON_BIN" -m venv "$VENV_DIR"
else
  echo "Virtual environment already exists — updating packages …"
fi

VENV_PIP="$VENV_DIR/bin/pip"

echo "Upgrading pip …"
"$VENV_PYTHON" -m pip install --upgrade pip --quiet

# ── Install requirements ──────────────────────────────────────────────────────
echo "Installing receipt-scanner dependencies (this may take several minutes on first run) …"
"$VENV_PIP" install --upgrade -r "$REQUIREMENTS"

# Record the hash so subsequent builds skip the install.
echo "$CURRENT_HASH" > "$HASH_FILE"

# ── Pre-download AI models ────────────────────────────────────────────────────
# Downloads PaddleOCR and LLM models so production builds launch instantly
# without a first-run download step.  The script is idempotent — already-cached
# models are skipped.
if [[ -f "$CHECK_MODELS" ]]; then
  echo ""
  echo "Pre-downloading AI models (PaddleOCR + LLM) …"
  "$VENV_PYTHON" "$CHECK_MODELS" --download 2>&1 || {
    echo "⚠  Model download had issues — the app can still download models on first launch."
  }
else
  echo "⚠  check_models.py not found — skipping model pre-download."
fi

echo ""
echo "✓ Python environment ready."
echo "  The app will use: $VENV_PYTHON"
echo ""
echo "Verify with:"
echo "  $VENV_PYTHON -c \"from paddleocr import PaddleOCR; print('PaddleOCR OK')\""
