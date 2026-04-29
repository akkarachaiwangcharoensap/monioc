# Monioc

**NOTE**

This is an experimental “vibe-coding” project built with Copilot Opus, Sonnet, Claude Code, and OCR/LLM research for receipt data extraction in an expense tracking app. While cloud LLMs with agentic capabilities are powerful prototyping tools, they often lack a strong understanding of overall system architecture and become increasingly difficult to manage as project scope grows. This frequently results in messy, unmaintainable code and weak long-term design decisions. In my experience, they are highly effective for rapid prototyping and generating test cases, but still fall short of production and enterprise-grade software quality without strong engineering oversight. Effectively using these tools requires thoughtful planning, solid system design knowledge, and active control by the developer; blindly accepting AI-generated changes is not sufficient.

**Free, open-source grocery price tracking.**

[![Latest Release](https://img.shields.io/github/v/release/your-org/monioc-os)](https://github.com/your-org/monioc-os/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## Features

- **Receipt scanning** — drop any receipt image; a local AI model extracts items and prices offline and privately
- **Grocery price comparison** — compare your spending to Statistics Canada provincial averages
- **Dashboard analytics** — spending by category, week, or month
- **Price trends** — see how your grocery costs change over time
- **Search & filter** — by category, store, date range
- **Export to CSV** — take your data anywhere
- **Manual backup & restore** — full control of your data
- **Custom categories** — organise receipts your way
- **Fully offline** — all data stored locally, no account required
- **Cross-platform** — macOS, Windows, Linux

---

## Download

Get the latest pre-built binary for your platform from the [Releases page](https://github.com/your-org/monioc-os/releases/latest):

| Platform | File |
|---|---|
| macOS (Apple Silicon) | `Monioc_aarch64.dmg` |
| macOS (Intel) | `Monioc_x64.dmg` |
| Windows | `Monioc-setup.exe` |
| Linux | `monioc.AppImage` |

---

## Run from Source

```bash
git clone https://github.com/your-org/monioc-os.git
cd monioc-os
npm install
npm run dev
```

See [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md) for prerequisites and platform-specific setup.

---

## Local CI

All checks run locally before pushing — no cloud CI costs.

**One-time setup:**

```bash
bash scripts/install-hooks.sh
```

This installs a pre-push git hook that runs lint, type-check, and unit tests automatically before every `git push`.

**Run the full suite manually:**

```bash
npm run ci          # lint, type-check, Rust, tests, landing build, e2e
npm run ci:fast     # lint + type-check + unit tests only (no Rust, no e2e)
```

**Options:**

```bash
npm run ci -- --skip-e2e     # skip Playwright browser tests
npm run ci -- --skip-rust    # skip cargo steps
npm run ci -- --skip-python  # skip Python unittest
```

All checks must pass before opening a pull request.

---

## Testing

```bash
npm run test              # Vitest unit tests
npm run test:e2e          # Playwright end-to-end tests
npm run test:coverage     # unit tests with coverage report

# Rust
cd app/src-tauri && cargo test

# Python (OCR/categorization backend)
cd app/src-tauri && python3 -m unittest discover -s . -p 'test_*.py' -v
```

---

## Building for Production

### Local (current platform only)

```bash
npm run build
```

Output is placed in `app/src-tauri/target/release/bundle/`.

### Cross-platform (all targets)

Cross-platform builds (macOS aarch64, macOS x86_64, Windows, Linux) run on GitHub Actions via the release workflow. To trigger a release build:

1. Tag a commit: `git tag v0.x.y && git push origin v0.x.y`
2. The [release workflow](.github/workflows/release.yml) builds all four platform targets and uploads them to GitHub Releases.

Platform requirements for local builds:

| Target | Build machine required |
|---|---|
| macOS (Apple Silicon) | macOS with Apple Silicon |
| macOS (Intel) | macOS with Intel or Apple Silicon + Rosetta |
| Windows | Windows 10/11 |
| Linux | Linux (Ubuntu 22.04+ recommended) |

See [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md) for per-platform system dependencies.

---

## Data Source

Grocery price comparisons are powered by the **Statistics Canada Monthly Average Retail Prices** dataset — official, open government data released under the [Statistics Canada Open Licence](https://www.statcan.gc.ca/en/reference/licence).

The ETL script lives at [`app/scripts/build-grocery-db.sh`](app/scripts/build-grocery-db.sh) and produces a SQLite database bundled with the app. To rebuild it from a fresh Statistics Canada CSV:

```bash
npm run build:grocery-db:force
```

---

## Contributing

Contributions are welcome. Please read [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) before opening a pull request.

---

## License

[MIT](LICENSE)
