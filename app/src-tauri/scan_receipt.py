#!/usr/bin/env python3
"""
scan_receipt.py  —  Receipt extraction using PaddleOCR (text) + LLM (structured parsing).

Pipeline:
    1. Prepare image  — resize/orient for lean OCR
    2. PaddleOCR      — fast, low-RAM text extraction
    3. LLM inference  — semantic name/price extraction, backend chosen by platform:
                        macOS Apple Silicon → mlx-lm → ollama
                        Windows / Linux     → llama-cpp-python → ollama
                        macOS Intel         → ollama
    4. Regex fallback — used when all LLM backends are unavailable

Usage:
    python3 scan_receipt.py <image_path> [<processed_image_path>]

Output (stdout):
    JSON {"rows": [{"name": str, "price": float}, ...], "total": float | null}

Diagnostics are written to stderr so the Tauri shell command can capture them
without polluting the JSON stdout.

Environment variables:
    RECEIPT_OCR_MAX_LONG_SIDE   Max long-side pixels before downscale (default 1280)
    RECEIPT_OCR_MAX_PIXELS      Max total pixels before downscale (default 1_000_000)
    RECEIPT_OCR_THREADS         CPU thread cap for PaddleOCR (default 2)
LLM backend selection (automatic based on platform, overridable):

    macOS Apple Silicon  →  mlx-lm (in-process, unified GPU/CPU memory, ~4.5 GB)
                             Falls back to ollama if mlx-lm is not installed.
    macOS Intel          →  ollama (MLX requires Apple Silicon Metal)
    Windows / Linux      →  llama-cpp-python (CUDA if available, otherwise CPU)
                             Falls back to ollama if llama-cpp-python is not installed.

Environment variables:
    RECEIPT_OCR_MAX_LONG_SIDE    Max long-side pixels before downscale (default 1280)
    RECEIPT_OCR_MAX_PIXELS       Max total pixels before downscale (default 1_000_000)
    RECEIPT_OCR_THREADS          CPU thread cap for PaddleOCR (default 2)
    RECEIPT_LLM_MLX_MODEL        MLX model ID — macOS Apple Silicon
                                   (default mlx-community/Meta-Llama-3.1-8B-Instruct-4bit)
    RECEIPT_LLM_GGUF_MODEL       GGUF model repo — Windows/Linux
                                   (default bartowski/Meta-Llama-3.1-8B-Instruct-GGUF)
    RECEIPT_LLM_GGUF_FILENAME    GGUF filename pattern within the repo
                                   (default *Q4_K_M.gguf)
    RECEIPT_LLM_MODEL            Ollama fallback model name (default llama3.1:latest)
    RECEIPT_LLM_HOST             Ollama host:port (default localhost:11434)
    RECEIPT_LLM_TIMEOUT          HTTP timeout seconds for ollama call (default 120)
    RECEIPT_LLM_DISABLE          Set to "1" to skip LLM and use regex only
"""
from __future__ import annotations

import http.client
import json
import os
import platform
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path
from typing import Any, Dict

# ─── Platform detection ───────────────────────────────────────────────────────


def _is_apple_silicon() -> bool:
    """True only on macOS running on ARM (M-series chip)."""
    return sys.platform == "darwin" and platform.machine() == "arm64"


def _is_macos_intel() -> bool:
    return sys.platform == "darwin" and platform.machine() != "arm64"


def _is_windows() -> bool:
    return sys.platform == "win32"


def _is_linux() -> bool:
    return sys.platform.startswith("linux")


def _int_env(name: str, default: int) -> int:
    """Retrieve an environment variable as a positive integer.

    Parameters:
        name: Environment variable name to retrieve.
        default: Value to return if variable is not set, not parseable, or non-positive.

    Returns:
        int: The environment variable value as int, or default if invalid.
    """
    raw = os.environ.get(name)
    if raw is None:
        return default
    try:
        value = int(raw)
        return value if value > 0 else default
    except ValueError:
        return default


# ─── Module-level defaults (overridable via environment variables) ────────────

_PROGRESS_PREFIX: str = "[scan_receipt]"
"""Prefix written by ``_progress()`` to every diagnostic line on stderr."""

_DEFAULT_MAX_LONG_SIDE: int = 1920
"""Maximum pixel count on the long side before downscaling the OCR input image."""

_DEFAULT_MAX_PIXELS: int = 2_000_000
"""Maximum total pixel count before downscaling the OCR input image."""

_DEFAULT_OCR_THREADS: int = 2
"""CPU thread cap passed to PaddleOCR via ``OMP_NUM_THREADS`` / ``MKL_NUM_THREADS``."""

_DEFAULT_LLM_TIMEOUT: int = 120
"""HTTP timeout in seconds for ollama API calls."""

_DEFAULT_OLLAMA_HOST: str = "localhost:11434"
"""Default ollama server ``host:port``."""

_DEFAULT_OLLAMA_MODEL: str = "ministral-3:8b"
"""Default ollama model name."""

_DEFAULT_MLX_MODEL: str = "mlx-community/Ministral-3-8B-Instruct-2512-4bit"
"""Default MLX model identifier (Apple Silicon only)."""

_DEFAULT_GGUF_MODEL: str = "bartowski/Meta-Llama-3.1-8B-Instruct-GGUF"
"""Default GGUF model repository on HuggingFace (Windows/Linux)."""

_DEFAULT_GGUF_FILENAME: str = "*Q4_K_M.gguf"
"""Default GGUF filename glob pattern within the repository."""

# ─── Progress reporting ───────────────────────────────────────────────────────


def _progress(message: str, *, prefix: str = _PROGRESS_PREFIX) -> None:
    """Print a progress message to stderr for external consumption.

    Outputs to stderr so Tauri shell can capture diagnostic messages
    without polluting JSON stdout output.

    Parameters:
        message: The diagnostic message to print.
        prefix: Optional prefix label (default: "[scan_receipt]").
    """
    print(f"{prefix} {message}", file=sys.stderr, flush=True)


class _Spinner:
    """
    Context manager that prints elapsed-time updates on a background thread
    while a long blocking operation runs.

    Outputs a plain new line every `interval` seconds so Tauri can show live
    feedback without relying on ANSI control sequences.

    Usage::

        with _Spinner("Loading PaddleOCR"):
            ocr = PaddleOCR(...)
    """

    def __init__(self, label: str, interval: float = 3.0) -> None:
        """Initialize the spinner context manager.

        Parameters:
            label: Description of the operation being monitored.
            interval: Time between progress reports in seconds (default: 3.0).
        """
        self._label = label
        self._interval = interval
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def _run(self) -> None:
        """Execute the spinner background worker thread."""
        start = time.monotonic()
        while not self._stop.wait(self._interval):
            elapsed = int(time.monotonic() - start)
            _progress(f"  {self._label} … {elapsed}s elapsed")

    def __enter__(self) -> _Spinner:
        """Start the spinner thread on context entry."""
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()
        return self

    def __exit__(self, *_: object) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=2.0)


