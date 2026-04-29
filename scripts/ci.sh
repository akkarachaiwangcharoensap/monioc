#!/usr/bin/env bash
# Local CI — mirrors the checks that would run in the cloud.
# Usage:
#   ./scripts/ci.sh              # full suite
#   ./scripts/ci.sh --fast       # lint + type-check + unit tests only
#   ./scripts/ci.sh --skip-e2e  # skip browser tests
#   ./scripts/ci.sh --skip-rust  # skip cargo steps
#   ./scripts/ci.sh --skip-python
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

SKIP_E2E=false
SKIP_RUST=false
SKIP_PYTHON=false

for arg in "$@"; do
  case $arg in
    --fast)         SKIP_E2E=true; SKIP_RUST=true; SKIP_PYTHON=true ;;
    --skip-e2e)     SKIP_E2E=true ;;
    --skip-rust)    SKIP_RUST=true ;;
    --skip-python)  SKIP_PYTHON=true ;;
  esac
done

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

PASS=0
FAIL=0
SKIP=0
FAILED_STEPS=()

step() { echo -e "\n${BOLD}${YELLOW}▶ $1${NC}"; }

ok()   { echo -e "${GREEN}✓ $1${NC}"; PASS=$((PASS+1)); }

skip() { echo -e "  – $1 (skipped)"; SKIP=$((SKIP+1)); }

fail() {
  echo -e "${RED}✗ $1${NC}"
  FAIL=$((FAIL+1))
  FAILED_STEPS+=("$1")
}

run() {
  local label="$1"; shift
  if "$@"; then
    ok "$label"
  else
    fail "$label"
  fi
}

echo -e "${BOLD}Running local CI from $REPO_ROOT${NC}"

# ── TypeScript ────────────────────────────────────────────────────────────────
step "Lint"
run "eslint" npm run lint

step "Type-check"
run "tsc --noEmit" npm run type-check

# ── Rust ─────────────────────────────────────────────────────────────────────
if [ "$SKIP_RUST" = true ]; then
  skip "cargo fmt"
  skip "cargo clippy"
  skip "cargo test"
else
  step "Rust format"
  run "cargo fmt --check" bash -c "cd app/src-tauri && cargo fmt --check"

  step "Rust clippy"
  run "cargo clippy" bash -c "cd app/src-tauri && cargo clippy -- -D warnings"

  step "Rust tests"
  run "cargo test" bash -c "cd app/src-tauri && cargo test"
fi

# ── JavaScript unit tests ─────────────────────────────────────────────────────
step "Vitest unit tests"
run "vitest" npm run test

# ── Python tests ──────────────────────────────────────────────────────────────
if [ "$SKIP_PYTHON" = true ]; then
  skip "python unittest"
else
  step "Python tests"
  run "python unittest" bash -c "cd app/src-tauri && python3 -m unittest discover -s . -p 'test_*.py' -v"
fi

# ── Landing page build ────────────────────────────────────────────────────────
step "Landing page build"
run "next build" npm run build:landing

# ── E2E ───────────────────────────────────────────────────────────────────────
if [ "$SKIP_E2E" = true ]; then
  skip "playwright e2e"
else
  step "E2E tests"
  run "playwright" npm run test:e2e
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}Results: ${GREEN}${PASS} passed${NC}  ${RED}${FAIL} failed${NC}  ${SKIP} skipped${NC}"

if [ ${#FAILED_STEPS[@]} -gt 0 ]; then
  echo -e "${RED}Failed:${NC}"
  for s in "${FAILED_STEPS[@]}"; do echo "  • $s"; done
  exit 1
fi

echo -e "${GREEN}${BOLD}All checks passed.${NC}"
