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

### Python venv (user-managed, like macOS)

The Windows installer **does not bundle Python**. It mirrors the macOS pattern: end users install Python 3.11+ themselves, then run the cross-platform setup script once to populate a virtualenv at `%LOCALAPPDATA%\com.monioc-app\venv`. At runtime [`python::interpreter::resolve`](../app/src-tauri/src/python/interpreter.rs) finds that venv via Tauri's `app_cache_dir`.

End-user setup (one time):

```powershell
# After installing Monioc-setup.exe, from the cloned repo or the Monioc Resources dir:
python scripts\setup-python-deps.py
```

The script:

1. Locates a usable Python 3.11+ (PATH, then the `py` launcher: `py -3.13`, `-3.12`, `-3.11`).
2. Creates a venv at `%LOCALAPPDATA%\com.monioc-app\venv`.
3. Runs `pip install -r app/data/requirements.txt`. Per `sys_platform == "win32"` markers in `requirements.txt`, this resolves to:
   - `paddlepaddle>=3.1.0`
   - `paddleocr>=3.4.0`
   - `onnxruntime>=1.18.0` + `paddle2onnx>=1.2.0` (Windows-only — enables PaddleOCR's High-Performance Inference path)
   - `llama-cpp-python>=0.3.0` (CPU; for CUDA see the comment in `requirements.txt`)
   - `numpy==1.26.4`, `pillow`, `pandas`, `tqdm`
4. Pre-downloads PaddleOCR + LLM weights via `check_models.py --download` so first launch does not stall.

If you want the same exact-version stack the previous bundled installer used, follow PaddleOCR's [v3.x installation guide](https://github.com/PaddlePaddle/PaddleOCR/blob/main/docs/version3.x/installation.en.md) instead — pin `paddlepaddle==3.1.1` from the official Paddle CDN (`https://www.paddlepaddle.org.cn/packages/stable/cpu/`) and run `paddleocr install_hpi_deps cpu` for the HPI plugins. The default `requirements.txt` resolution works for most users; the pinned path is the upstream-supported reference matrix.

LLM model: the GGUF default is **`bartowski/mistralai_Ministral-3-8B-Instruct-2512-GGUF`** (Q4_K_M, ~4.7 GB), the GGUF conversion of the same Ministral-3 8B Instruct checkpoint that the macOS MLX backend uses. Receipt extraction quality is therefore identical across platforms.

Runtime: `scan_receipt.py` and `check_models.py` detect that `onnxruntime` is importable on Windows and pass `enable_hpi=True, hpi_config={"backend": "onnxruntime"}` to `PaddleOCR(...)`. PaddleOCR converts the PP-OCRv5 weights to ONNX once on first instantiation and runs every subsequent inference through ONNX Runtime instead of `paddle_inference`.

Why ONNX Runtime on Windows specifically:

- `paddle_inference`'s CPU operator coverage on Windows is incomplete — PaddlePaddle 3.0/3.1's PIR executor crashes mid-inference with `ConvertPirAttribute2RuntimeAttribute not supported`.
- `onnxruntime` is Microsoft-native: no missing CPU operators, no DLL search-path surprises.
- `onnxruntime` ships its own thread pool, sidestepping the libiomp5md.dll vs libomp140.x86_64.dll OpenMP collision that paddle/numpy/llama-cpp create in the same process.

Three flags are still set at runtime in `scan_receipt.py` / `check_models.py` for the cases where HPI is unavailable and we fall through to `paddle_inference`:

| Flag | Purpose |
|---|---|
| `KMP_DUPLICATE_LIB_OK=TRUE` | Tolerate the duplicate OpenMP runtime that paddle, numpy/MKL, and llama-cpp each load — without it, the process aborts with `OMP: Error #15`. |
| `FLAGS_enable_pir_api=0`, `FLAGS_enable_pir_in_executor=0` | Disable PaddlePaddle 3.x's PIR executor; PIR's CPU operator coverage is incomplete on Windows. |

Both files also set `PYTHONUTF8=1` and `PYTHONIOENCODING=utf-8` so HuggingFace Hub's non-ASCII progress lines render correctly under the default cp1252 console codepage.

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