def _hf_model_is_cached(repo_id: str) -> bool:
    """Check if a HuggingFace model is cached locally.

    Parameters:
        repo_id: HuggingFace repository ID to check (e.g., 'username/model-name').

    Returns:
        bool: True if the model is already in the local cache, False otherwise.
    """
    try:
        from huggingface_hub import scan_cache_dir  # type: ignore

        return any(r.repo_id == repo_id for r in scan_cache_dir().repos)
    except Exception:
        return False


class _ProgressTqdm:
    """Drop-in tqdm replacement for piped environments.

    Emits clean line-based progress updates instead of carriage-return-overwritten
    bars, so model file downloads reach the Tauri frontend as stdout/stderr lines
    rather than ANSI escape sequences which break when piped.

    Used as tqdm_class for huggingface_hub.snapshot_download().
    Supports both byte-level (unit="B", unit_scale=True) and count-level
    (unit="file", etc.) progress tracking. Reports at 5% boundaries and 100%.
    """

    def __init__(
        self,
        iterable: object = None,
        *,
        desc: str = "",
        total: int | float | None = None,
        unit: str = "it",
        unit_scale: bool = False,
        unit_divisor: int = 1000,
        **_kw: object,
    ) -> None:
        """Initialize the progress tracker.

        Parameters:
            iterable: Sequence to iterate over (optional).
            desc: Progress description label.
            total: Total count/size for progress calculation.
            unit: Unit name (default: "it" for iteration).
            unit_scale: If True, scale bytes to MB (default: False).
            unit_divisor: Divisor for unit scaling (default: 1000).
        """
        self._iter = iterable
        self._desc = desc or ""
        self._total = total
        self._unit = unit
        self._unit_scale = unit_scale
        self._unit_divisor = unit_divisor
        self.n: float = 0
        self._last_pct: int = -1

    # ── Iterator protocol ──────────────────────────────────────────────────

    def __iter__(self) -> object:
        """Support iteration protocol."""
        for item in self._iter or []:  # type: ignore[attr-defined]
            yield item

    def __len__(self) -> int:
        return int(self._total or 0)

    # ── tqdm update interface ──────────────────────────────────────────────

    def update(self, n: int | float = 1) -> None:
        """Update progress and emit periodic status messages.

        Parameters:
            n: Increment amount (default: 1).
        """
        self.n += n
        if not self._total or self._total <= 0:
            return
        pct = int(self.n * 100 / self._total)
        if pct == self._last_pct:
            return
        if pct % 5 != 0 and pct != 100:
            return
        self._last_pct = pct
        if self._unit_scale:
            # Convert bytes to MB using the same divisor as tqdm (1000 by default)
            divisor_sq = self._unit_divisor**2
            done = self.n / divisor_sq
            total = self._total / divisor_sq
            _progress(f"  {self._desc}: {done:.0f}/{total:.0f} MB ({pct}%)")
        else:
            _progress(
                f"  {self._desc}: {int(self.n)}/{int(self._total)} {self._unit} ({pct}%)"
            )

    # ── tqdm compatibility stubs ───────────────────────────────────────────

    def set_postfix(self, *_: object, **__: object) -> None:
        """tqdm compatibility stub."""
        pass

    def set_description(self, desc: str | None = None, **_: object) -> None:
        """Set or update the progress description label.

        Parameters:
            desc: New description text (ignored if None).
        """
        if desc:
            self._desc = desc

    def set_description_str(self, desc: str | None = None, **_: object) -> None:
        """Set or update the progress description (alternate API).

        Parameters:
            desc: New description text (ignored if None).
        """
        if desc:
            self._desc = desc

    def reset(self, total: int | None = None) -> None:
        """Reset progress counter.

        Parameters:
            total: Optional new total value.
        """
        self.n = 0
        self._last_pct = -1
        if total is not None:
            self._total = total

    def close(self) -> None:
        """tqdm compatibility stub."""
        pass

    def display(self, *_: object, **__: object) -> None:
        """tqdm compatibility stub."""
        pass

    def clear(self, *_: object, **__: object) -> None:
        """tqdm compatibility stub."""
        pass

    def refresh(self, *_: object, **__: object) -> None:
        """tqdm compatibility stub."""
        pass

    def __enter__(self) -> _ProgressTqdm:
        """Context manager entry."""
        return self

    def __exit__(self, *_: object) -> None:
        """Context manager exit."""
        pass

    @classmethod
    def get_lock(cls) -> threading.Lock:
        """Return a reentrant lock for tqdm compatibility.

        ``huggingface_hub.snapshot_download`` calls ``tqdm_class.get_lock()``
        before writing; without this classmethod the download crashes with
        ``AttributeError``.
        """
        if not hasattr(cls, "_lock"):
            cls._lock = threading.RLock()
        return cls._lock

    @classmethod
    def set_lock(cls, lock: threading.Lock) -> None:
        """Set the class-level lock (tqdm compatibility)."""
        cls._lock = lock

    @classmethod
    def write(cls, s: str, *_: object, **__: object) -> None:
        """Emit a message via progress reporting.

        Parameters:
            s: Message text to emit.
        """
        _progress(s)


def _download_hf_model_with_progress(repo_id: str) -> None:
    """
    Pre-download a HuggingFace model to the local cache using line-based progress.

    Calls ``snapshot_download`` with ``_ProgressTqdm`` as the tqdm class so that
    per-file download progress reaches the frontend as clean ``_progress()`` lines.
    HF Hub's own tqdm (which uses ``\\r`` carriage-return overwriting) is suppressed
    to avoid garbled output when stderr is piped through Tauri.

    After this call the model is fully cached; the subsequent ``load()`` / ``from_pretrained``
    call will read from disk without re-downloading.
    """
    try:
        from huggingface_hub import snapshot_download  # type: ignore
    except ImportError:
        _progress("  huggingface_hub not available; skipping pre-download.")
        return

    # Suppress HF Hub's native tqdm bars (carriage-return noise); we provide progress.
    os.environ["HF_HUB_DISABLE_PROGRESS_BARS"] = "1"
    _progress(f"  Downloading model files …")
    try:
        snapshot_download(repo_id=repo_id, tqdm_class=_ProgressTqdm)  # type: ignore[arg-type]
        _progress(f"  Download complete — model cached locally.")
    except TypeError:
        # Older huggingface_hub may not accept tqdm_class; fall back silently.
        try:
            snapshot_download(repo_id=repo_id)
            _progress(f"  Download complete — model cached locally.")
        except Exception as exc:
            _progress(f"  Download warning: {exc}")
    except Exception as exc:
        _progress(f"  Download warning: {exc}")


