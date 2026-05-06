# build-windows-runtime.ps1
#
# Populates app/src-tauri/python-runtime/ with a self-contained Python 3.12
# embeddable runtime + every AI dependency the Tauri app invokes at runtime
# (paddleocr, paddlepaddle, llama-cpp-python, onnxruntime, ...).  The
# resulting tree is bundled into the Windows NSIS installer via
# `bundle.resources` in tauri.windows.conf.json so end users do not need
# Python on their machine.
#
# Layout produced (~1.2 GB):
#   app/src-tauri/python-runtime/
#     python.exe                           (10 MB embeddable)
#     python312.dll, python312.zip, ...
#     python312._pth                       (with `import site` enabled)
#     Lib/site-packages/                   (paddleocr, paddlepaddle, ...)
#
# Idempotent: re-running rebuilds the directory from scratch.  Designed to be
# called from the release workflow AND runnable locally on a Windows machine
# for debugging the bundle without going through GitHub Actions:
#
#   pwsh app/src-tauri/scripts/build-windows-runtime.ps1
#
# All version pins follow PaddleOCR's v3.x official Windows install guide:
#   https://github.com/PaddlePaddle/PaddleOCR/blob/main/docs/version3.x/installation.en.md

[CmdletBinding()]
param(
    [string]$PythonVersion = "3.12.7",

    # Override to test a development requirements file without committing it.
    # Defaults to the canonical app/data/requirements.txt sitting two levels up.
    [string]$RequirementsFile,

    # Skip pre-compiling .pyc files.  Pre-compile is recommended for production
    # because Python writes __pycache__ alongside the .py source at first
    # import, and "Program Files" is not writable for a standard user — but
    # local debugging runs faster without it.
    [switch]$SkipBytecodeCompile
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

# Resolve paths relative to the script so the script works from any CWD.
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$srcTauriDir = Resolve-Path (Join-Path $scriptRoot "..")
$runtimeDir  = Join-Path $srcTauriDir "python-runtime"

if (-not $RequirementsFile) {
    $RequirementsFile = Resolve-Path (Join-Path $srcTauriDir "..\data\requirements.txt")
}
if (-not (Test-Path $RequirementsFile)) {
    throw "requirements.txt not found at $RequirementsFile"
}

# Embeddable Python lets us ship a frozen interpreter without touching the
# user's machine — no installer, no PATH changes, no registry entries.
$embedUrl = "https://www.python.org/ftp/python/$PythonVersion/python-$PythonVersion-embed-amd64.zip"

# Pin UTF-8 in this build job so paddlepaddle / huggingface_hub progress
# lines render in CI logs (the runner's default codepage is cp1252 and they
# emit non-ASCII characters).
$env:PYTHONUTF8 = "1"
$env:PYTHONIOENCODING = "utf-8"
# Refuse source distributions globally — every dep we install has a prebuilt
# Windows wheel either on PyPI, the Paddle CDN, or the abetlen wheel index,
# and falling back to sdist would need Visual Studio + CMake on the runner.
$env:PIP_PREFER_BINARY = "1"

Write-Host "==> Bundling Python runtime for Windows"
Write-Host "    Python version : $PythonVersion"
Write-Host "    Runtime dir    : $runtimeDir"
Write-Host "    Requirements   : $RequirementsFile"

# ── 1. Download + extract embeddable Python ──────────────────────────────────
if (Test-Path $runtimeDir) {
    Write-Host "Removing existing python-runtime/ for clean build..."
    Remove-Item -Recurse -Force $runtimeDir
}

$zipPath = Join-Path $srcTauriDir "python-embed.zip"
Write-Host "Downloading $embedUrl ..."
Invoke-WebRequest -Uri $embedUrl -OutFile $zipPath -UseBasicParsing
Expand-Archive -Path $zipPath -DestinationPath $runtimeDir -Force
Remove-Item $zipPath

$pythonExe = Join-Path $runtimeDir "python.exe"
if (-not (Test-Path $pythonExe)) {
    throw "Embeddable Python extraction failed: $pythonExe missing"
}

# Embeddable distributions ship with `import site` commented out in the
# pythonXY._pth file — uncomment it so pip and our deps land on sys.path.
$pthFile = Get-ChildItem -Path $runtimeDir -Filter "python*._pth" |
    Select-Object -First 1
if (-not $pthFile) { throw "python*._pth not found in $runtimeDir" }
(Get-Content $pthFile.FullName) `
    -replace '^\s*#\s*import\s+site', 'import site' |
    Set-Content -Path $pthFile.FullName

# ── 2. Bootstrap pip ─────────────────────────────────────────────────────────
$getPipPath = Join-Path $srcTauriDir "get-pip.py"
Write-Host "Bootstrapping pip..."
Invoke-WebRequest -Uri "https://bootstrap.pypa.io/get-pip.py" `
    -OutFile $getPipPath -UseBasicParsing
& $pythonExe $getPipPath --no-warn-script-location
if ($LASTEXITCODE -ne 0) { throw "get-pip.py failed (exit $LASTEXITCODE)" }
Remove-Item $getPipPath

& $pythonExe -m pip install --upgrade pip
if ($LASTEXITCODE -ne 0) { throw "pip self-upgrade failed (exit $LASTEXITCODE)" }

# ── 3. paddlepaddle from official Paddle CDN ─────────────────────────────────
# PaddleOCR's v3.x guide is explicit: paddlepaddle on Windows must come from
# https://www.paddlepaddle.org.cn/packages/stable/cpu/, not PyPI.  The same
# version number on PyPI is a different build that omits parts of the
# paddle_inference runtime.  Pinned to 3.1.1 because the CDN serves a single
# tested build per minor and the HPI plugins below are qualified against it.
Write-Host "==> Installing paddlepaddle==3.1.1 from Paddle CDN..."
& $pythonExe -m pip install `
    -i https://www.paddlepaddle.org.cn/packages/stable/cpu/ `
    "paddlepaddle==3.1.1"
if ($LASTEXITCODE -ne 0) { throw "paddlepaddle install failed (exit $LASTEXITCODE)" }

# ── 4. paddleocr ─────────────────────────────────────────────────────────────
# No version pin per the v3.x guide — latest paddleocr always supports the
# matching paddlepaddle minor.
Write-Host "==> Installing paddleocr..."
& $pythonExe -m pip install paddleocr
if ($LASTEXITCODE -ne 0) { throw "paddleocr install failed (exit $LASTEXITCODE)" }

# ── 5. PaddleOCR HPI plugins via the official subcommand ─────────────────────
# Pulls in onnxruntime + paddle2onnx + binding glue at the exact versions
# paddleocr is qualified against.  Doing this via the subcommand instead of
# `pip install onnxruntime paddle2onnx` keeps us inside upstream's tested
# matrix and survives upstream re-pinning their HPI deps.
Write-Host "==> Installing PaddleOCR HPI deps (CPU / onnxruntime)..."
& $pythonExe -m paddleocr install_hpi_deps cpu
if ($LASTEXITCODE -ne 0) { throw "paddleocr install_hpi_deps cpu failed (exit $LASTEXITCODE)" }

# ── 6. llama-cpp-python from prebuilt CPU wheel index ────────────────────────
# llama-cpp-python publishes no Windows wheels on PyPI; pip would fall back
# to a from-source build that needs scikit-build-core + Visual Studio + CMake.
# The project hosts CPU wheels on their own GitHub Pages index — pull from
# there and refuse sdist for this package specifically.
Write-Host "==> Installing llama-cpp-python (prebuilt CPU wheel)..."
& $pythonExe -m pip install `
    --only-binary llama-cpp-python `
    --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cpu `
    "llama-cpp-python>=0.3.0"
if ($LASTEXITCODE -ne 0) { throw "llama-cpp-python install failed (exit $LASTEXITCODE)" }

# ── 7. Remaining pure-Python deps from requirements.txt ──────────────────────
# Steps 3-6 already installed the heavy deps at the exact versions upstream
# qualifies; this pass (no --upgrade) only fills in numpy/pillow/pandas/tqdm/
# huggingface_hub.  Index URLs repeated defensively in case requirements.txt
# transitively pulls a paddlepaddle resolution.
Write-Host "==> Filling in remaining dependencies (numpy/pillow/pandas/tqdm/...)..."
& $pythonExe -m pip install `
    --only-binary llama-cpp-python `
    --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cpu `
    --extra-index-url https://www.paddlepaddle.org.cn/packages/stable/cpu/ `
    -r $RequirementsFile
if ($LASTEXITCODE -ne 0) { throw "requirements.txt install failed (exit $LASTEXITCODE)" }

# ── 8. Smoke test ────────────────────────────────────────────────────────────
# Fail the build now if any wheel is broken instead of shipping an installer
# that crashes on the user's machine.  KMP_DUPLICATE_LIB_OK +
# FLAGS_enable_pir_* mirror the runtime guards at the top of scan_receipt.py
# / check_models.py — without them OMP: Error #15 or PIR errors abort here.
Write-Host "==> Smoke-testing AI runtime imports..."
$env:KMP_DUPLICATE_LIB_OK = "TRUE"
$env:FLAGS_enable_pir_api = "0"
$env:FLAGS_enable_pir_in_executor = "0"

# Single-line `python -c` — a here-string would collide with PowerShell's
# parameter-passing rules.  Asserts that onnxruntime exposes the CPU EP
# because PaddleOCR's HPI refuses to start otherwise.
$smoke = "import paddle, paddleocr, llama_cpp, huggingface_hub, PIL, numpy, onnxruntime, paddle2onnx; " +
         "print('paddle', paddle.__version__); " +
         "print('paddleocr', paddleocr.__version__); " +
         "print('onnxruntime', onnxruntime.__version__); " +
         "print('paddle2onnx', paddle2onnx.__version__); " +
         "print('numpy', numpy.__version__); " +
         "providers = onnxruntime.get_available_providers(); " +
         "assert 'CPUExecutionProvider' in providers, providers; " +
         "print('onnxruntime EPs', providers)"
& $pythonExe -c $smoke
if ($LASTEXITCODE -ne 0) { throw "AI runtime smoke import failed (exit $LASTEXITCODE)" }

# ── 9. Pre-compile bytecode ──────────────────────────────────────────────────
# Without this, Python tries to write __pycache__ next to .py at runtime;
# under "Program Files" that fails silently on every import and slows the
# first launch noticeably.  -q keeps logs tidy; -f forces rebuild.
if (-not $SkipBytecodeCompile) {
    Write-Host "==> Pre-compiling Python bytecode..."
    & $pythonExe -m compileall -q -f (Join-Path $runtimeDir "Lib")
}

# ── 10. Report bundle size ───────────────────────────────────────────────────
$totalBytes = (Get-ChildItem -Recurse $runtimeDir |
    Measure-Object -Property Length -Sum).Sum
"==> Bundle complete: {0:N0} MB" -f ($totalBytes / 1MB) | Write-Host
