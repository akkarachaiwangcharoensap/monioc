# Contributing to Monioc

Thanks for your interest in contributing. Here's everything you need to know.

---

## Getting Started

1. Fork the repository and clone your fork:

   ```bash
   git clone https://github.com/your-username/monioc-os.git
   cd monioc-os
   npm install
   ```

2. Follow [GETTING_STARTED.md](GETTING_STARTED.md) to install all prerequisites.

3. Install the git hooks (one-time):

   ```bash
   bash scripts/install-hooks.sh
   ```

4. Create a branch for your change:

   ```bash
   git checkout -b feat/my-feature
   ```

---

## Branch Naming

| Prefix | Use for |
|---|---|
| `feat/` | New features |
| `fix/` | Bug fixes |
| `docs/` | Documentation only |
| `refactor/` | Code cleanup with no behaviour change |
| `test/` | New or updated tests |

---

## Before Pushing

The pre-push hook runs automatically after `bash scripts/install-hooks.sh`. It executes lint, type-check, and unit tests. All checks must pass before a push goes through.

To run the full suite manually (including Rust, Python, and e2e):

```bash
npm run ci
```

For a faster feedback loop during development:

```bash
npm run ci:fast     # lint + type-check + unit tests only
```

Individual checks:

```bash
npm run lint        # ESLint
npm run type-check  # TypeScript (tsc --noEmit)

cd app/src-tauri
cargo fmt --check   # Rust formatting
cargo clippy -- -D warnings   # Rust lints (zero warnings)
cargo test          # Rust tests

npm run test        # Vitest unit tests (from repo root)
npm run test:e2e    # Playwright e2e (from repo root)

cd app/src-tauri
python3 -m unittest discover -s . -p 'test_*.py' -v   # Python tests
```

---

## Code Style

**TypeScript / React**

- No comments unless the *why* is non-obvious (a hidden constraint, a workaround for a specific bug, a subtle invariant). Don't explain what the code does — names do that.
- No `any` types. Use `unknown` with narrowing, or `as unknown as T` for partial mock return values in tests.
- Hook dependency arrays must be complete. ESLint's `exhaustive-deps` rule is enforced.
- Don't add error handling for scenarios that can't happen. Trust framework guarantees and only validate at system boundaries.
- Don't add features beyond what the task requires. Three similar lines is better than a premature abstraction.

**Rust**

- `cargo fmt` and `cargo clippy -- -D warnings` must pass with no warnings.
- Prefer `?` and typed `AppError` variants over `unwrap()` / `expect()` in production code paths.

**General**

- Keep PRs focused. One bug fix or one feature per PR.
- New features should include tests. Bug fixes should include a regression test where practical.

---

## Opening a Pull Request

A good PR description includes:

- **What** changed and why
- **How** you tested it (which commands, any manual steps)
- **Screenshots** if there's a UI change

---

## Reporting Issues

When filing a bug, please include:

1. Steps to reproduce
2. Expected behaviour
3. Actual behaviour
4. OS and app version (shown in the sidebar footer)
5. Any relevant log output

Open issues at: https://github.com/your-org/monioc-os/issues