# ─── Ollama: auto-install + model pull ───────────────────────────────────────

_OLLAMA_INSTALL_URLS = {
    "darwin": "https://ollama.com/download/ollama-darwin",
    "linux": "https://ollama.com/install.sh",
    "win32": "https://ollama.com/download/OllamaSetup.exe",
}

_OLLAMA_BIN_CANDIDATES = [
    # Common install locations in order of preference
    "/usr/local/bin/ollama",
    "/usr/bin/ollama",
    str(Path.home() / ".ollama" / "bin" / "ollama"),
    str(Path.home() / "bin" / "ollama"),
    str(Path.home() / ".local" / "bin" / "ollama"),
]


def _find_ollama_binary() -> str | None:
    """Locate the ollama binary in standard locations.

    Searches PATH first, then checks common installation directories.

    Returns:
        str: Path to ollama binary if found, None otherwise.
    """
    found = shutil.which("ollama")
    if found:
        return found
    for candidate in _OLLAMA_BIN_CANDIDATES:
        if os.path.isfile(candidate) and os.access(candidate, os.X_OK):
            return candidate
    return None


def _install_ollama_macos() -> str | None:
    """Download and install ollama binary for macOS.

    Downloads the macOS binary directly to ~/.local/bin/ollama.

    Returns:
        str: Path to installed ollama binary on success, None on failure.
    """
    import urllib.request

    dest_dir = Path.home() / ".local" / "bin"
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / "ollama"

    url = _OLLAMA_INSTALL_URLS["darwin"]
    _progress("Downloading AI assistant (one-time setup) …")

    try:
        downloaded = [0]

        def _report(block_count: int, block_size: int, total_size: int) -> None:
            downloaded[0] = block_count * block_size
            if total_size > 0:
                pct = min(100, int(downloaded[0] * 100 / total_size))
                mb = downloaded[0] / 1_048_576
                total_mb = total_size / 1_048_576
                _progress(f"  Downloading … {mb:.1f}/{total_mb:.1f} MB ({pct}%)")
            else:
                mb = downloaded[0] / 1_048_576
                _progress(f"  Downloading … {mb:.1f} MB")

        urllib.request.urlretrieve(url, str(dest), reporthook=_report)
        dest.chmod(0o755)
        _progress("AI assistant installed.")
        return str(dest)
    except Exception as exc:
        _progress("Could not download AI assistant.")
        return None


def _install_ollama_linux() -> str | None:
    """Download and run the official ollama Linux install script.

    Requires curl to be available. Runs with sudo if necessary.

    Returns:
        str: Path to installed ollama binary on success, None on failure.
    """
    import urllib.request

    url = _OLLAMA_INSTALL_URLS["linux"]
    _progress("Setting up AI assistant …")

    try:
        with urllib.request.urlopen(
            url
        ) as resp:  # noqa: S310 — controlled URL constant
            script = resp.read().decode("utf-8")
    except Exception as exc:
        _progress("Could not set up AI assistant.")
        return None

    try:
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".sh", delete=False, prefix="ollama-install-"
        ) as tf:
            tf.write(script)
            script_path = tf.name
        os.chmod(script_path, 0o755)
        _progress("Installing AI assistant …")
        result = subprocess.run(  # noqa: S603
            ["/bin/sh", script_path],
            capture_output=False,
            text=True,
            timeout=300,
        )
        os.remove(script_path)
        if result.returncode != 0:
            _progress("AI assistant installation encountered an issue.")
            return None
        _progress("AI assistant installed.")
        return _find_ollama_binary()
    except Exception as exc:
        _progress("AI assistant installation failed.")
        return None


def _ensure_ollama_installed() -> str | None:
    """Locate or install the ollama binary.

    On macOS and Linux, automatically downloads the binary or install script
    when ollama is not on PATH. On Windows, prints guidance only.

    Returns:
        str: Path to ollama binary if available or installed, None if unavailable.
    """
    existing = _find_ollama_binary()
    if existing:
        return existing

    _progress("Setting up AI assistant …")

    if sys.platform == "darwin":
        return _install_ollama_macos()
    if sys.platform.startswith("linux"):
        return _install_ollama_linux()

    # Windows: provide guidance, do not attempt silent install.
    _progress(
        "ollama not installed. Download from https://ollama.com/download and run the installer."
    )
    return None


