#!/usr/bin/env bash
# Wire up local git hooks. Run once after `git init`.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

chmod +x .githooks/pre-push scripts/ci.sh

git config core.hooksPath .githooks

echo "Git hooks installed."
echo "  pre-push  → runs lint, type-check, unit tests, and rust checks before every push"
echo "  Skip with: git push --no-verify"
echo "  Full suite: ./scripts/ci.sh"
echo "  Fast mode:  ./scripts/ci.sh --fast"
