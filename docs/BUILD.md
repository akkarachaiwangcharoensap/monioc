# Building Monioc

This document covers how to produce production binaries for all three platforms.

---

## Prerequisites

Complete the setup in [GETTING_STARTED.md](GETTING_STARTED.md) before building.

---

## macOS

```bash
cd app
npm run tauri:build
```

**Output:**

| File | Location |
|---|---|
| `.app` bundle | `app/src-tauri/target/release/bundle/macos/Monioc.app` |
| `.dmg` installer | `app/src-tauri/target/release/bundle/dmg/Monioc_x.x.x_x64.dmg` |

**Apple Silicon:**

```bash
npm run tauri:build -- --target aarch64-apple-darwin
```

**Intel:**

```bash
npm run tauri:build -- --target x86_64-apple-darwin
```

### Code Signing (optional)

Without signing, macOS will show a Gatekeeper warning on first launch. For notarized distribution, set these environment variables before building:

```
APPLE_CERTIFICATE=<base64-encoded .p12>
APPLE_CERTIFICATE_PASSWORD=<p12 password>
APPLE_SIGNING_IDENTITY=<Developer ID Application: Name (TEAMID)>
APPLE_ID=<your Apple ID email>
APPLE_PASSWORD=<app-specific password>
APPLE_TEAM_ID=<10-character Team ID>
```

Then run:

```bash
npm run tauri:build:macos:notarized
```

---

## Windows

```bash
cd app
npm run tauri:build
```

**Output:**

| File | Location |
|---|---|
| `.msi` installer | `app/src-tauri/target/release/bundle/msi/Monioc_x.x.x_x64_en-US.msi` |
| `.exe` NSIS installer | `app/src-tauri/target/release/bundle/nsis/Monioc_x.x.x_x64-setup.exe` |

> Windows binaries must be built on a Windows machine or via the GitHub Actions release workflow. Cross-compiling from macOS/Linux to Windows is not supported.

### Bundled Python runtime

The Windows installer ships a self-contained Python 3.12 + AI dependencies inside the `.exe` so end-users do not need Python installed. The runtime is built by `.github/workflows/release.yml` (Windows job) into `app/src-tauri/python-runtime/` before `tauri build` runs.

Tauri's `interpreter.rs` resolver prefers `<resource_dir>/python-runtime/python.exe` over any system Python on Windows, so the bundled runtime is always used at runtime regardless of what the user has installed.

The bundled stack:

- `paddlepaddle>=3.0.0` — CPU build (PyPI wheel)
- `paddleocr>=3.4.0` — text recognition models download to `~/.paddlex/official_models` on first launch (~100 MB)
- `llama-cpp-python>=0.3.0` — CPU build from the abetlen wheel index (PyPI does not publish prebuilt Windows wheels)
- `numpy==1.26.4`, `pillow`, `huggingface_hub`, `pandas`, `tqdm`

Two flags are critical and set both at install-smoke-test time and at runtime in `scan_receipt.py` / `check_models.py`:

| Flag | Purpose |
|---|---|
| `KMP_DUPLICATE_LIB_OK=TRUE` | Tolerate the duplicate OpenMP runtime that paddle, numpy/MKL, and llama-cpp each load — without it, the process aborts with `OMP: Error #15`. |
| `FLAGS_enable_pir_*=0` | Disable PaddlePaddle 3.0's PIR executor; PIR's CPU operator coverage is incomplete on Windows. |

Both files also set `PYTHONUTF8=1` and `PYTHONIOENCODING=utf-8` because the embeddable Python defaults to cp1252 and HuggingFace Hub's progress lines are non-ASCII.

---

## Linux

```bash
cd app
npm run tauri:build
```

**Output:**

| File | Location |
|---|---|
| `.AppImage` | `app/src-tauri/target/release/bundle/appimage/monioc_x.x.x_amd64.AppImage` |
| `.deb` package | `app/src-tauri/target/release/bundle/deb/monioc_x.x.x_amd64.deb` |

**Running the AppImage:**

```bash
chmod +x monioc_*.AppImage
./monioc_*.AppImage
```

---

## Building All Platforms via GitHub Actions

Push a version tag to trigger the release workflow and build macOS (arm64 + x64), Windows, and Linux simultaneously:

```bash
git tag v1.0.0
git push origin v1.0.0
```

Monitor the build at **GitHub → Actions → Release**. When all jobs complete, go to **GitHub → Releases** to review and publish the draft release containing all binaries.

### macOS Signing in GitHub Actions

Add the following as repository secrets under **Settings → Secrets → Actions**, then uncomment the corresponding `env:` lines in `.github/workflows/release.yml`:

- `APPLE_CERTIFICATE`
- `APPLE_CERTIFICATE_PASSWORD`
- `APPLE_SIGNING_IDENTITY`
- `APPLE_ID`
- `APPLE_PASSWORD`
- `APPLE_TEAM_ID`

---

## Building the Landing Page

```bash
cd landing
npm ci
npm run build
```

Output is written to `landing/out/` as a fully static site ready for GitHub Pages.
