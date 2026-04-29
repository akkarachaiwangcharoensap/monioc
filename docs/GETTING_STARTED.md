# Getting Started

This guide covers everything needed to run Monioc from source on macOS, Windows, and Linux.

---

## Prerequisites

### All platforms

| Tool | Minimum version | Install |
|---|---|---|
| Node.js | 20.x | https://nodejs.org |
| Rust (stable) | latest stable | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |

### macOS

```bash
xcode-select --install
```

### Windows

- [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) — select the "Desktop development with C++" workload
- [WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) — pre-installed on Windows 11; required on Windows 10

### Linux (Ubuntu / Debian)

```bash
sudo apt-get update
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev \
  libappindicator3-dev \
  librsvg2-dev \
  patchelf \
  libssl-dev \
  pkg-config \
  build-essential \
  curl
```

Other distributions: see [Tauri prerequisites](https://tauri.app/start/prerequisites/).

---

## Clone & Install

```bash
git clone https://github.com/your-org/monioc-os.git
cd monioc-os
npm install
```

Dependencies are installed at the repo root via npm workspaces. No separate `cd app && npm install` step is needed.

---

## Run in Development Mode

```bash
npm run dev
```

> **First run:** Rust compiles from scratch — expect 2–5 minutes. Subsequent runs are fast (incremental compilation).

The app window opens automatically. Hot-reload is active for the React frontend; Rust changes require a restart.

---

## Install Git Hooks (one-time)

```bash
bash scripts/install-hooks.sh
```

This wires up a pre-push hook that runs lint, type-check, and unit tests before every push. See [the contributing guide](CONTRIBUTING.md) for details.

---

## Refreshing Grocery Price Data (Optional)

The grocery price database is pre-built and bundled with the app. To regenerate it from a fresh Statistics Canada CSV:

```bash
npm run build:grocery-db:force
```

Download a current `statscan-full.csv` from the [Statistics Canada Monthly Average Retail Prices](https://www150.statcan.gc.ca/n1/en/type/data?subject_levels=62) dataset and place it at `app/data/statscan-full.csv`.

---

## Troubleshooting

| Error | Fix |
|---|---|
| `cargo: command not found` | Install Rust via [rustup](https://rustup.rs) and restart your shell |
| `webkit2gtk not found` | Run the Linux `apt-get` block above |
| `error: linker 'cc' not found` (Linux) | `sudo apt-get install build-essential` |
| WebView2 error on Windows | Download and install the [WebView2 runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) |
| Port already in use | Change `devUrl` in `app/src-tauri/tauri.conf.json` to an unused port |
| `xcode-select: error` (macOS) | Run `xcode-select --install` and accept the license |
| Python: `ModuleNotFoundError` | Run `pip install -r app/src-tauri/requirements.txt` first |