def _start_ollama_server(binary: str) -> bool:
    """Ensure the ollama HTTP server is running.

    Pings the server first; if unreachable, launches `ollama serve` as a
    background process and waits up to 10s for it to become responsive.

    Parameters:
        binary: Path to the ollama executable.

    Returns:
        bool: True when the server is confirmed ready, False on failure.
    """
    host = os.environ.get("RECEIPT_LLM_HOST", _DEFAULT_OLLAMA_HOST)

    def _reachable() -> bool:
        try:
            conn = http.client.HTTPConnection(host, timeout=2)
            conn.request("GET", "/api/tags")
            resp = conn.getresponse()
            resp.read()
            conn.close()
            return resp.status < 500
        except Exception:
            return False

    if _reachable():
        return True

    _progress("Starting AI service …")
    try:
        subprocess.Popen(  # noqa: S603
            [binary, "serve"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
    except Exception as exc:
        _progress("Could not start AI service.")
        return False

    # Poll for readiness (up to 10 s)
    for attempt in range(20):
        time.sleep(0.5)
        if _reachable():
            _progress("AI service ready.")
            return True
        if attempt % 4 == 3:
            _progress(f"Waiting for AI service … ({(attempt + 1) // 2}s)")
    _progress("AI service did not respond in time.")
    return False


def _pull_ollama_model(model: str) -> bool:
    """Pull a model via the ollama /api/pull endpoint.

    Streams newline-delimited JSON status events so the user sees live
    byte-level progress rather than silent waiting.

    Parameters:
        model: Ollama model name to pull (e.g., 'llama3.1:latest').

    Returns:
        bool: True when the model is ready, False on failure.
    """
    host = os.environ.get("RECEIPT_LLM_HOST", _DEFAULT_OLLAMA_HOST)
    payload = json.dumps({"model": model, "stream": True}).encode("utf-8")
    _progress("Downloading AI model (first time only) …")

    last_pct: int = -1

    try:
        conn = http.client.HTTPConnection(host, timeout=600)
        conn.request(
            "POST",
            "/api/pull",
            body=payload,
            headers={"Content-Type": "application/json"},
        )
        resp = conn.getresponse()
        if resp.status != 200:
            _progress("AI model download returned an error.")
            return False

        # Read the streaming newline-delimited JSON
        buf = b""
        while True:
            chunk = resp.read(4096)
            if not chunk:
                break
            buf += chunk
            while b"\n" in buf:
                line, buf = buf.split(b"\n", 1)
                line = line.strip()
                if not line:
                    continue
                try:
                    event = json.loads(line.decode("utf-8"))
                except json.JSONDecodeError:
                    continue

                status = event.get("status", "")
                total = event.get("total", 0)
                completed = event.get("completed", 0)

                if total and total > 0:
                    pct = int(completed * 100 / total)
                    total_gb = total / 1_073_741_824
                    done_gb = completed / 1_073_741_824
                    if pct != last_pct:
                        _progress(
                            f"  Downloading … {done_gb:.2f}/{total_gb:.2f} GB ({pct}%)"
                        )
                        last_pct = pct
                elif status and status != "pulling manifest":
                    _progress(f"  {status}")

        conn.close()
        _progress("AI model ready.")
        return True

    except Exception as exc:
        _progress("Could not download AI model.")
        return False


def _ensure_ollama_model(model: str) -> bool:
    """Check if a model is cached; pull it if not.

    Parameters:
        model: Ollama model name to check or pull.

    Returns:
        bool: True when the model is available locally, False on failure.
    """
    host = os.environ.get("RECEIPT_LLM_HOST", _DEFAULT_OLLAMA_HOST)
    try:
        conn = http.client.HTTPConnection(host, timeout=10)
        payload = json.dumps({"model": model}).encode("utf-8")
        conn.request(
            "POST",
            "/api/show",
            body=payload,
            headers={"Content-Type": "application/json"},
        )
        resp = conn.getresponse()
        resp.read()
        conn.close()
        if resp.status == 200:
            _progress("AI model already available.")
            return True
    except Exception:
        pass

    return _pull_ollama_model(model)


# ─── Price helpers ───────────────────────────────────────────────────────────

# Matches dollar amounts like 1.99, $2,499.99, 0.05
_PRICE_RE = re.compile(r"\$?\s*(\d{1,6}(?:[,]\d{3})*[.]\d{2})\b")

# Lines that are clearly not items (separators, barcodes, timestamps)
_SKIP_LINE_RE = re.compile(
    r"^\s*(?:"
    r"-{3,}"  # --- dividers
    r"|={3,}"  # === dividers
    r"|\*{3,}"  # *** dividers
    r"|#{3,}"  # ### headings only (>3 hashes)
    r"|\d{4}[-/]\d{2}[-/]\d{2}"  # date  2025-01-01
    r"|\d{1,2}:\d{2}(?::\d{2})?"  # time  14:30
    r"|[A-Z0-9]{8,}"  # barcode / ref  (8+ uppercase+digits, no spaces)
    r")\s*$",
    re.IGNORECASE,
)


def _to_price(s: str | None) -> float | None:
    """Parse a price string to float.

    Handles formats like '2.99', '$2.99', '2,499.99', and parenthetical
    negatives like '(1.99)' → -1.99. Returns None for invalid inputs
    or values >= 1,000,000.

    Parameters:
        s: Price string to parse, or None.

    Returns:
        float: Parsed price, or None if invalid or out of range.
    """
    if s is None:
        return None
    clean = re.sub(r"[\s$,]", "", str(s).strip())
    if clean.startswith("(") and clean.endswith(")"):
        clean = "-" + clean[1:-1]
    try:
        v = float(clean)
        return v if abs(v) < 1_000_000 else None
    except ValueError:
        return None


def _price_from_line(line: str) -> float | None:
    """Extract the last price amount from a text line.

    Useful for receipt lines where the price is typically at the end.

    Parameters:
        line: Text line to search for price.

    Returns:
        float: Parsed price from the last match, or None if not found.
    """
    matches = _PRICE_RE.findall(line)
    if not matches:
        return None
    return _to_price(matches[-1])


def _name_from_line(line: str) -> str:
    """Extract product name by removing trailing price and markdown artifacts.

    Removes trailing dollar amounts while preserving product name details.
    Also cleans up markdown table pipes and extra whitespace.

    Parameters:
        line: Receipt line text to process.

    Returns:
        str: Cleaned product name.
    """
    # Remove a single trailing amount first to avoid deleting useful numeric text.
    name = re.sub(r"\$?\s*\d{1,6}(?:[,]\d{3})*[.]\d{2}\s*$", "", line)
    if name == line:
        name = _PRICE_RE.sub("", line)
    name = re.sub(r"[|]", " ", name)  # markdown table pipes
    name = re.sub(r"\s{2,}", " ", name)
    return name.strip(" .\t-")


def _extract_total(lines: list[str]) -> float | None:
    """Extract the receipt total from OCR text lines.

    Searches from the end (where totals appear) for lines containing
    total keywords and extracts the price amount.

    Parameters:
        lines: Receipt text lines to search.

    Returns:
        float: The total amount if found, None otherwise.
    """
    total_re = re.compile(
        r"\b(?:TOTAL|TTTL|AMOUNT\s*DUE|GRAND\s*TOTAL|BALANCE\s*DUE)\b",
        re.IGNORECASE,
    )
    for line in reversed(lines):
        if total_re.search(line):
            p = _price_from_line(line)
            if p and p > 0:
                return p
    return None


def _prepare_image_for_ocr(image_path: str) -> str:
    """Create a memory-friendly JPEG for OCR processing.

    Large camera images cause RAM spikes during parsing. This pre-processes
    the image: normalizes orientation, caps size, and converts to JPEG
    before sending to PaddleOCR.

    Parameters:
        image_path: Path to the input image file.

    Returns:
        str: Path to the prepared JPEG image (typically in temp directory).
    """
    from PIL import Image, ImageOps  # type: ignore

    # Defaults balance OCR accuracy vs. RAM. A 3024×4032 shot scales to ~820×1093
    # with these values — enough detail for receipt text while staying bounded.
    max_long_side = _int_env("RECEIPT_OCR_MAX_LONG_SIDE", _DEFAULT_MAX_LONG_SIDE)
    max_pixels = _int_env("RECEIPT_OCR_MAX_PIXELS", _DEFAULT_MAX_PIXELS)

    src = ImageOps.exif_transpose(Image.open(image_path)).convert("RGB")
    width, height = src.size
    long_side = max(width, height)
    pixel_count = width * height

    scale_by_side = min(1.0, max_long_side / float(long_side)) if long_side > 0 else 1.0
    scale_by_pixels = (
        min(1.0, (max_pixels / float(pixel_count)) ** 0.5) if pixel_count > 0 else 1.0
    )
    scale = min(scale_by_side, scale_by_pixels)

    if scale < 1.0:
        new_w = max(1, int(width * scale))
        new_h = max(1, int(height * scale))
        src = src.resize((new_w, new_h), Image.Resampling.LANCZOS)
    else:
        new_w, new_h = width, height

    tmp = tempfile.NamedTemporaryFile(
        prefix="receipt-ocr-", suffix=".jpg", delete=False
    )
    tmp_path = tmp.name
    tmp.close()

    src.save(tmp_path, "JPEG", quality=75, optimize=True)

    _progress("Image prepared for scanning.")

    return tmp_path


# ─── PaddleOCR / PaddleOCR-VL helpers ───────────────────────────────────────


def _clean_line(text: str) -> str:
    """Clean OCR text by normalizing whitespace and pipes.

    Parameters:
        text: Raw OCR text line to clean.

    Returns:
        str: Cleaned text with normalized spacing.
    """
    text = text.replace("|", " ")
    text = re.sub(r"\s{2,}", " ", text)
    return text.strip()


def _collect_text_lines(obj: object, out: list[str]) -> None:
    """Recursively collect OCR text lines from PaddleOCR output structures.

    Handles the various output formats that different PaddleOCR versions
    produce, including nested dicts, lists, and tuples.

    Parameters:
        obj: PaddleOCR output object to traverse.
        out: List accumulator for extracted text lines.
    """
    if isinstance(obj, str):
        cleaned = _clean_line(obj)
        if cleaned:
            out.append(cleaned)
        return

    if isinstance(obj, dict):
        rec_texts = obj.get("rec_texts")
        if isinstance(rec_texts, list):
            for entry in rec_texts:
                if isinstance(entry, str):
                    cleaned = _clean_line(entry)
                    if cleaned:
                        out.append(cleaned)

        for key in ("text", "transcription"):
            candidate = obj.get(key)
            if isinstance(candidate, str):
                cleaned = _clean_line(candidate)
                if cleaned:
                    out.append(cleaned)

        for value in obj.values():
            _collect_text_lines(value, out)
        return

    if isinstance(obj, list):
        if len(obj) >= 2 and isinstance(obj[1], (list, tuple)):
            text_score = obj[1]
            if len(text_score) >= 1 and isinstance(text_score[0], str):
                cleaned = _clean_line(text_score[0])
                if cleaned:
                    out.append(cleaned)
                return

        for item in obj:
            _collect_text_lines(item, out)


def _dedupe_preserve_order(lines: list[str]) -> list[str] | list:
    """Remove duplicate lines while preserving original order.

    Parameters:
        lines: List of text lines to deduplicate.

    Returns:
        list[str]: Deduplicated lines in original order.
    """
    seen: set[str] = set()
    out: list[str] = []
    for line in lines:
        if line not in seen:
            seen.add(line)
            out.append(line)
    return out


def _dedupe_adjacent(lines: list[str]) -> list[str]:
    """Remove only consecutive duplicate OCR lines (scanner artefacts).

    Unlike ``_dedupe_preserve_order`` this keeps non-adjacent duplicates so
    that two identical items on a receipt (same name + price) are both passed
    to the LLM.

    Parameters:
        lines: List of text lines from the OCR engine.

    Returns:
        list[str]: Lines with consecutive duplicates removed.
    """
    out: list[str] = []
    for line in lines:
        if not out or out[-1] != line:
            out.append(line)
    return out


def _ocr_with_paddle(image_path: str) -> str:
    """Run PaddleOCR to extract text from receipt image.

    Parameters:
        image_path: Path to the prepared JPEG image.

    Returns:
        str: Extracted text with lines joined by newlines.
    """
    _progress("Loading text recognition …")
    os.environ.setdefault(
        "OMP_NUM_THREADS", str(_int_env("RECEIPT_OCR_THREADS", _DEFAULT_OCR_THREADS))
    )
    os.environ.setdefault(
        "MKL_NUM_THREADS", str(_int_env("RECEIPT_OCR_THREADS", _DEFAULT_OCR_THREADS))
    )

    try:
        from paddleocr import PaddleOCR  # type: ignore

        with _Spinner("Starting text recognition"):
            ocr = PaddleOCR(
                lang="en",
                use_doc_orientation_classify=False,
                use_doc_unwarping=False,
            )
    except Exception as init_exc:
        raise RuntimeError(
            "PaddleOCR failed to initialize. Install latest packages with: "
            "pip install --upgrade paddlepaddle paddleocr"
        ) from init_exc

    _progress("Step 1/3 — Recognizing text in image …")
    results: object
    try:
        with _Spinner("Reading text from image"):
            if hasattr(ocr, "predict"):
                results = ocr.predict(input=image_path)
            else:
                results = ocr.ocr(image_path, cls=False)
    except TypeError:
        with _Spinner("Reading text from image"):
            results = ocr.ocr(image_path, cls=False)
    except Exception as predict_exc:
        raise RuntimeError(
            f"PaddleOCR prediction failed: {type(predict_exc).__name__}: {predict_exc}"
        ) from predict_exc

    lines: list[str] = []
    _collect_text_lines(results, lines)
    lines = _dedupe_adjacent(lines)

    text = "\n".join(lines)
    _progress(f"Found {len(lines)} line(s) of text.")
    return text


def run_ocr(image_path: str) -> str:
    """Run PaddleOCR to extract text from receipt.

    Parameters:
        image_path: Path to the prepared JPEG image.

    Returns:
        str: Extracted OCR text.

    Raises:
        ModuleNotFoundError: If PaddleOCR is not installed.
        Exception: If OCR extraction fails.
    """
    try:
        return _ocr_with_paddle(image_path)
    except ModuleNotFoundError as exc:
        _progress("Text recognition module not available.")
        raise
    except Exception as exc:
        _progress("Text recognition failed.")
        raise


def run_receipt_extraction(image_path: str) -> str:
    """Extract raw text from a receipt image using PaddleOCR.

    Parameters:
        image_path: Path to the prepared JPEG image.

    Returns:
        str: Extracted OCR text.
    """
    return run_ocr(image_path)


# ─── LLM-based structured inference ─────────────────────────────────────────

_LLM_SYSTEM_PROMPT = (
    "You are a receipt parser. "
    "Given raw OCR text from a grocery receipt, extract every row that has "
    "both a name and a price explicitly visible in the text. "
    "Each row — whether a product, subtotal, tax, or total — is treated the same: "
    "include it if and only if its name and price both appear in the OCR input. "
    'Return ONLY a JSON array with objects having keys "name" (string) and "price" (number). '
    "Do NOT invent rows that are not in the text. "
    "Do NOT include any explanation or markdown — output raw JSON only."
)

# NOTE: {{ and }} are literal braces in .format() strings; {text} is the only placeholder.
_LLM_USER_TEMPLATE = 'Parse this receipt OCR text into a JSON array [{{"name": ..., "price": ...}}]:\n\n{text}'

# Matches a JSON array anywhere in the LLM response (handles leading prose / markdown fences)
_JSON_ARRAY_RE = re.compile(r"\[\s*\{.*?\}\s*\]", re.DOTALL)


def _call_mlx(user_content: str, system_prompt: str | None = None) -> str | None:
    """Run inference via Apple MLX (Apple Silicon only).

    Uses Apple unified memory: model weights live on GPU/CPU simultaneously
    with no copy overhead. Peak RAM ~4.5 GB for the default 8B-4bit model.
    Install: pip install mlx-lm

    Parameters:
        user_content: The prompt text to send to the model.
        system_prompt: Override the system prompt. Defaults to _LLM_SYSTEM_PROMPT.

    Returns:
        str: Generated text response, or None if MLX unavailable.
    """
    model_id = os.environ.get("RECEIPT_LLM_MLX_MODEL", _DEFAULT_MLX_MODEL)
    if not _is_apple_silicon():
        # MLX requires Apple Silicon Metal — skip silently on other platforms.
        return None

    try:
        from mlx_lm import load, generate  # type: ignore
    except ImportError:
        _progress("On-device AI unavailable; trying another method …")
        return None

    cached = _hf_model_is_cached(model_id)
    if cached:
        _progress("Loading AI model …")
    else:
        _progress("Downloading AI model for the first time …")
        _progress(
            "  This is a one-time download (~4–5 GB). Subsequent runs load instantly from cache."
        )
        _download_hf_model_with_progress(model_id)
    try:
        with _Spinner("Loading AI model", interval=5.0):
            model, tokenizer = load(model_id)
    except Exception as exc:
        _progress("AI model failed to load; trying another method …")
        return None

    _progress("AI model ready.")

    # Use the tokenizer's chat template when available (instruction-tuned models).
    sys_prompt = system_prompt if system_prompt is not None else _LLM_SYSTEM_PROMPT
    messages = [
        {"role": "system", "content": sys_prompt},
        {"role": "user", "content": user_content},
    ]
    try:
        if getattr(tokenizer, "chat_template", None):
            formatted: str = tokenizer.apply_chat_template(
                messages, add_generation_prompt=True, tokenize=False
            )
        else:
            formatted = f"{sys_prompt}\n\n{user_content}"
    except Exception:
        formatted = f"{sys_prompt}\n\n{user_content}"

    # mlx-lm ≥ 0.30: temperature is controlled through a sampler object;
    # passing temperature= / temp= directly to generate() raises a TypeError
    # because generate_step() no longer accepts those kwargs.
    # mlx-lm < 0.30 (roughly 0.12–0.29): generate() accepted temperature=.
    # mlx-lm < 0.12: generate() accepted temp=.
    # We probe with make_sampler first (safest path for current installs),
    # then fall back to the legacy kwargs for older versions.
    try:
        from mlx_lm.sample_utils import make_sampler  # type: ignore  # added in 0.19

        _extra_kwargs: dict = {"sampler": make_sampler(temp=0.0)}
    except ImportError:
        _extra_kwargs = {"temperature": 0.0}

    _progress("Analysing receipt with AI … (typically 5–30 s)")
    try:
        # Prefer stream_generate so we can report token-by-token progress;
        # fall back to generate() if stream_generate is unavailable or incompatible.
        try:
            from mlx_lm import stream_generate  # type: ignore

            tokens: list[str] = []
            for result in stream_generate(
                model,
                tokenizer,
                prompt=formatted,
                max_tokens=2048,
                **_extra_kwargs,
            ):
                token_text: str = (
                    result.text if hasattr(result, "text") else str(result)
                )
                tokens.append(token_text)
                n = len(tokens)
                if n in (1, 50) or n % 100 == 0:
                    _progress(f"  Generating … {n} token(s)")
            response: str = "".join(tokens)
        except (ImportError, TypeError, AttributeError):
            # stream_generate unavailable or returned an incompatible type.
            response = generate(
                model,
                tokenizer,
                prompt=formatted,
                max_tokens=2048,
                verbose=False,
                **_extra_kwargs,
            )
        _progress("AI analysis complete.")
        return response
    except Exception as exc:
        _progress("AI analysis failed; trying another method …")
        return None


def _call_llama_cpp(user_content: str, system_prompt: str | None = None) -> str | None:
    """Run inference via llama-cpp-python (Windows and Linux).

    Automatically uses CUDA when available, falls back to CPU.
    Install (CPU):  pip install llama-cpp-python
    Install (CUDA): CMAKE_ARGS="-DGGML_CUDA=on" pip install llama-cpp-python
    Model downloads from HuggingFace on first use (~4.9 GB for Q4_K_M).

    Parameters:
        user_content: The prompt text to send to the model.
        system_prompt: Override the system prompt. Defaults to _LLM_SYSTEM_PROMPT.

    Returns:
        str: Generated text response, or None if llama-cpp unavailable.
    """
    repo_id = os.environ.get("RECEIPT_LLM_GGUF_MODEL", _DEFAULT_GGUF_MODEL)
    filename_pattern = os.environ.get(
        "RECEIPT_LLM_GGUF_FILENAME", _DEFAULT_GGUF_FILENAME
    )

    try:
        from llama_cpp import Llama  # type: ignore
    except ImportError:
        _progress("On-device AI unavailable; trying another method …")
        return None

    cached = _hf_model_is_cached(repo_id)
    if cached:
        _progress("Loading AI model …")
    else:
        _progress("Downloading AI model for the first time …")
        _progress(
            "  This is a one-time download (~4–5 GB). Subsequent runs load instantly from cache."
        )
        _download_hf_model_with_progress(repo_id)
    try:
        with _Spinner("Loading AI model", interval=5.0):
            llm = Llama.from_pretrained(
                repo_id=repo_id,
                filename=filename_pattern,
                n_ctx=4096,
                n_gpu_layers=-1,  # offload all layers to GPU when available; 0 = CPU only
                verbose=False,
            )
    except Exception as exc:
        _progress("AI model failed to load; trying another method …")
        return None

    _progress("AI model ready.")
    sys_prompt = system_prompt if system_prompt is not None else _LLM_SYSTEM_PROMPT
    messages = [
        {"role": "system", "content": sys_prompt},
        {"role": "user", "content": user_content},
    ]
    _progress("Analysing receipt with AI … (this may take up to a minute)")
    try:
        with _Spinner("Analysing receipt"):
            result = llm.create_chat_completion(
                messages=messages,
                max_tokens=2048,
                temperature=0.0,
            )
        _progress("AI analysis complete.")
        return result["choices"][0]["message"]["content"]
    except Exception as exc:
        _progress("AI analysis failed; trying another method …")
        return None


def _call_ollama(prompt: str) -> str | None:
    """Call the local ollama daemon HTTP API for text generation.

    Universal fallback that works on all platforms if ollama is installed.
    Automatically installs ollama and pulls the model when needed.
    Uses only stdlib http.client (no external HTTP library dependency).

    Parameters:
        prompt: The prompt text to send to ollama.

    Returns:
        str: Generated text response, or None if ollama unavailable.
    """
    model = os.environ.get("RECEIPT_LLM_MODEL", _DEFAULT_OLLAMA_MODEL)
    host = os.environ.get("RECEIPT_LLM_HOST", _DEFAULT_OLLAMA_HOST)
    timeout = _int_env("RECEIPT_LLM_TIMEOUT", _DEFAULT_LLM_TIMEOUT)

    # ── Ensure ollama binary is installed ─────────────────────────────────
    binary = _ensure_ollama_installed()
    if binary is None:
        _progress("AI service setup failed; skipping.")
        return None

    # ── Ensure the ollama server is running ───────────────────────────────
    if not _start_ollama_server(binary):
        _progress("AI service unavailable; skipping.")
        return None

    # ── Ensure the model is pulled / available ────────────────────────────
    if not _ensure_ollama_model(model):
        _progress("AI model not available; skipping.")
        return None

    payload = json.dumps(
        {
            "model": model,
            "prompt": prompt,
            "stream": False,
            "options": {
                "temperature": 0.0,  # deterministic — we want exact JSON, not creative prose
                "num_predict": 2048,
            },
        }
    ).encode("utf-8")

    _progress("Analysing receipt with AI …")
    conn: http.client.HTTPConnection | None = None
    try:
        conn = http.client.HTTPConnection(host, timeout=timeout)
        conn.request(
            "POST",
            "/api/generate",
            body=payload,
            headers={"Content-Type": "application/json"},
        )
        resp = conn.getresponse()
        if resp.status != 200:
            _progress("AI service returned an error; skipping.")
            return None
        body = resp.read().decode("utf-8")
        # Ollama non-stream response: {"model":..., "response": "...", ...}
        data = json.loads(body)
        _progress("AI analysis complete.")
        return str(data.get("response", ""))
    except OSError as exc:
        _progress("AI service not reachable; skipping.")
        return None
    except Exception as exc:
        _progress("AI analysis failed; skipping.")
        return None
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass


def _parse_llm_response(response_text: str) -> list[dict] | None:
    """
    Extract a list of {name, price} dicts from an LLM response.

    Handles:
    - Clean JSON arrays
    - JSON arrays wrapped in markdown code fences (```json ... ```)
    - JSON buried in prose
    """
    if not response_text:
        return None

    # Strip markdown fences if present
    fence_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", response_text)
    candidate = fence_match.group(1).strip() if fence_match else response_text.strip()

    # Try direct parse first
    for text in (candidate, response_text):
        try:
            parsed = json.loads(text)
            if isinstance(parsed, list):
                return _validate_llm_rows(parsed)
        except json.JSONDecodeError:
            pass

    # Find the first JSON array-like substring
    array_match = _JSON_ARRAY_RE.search(response_text)
    if array_match:
        try:
            parsed = json.loads(array_match.group(0))
            if isinstance(parsed, list):
                return _validate_llm_rows(parsed)
        except json.JSONDecodeError:
            pass

    _progress("Could not read structured data from AI response.")
    return None


def _validate_llm_rows(raw_rows: list) -> list[dict]:
    """Sanitize and type-check rows coming from the LLM."""
    rows: list[dict] = []
    for item in raw_rows:
        if not isinstance(item, dict):
            continue
        # Accept any reasonable key spelling the LLM might use
        name = (
            item.get("name")
            or item.get("item")
            or item.get("description")
            or item.get("product")
            or ""
        )
        price_raw = item.get("price") or item.get("amount") or item.get("total")
        if not isinstance(name, str) or not name.strip():
            continue
        price = _to_price(str(price_raw))
        if price is None:
            continue
        rows.append({"name": name.strip(), "price": price})
    return rows


# Summary-line keywords: rows whose *entire* name is one of these tokens are treated
# as summary lines (SUBTOTAL, TAX, TOTAL, etc.) that the LLM might hallucinate.
_SUMMARY_NAME_RE = re.compile(
    r"^(?:SUB\s*TOTAL|SUBTOTAL|TAX|HST|GST|PST|VAT|TOTAL|TTTL|"
    r"AMOUNT\s*DUE|GRAND\s*TOTAL|BALANCE\s*DUE|CHANGE|DISCOUNT)$",
    re.IGNORECASE,
)


def _filter_hallucinated_summary_rows(rows: list[dict], ocr_text: str) -> list[dict]:
    """Remove LLM-hallucinated summary rows that have no evidence in the OCR text.

    A row is considered a hallucinated summary line when:
    - Its name matches _SUMMARY_NAME_RE (the whole name is a summary keyword), AND
    - That keyword does not appear as a word boundary in the original OCR text.

    Product names that *contain* summary words (e.g. "Tax Free Oat Milk") are
    never dropped because _SUMMARY_NAME_RE requires a full-name match.
    """
    filtered: list[dict] = []
    for row in rows:
        name = str(row.get("name", "")).strip()
        if _SUMMARY_NAME_RE.match(name):
            # Build a regex that tolerates optional internal spaces (e.g. "SUB TOTAL").
            keyword_pattern = re.sub(r"\s+", r"\\s*", re.escape(name))
            if not re.search(r"\b" + keyword_pattern + r"\b", ocr_text, re.IGNORECASE):
                _progress(f"Removing non-product row: {name!r}")
                continue
        filtered.append(row)
    return filtered


def parse_rows_with_llm(ocr_text: str) -> list[Dict] | None:
    """Infer structured rows from OCR text using the best available LLM backend.

    Backend priority by platform:
        macOS Apple Silicon  →  mlx-lm  →  ollama
        macOS Intel          →  ollama
        Windows / Linux      →  llama-cpp-python  →  ollama

    Parameters:
        ocr_text: Raw OCR-extracted receipt text to parse.

    Returns:
        list[Dict]: List of dicts with 'name' and 'price' keys, or None if
                    LLM unavailable (caller should fall back to regex).
    """
    if os.environ.get("RECEIPT_LLM_DISABLE", "").strip() == "1":
        _progress("LLM disabled via RECEIPT_LLM_DISABLE=1.")
        return None

    if not ocr_text.strip():
        return None

    user_prompt = _LLM_USER_TEMPLATE.format(text=ocr_text.strip())
    ollama_prompt = f"{_LLM_SYSTEM_PROMPT}\n\n{user_prompt}"
    response: str | None = None

    if _is_apple_silicon():
        _progress("Preparing on-device AI …")
        response = _call_mlx(user_prompt)
        if response is None:
            _progress("On-device AI unavailable; switching to AI service …")
            response = _call_ollama(ollama_prompt)

    elif _is_windows() or _is_linux():
        plat = "Windows" if _is_windows() else "Linux"
        _progress("Preparing on-device AI …")
        response = _call_llama_cpp(user_prompt)
        if response is None:
            _progress("On-device AI unavailable; switching to AI service …")
            response = _call_ollama(ollama_prompt)

    else:
        # macOS Intel or unknown platform — go straight to ollama.
        _progress("Preparing AI service …")
        response = _call_ollama(ollama_prompt)

    if response is None:
        return None

    rows = _parse_llm_response(response)
    if rows is None:
        return None

    _progress(f"Found {len(rows)} item(s) on the receipt.")
    return rows


# ─── Row extraction (regex fallback) ─────────────────────────────────────────


def extract_rows(ocr_text: str) -> list[Dict]:
    """Parse OCR text into [{name, price}] rows using regex heuristics.

    Fallback when LLM is unavailable or returns no usable output.
    Every line with a recognizable price is kept; lines without prices
    are dropped. Summary lines (TAX, SUBTOTAL, TOTAL, etc.) are included.

    Parameters:
        ocr_text: Raw OCR-extracted receipt text.

    Returns:
        list[Dict]: List of dicts with 'name' and 'price' keys.
    """
    rows: list[dict] = []
    for raw_line in ocr_text.splitlines():
        line = raw_line.strip()
        if not line or _SKIP_LINE_RE.match(line):
            continue

        price = _price_from_line(line)
        if price is None:
            continue

        name = _name_from_line(line)
        if not name:
            continue

        rows.append({"name": name, "price": price})

    return rows


def extract_receipt_data(ocr_text: str) -> Dict:
    """Extract structured receipt data from OCR text using regex.

    Extracts item rows and the receipt total. Does not use LLM inference.

    Parameters:
        ocr_text: Raw OCR-extracted receipt text.

    Returns:
        Dict: Structure containing 'rows' (list of items) and 'total' (float or None).
    """
    rows = extract_rows(ocr_text)
    lines = ocr_text.splitlines()
    total = _extract_total(lines)

    has_total_row = any(
        re.search(r"\b(?:TOTAL|TTTL|AMOUNT)\b", r["name"], re.IGNORECASE) for r in rows
    )
    if total is not None and not has_total_row:
        rows.append({"name": "TOTAL", "price": total})

    return {"rows": rows, "total": total}


# ─── Processed-image sidecar ─────────────────────────────────────────────────


def _save_processed_image(src: str, dst: str) -> None:
    """Copy processed image to output path for Tauri preview.

    Creates parent directories as needed.

    Parameters:
        src: Source image path.
        dst: Destination path for the preview image.
    """
    try:
        from shutil import copyfile

        dst_parent = Path(dst).parent
        dst_parent.mkdir(parents=True, exist_ok=True)
        copyfile(src, dst)
        _progress(f"Saved processed image → {dst}")
    except Exception as exc:
        _progress(f"Warning: could not save processed image: {exc}")


# ─── Entry point ─────────────────────────────────────────────────────────────


def main() -> None:
    """Main entry point for receipt scanning pipeline.

    Coordinates the three-step pipeline:
    1. Image preparation and PaddleOCR extraction
    2. LLM-based structured inference (with regex fallback)
    3. Output saving and cleanup

    Outputs JSON to stdout for Tauri consumption; diagnostics to stderr.
    """
    if len(sys.argv) < 2:
        print(
            json.dumps(
                {
                    "error": "Usage: scan_receipt.py <image_path> [<processed_image_path>]"
                }
            )
        )
        sys.exit(1)

    image_path = sys.argv[1]
    processed_image_path = sys.argv[2] if len(sys.argv) > 2 else None
    if not os.path.isfile(image_path):
        print(json.dumps({"error": f"Image file not found: {image_path}"}))
        sys.exit(1)

    prepared_image_path: str | None = None

    # ── Step 1: Prepare & OCR ────────────────────────────────────────────────
    _progress("Preparing image…")
    try:
        prepared_image_path = _prepare_image_for_ocr(image_path)
        ocr_text = run_receipt_extraction(prepared_image_path)
    except Exception as exc:
        print(json.dumps({"error": f"OCR failed: {exc}"}))
        sys.exit(1)

    _progress(f"Step 1/3 complete — {len(ocr_text.splitlines())} text lines found.")

    # ── Step 2: LLM inference ────────────────────────────────────────────────
    _progress("Step 2/3 — Running AI model for structured extraction …")
    ocr_lines = ocr_text.splitlines()
    total = _extract_total(ocr_lines)
    llm_rows = parse_rows_with_llm(ocr_text)

    if llm_rows is not None and len(llm_rows) > 0:
        # LLM succeeded — filter out any hallucinated summary lines, then use its output.
        llm_rows = _filter_hallucinated_summary_rows(llm_rows, ocr_text)
        rows = llm_rows
        if total is None:
            total = next(
                (
                    r["price"]
                    for r in rows
                    if re.search(
                        r"\b(?:TOTAL|TTTL|AMOUNT\s*DUE|GRAND\s*TOTAL)\b",
                        r["name"],
                        re.IGNORECASE,
                    )
                ),
                None,
            )
        _progress(f"Step 2/3 complete — found {len(rows)} item(s).")
    else:
        # LLM unavailable or returned nothing useful — fall back to regex parser
        _progress("AI unavailable — using built-in text parser.")
        fallback = extract_receipt_data(ocr_text)
        rows = fallback["rows"]
        total = fallback.get("total") or total

    # Ensure TOTAL row is present
    has_total_row = any(
        re.search(r"\b(?:TOTAL|TTTL|AMOUNT)\b", str(r.get("name", "")), re.IGNORECASE)
        for r in rows
        if isinstance(r, dict)
    )
    if total is not None and not has_total_row:
        rows.append({"name": "TOTAL", "price": round(float(total), 2)})

    final_data: dict = {"rows": rows, "total": total}

    # ── Step 3: Save processed image sidecar ────────────────────────────────
    _progress("Step 3/3 — Saving results …")
    if processed_image_path:
        _save_processed_image(prepared_image_path or image_path, processed_image_path)

    # ── Emit JSON to stdout (consumed by Tauri) ──────────────────────────────
    print(json.dumps(final_data))
    _progress("Done.")

    # Remove temporary downscaled image once all outputs are done.
    if prepared_image_path and prepared_image_path != image_path:
        try:
            os.remove(prepared_image_path)
        except OSError:
            pass


if __name__ == "__main__":
    main()
