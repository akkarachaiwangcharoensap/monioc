# Bootstraps an isolated Python 3.12 runtime + AI dependencies for Monioc.
#
# Strategy:
#   1. Download python-3.12-embed-amd64.zip (~10 MB) from python.org
#   2. Extract to <InstallDir>\python and enable site-packages in python312._pth
#   3. Bootstrap pip via get-pip.py
#   4. pip install -r <Requirements>
#
# Idempotent: re-running with an already-installed environment is a no-op.
# A marker file (.monioc-deps-installed) records that the dependency install
# completed — if it exists, we skip the slow pip install step entirely.

param(
    [Parameter(Mandatory=$true)] [string]$InstallDir,
    [Parameter(Mandatory=$true)] [string]$Requirements
)

$ErrorActionPreference = "Stop"
# Disable Invoke-WebRequest's cursor-overwriting progress bar — its writes to
# the alternate screen buffer corrupt our line-based capture in Rust.
$ProgressPreference = "SilentlyContinue"

$PythonVersion = "3.12.7"
$EmbedUrl  = "https://www.python.org/ftp/python/$PythonVersion/python-$PythonVersion-embed-amd64.zip"
$GetPipUrl = "https://bootstrap.pypa.io/get-pip.py"

$PythonDir  = Join-Path $InstallDir "python"
$PythonExe  = Join-Path $PythonDir "python.exe"
$MarkerFile = Join-Path $PythonDir ".monioc-deps-installed"

function Log($msg) {
    Write-Host "[setup-python] $msg"
}

if (-not (Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
}

# ── Phase 1: Python runtime ───────────────────────────────────────────────────
if (-not (Test-Path $PythonExe)) {
    Log "Downloading Python $PythonVersion runtime (~10 MB) ..."
    $embedZip = Join-Path $env:TEMP "monioc-python-embed.zip"
    Invoke-WebRequest -Uri $EmbedUrl -OutFile $embedZip -UseBasicParsing

    Log "Extracting Python runtime ..."
    if (Test-Path $PythonDir) { Remove-Item -Recurse -Force $PythonDir }
    Expand-Archive -Path $embedZip -DestinationPath $PythonDir -Force
    Remove-Item $embedZip -Force

    # Embeddable Python ships with `import site` commented out in python312._pth.
    # That disables site-packages, which prevents pip from installing anywhere
    # discoverable.  Uncomment the line so pip and our deps end up on sys.path.
    $pthFile = Get-ChildItem -Path $PythonDir -Filter "python*._pth" |
        Select-Object -First 1
    if ($pthFile) {
        $content = Get-Content $pthFile.FullName
        $content = $content -replace '^\s*#\s*import\s+site', 'import site'
        Set-Content -Path $pthFile.FullName -Value $content
    }

    Log "Installing pip (~2 MB) ..."
    $getPip = Join-Path $env:TEMP "monioc-get-pip.py"
    Invoke-WebRequest -Uri $GetPipUrl -OutFile $getPip -UseBasicParsing
    & $PythonExe $getPip --no-warn-script-location 2>&1 |
        ForEach-Object { Write-Host "[pip] $_" }
    if ($LASTEXITCODE -ne 0) { throw "Failed to install pip (exit $LASTEXITCODE)" }
    Remove-Item $getPip -Force
} else {
    Log "Python runtime already installed."
}

# ── Phase 2: AI dependencies ──────────────────────────────────────────────────
if (Test-Path $MarkerFile) {
    Log "AI dependencies already installed."
} else {
    Log "Installing AI dependencies (~500 MB, takes 3-5 minutes) ..."
    Log "  Packages: paddleocr, paddlepaddle, llama-cpp-python, huggingface_hub ..."
    & $PythonExe -m pip install --upgrade pip 2>&1 |
        ForEach-Object { Write-Host "[pip] $_" }
    & $PythonExe -m pip install -r $Requirements 2>&1 |
        ForEach-Object { Write-Host "[pip] $_" }
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to install AI dependencies (exit $LASTEXITCODE)"
    }
    Set-Content -Path $MarkerFile -Value "ok"
}

Log "Python environment ready."
Log "Interpreter: $PythonExe"
