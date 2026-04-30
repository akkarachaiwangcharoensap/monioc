#!/usr/bin/env python3
"""
check_models.py — Check, download, poll progress, or remove AI models.

Usage:
    python3 check_models.py                # check only — outputs JSON status
    python3 check_models.py --download     # download any missing models
    python3 check_models.py --progress     # output download progress as JSON
    python3 check_models.py --remove       # delete all cached models

Output (stdout):
    --check (default): {"ocr": bool, "llm": bool}
    --progress:        {"downloadedBytes": int, "totalBytes": int,
                        "downloadedFiles": int, "totalFiles": int}
    --download:        {"ocr": bool, "llm": bool}
    --remove:          {"removed": true}

Diagnostics are written to stderr via the same progress protocol as scan_receipt.py
so Tauri can stream them to the frontend.
"""
from __future__ import annotations

import json
import os
import platform
import shutil
import sys
from pathlib import Path

_PROGRESS_PREFIX = "[check_models]"

def _progress(message: str) -> None:
    print(f"{_PROGRESS_PREFIX} {message}", file=sys.stderr, flush=True)

# ── Platform helpers (mirrored from scan_receipt.py) ──────────────────────────

def _is_apple_silicon() -> bool:
    return sys.platform == "darwin" and platform.machine() == "arm64"

def _is_macos_intel() -> bool:
    return sys.platform == "darwin" and platform.machine() != "arm64"

# ── Default model identifiers (must match scan_receipt.py) ────────────────────

_DEFAULT_MLX_MODEL = "mlx-community/Ministral-3-8B-Instruct-2512-4bit"
_DEFAULT_GGUF_MODEL = "bartowski/Meta-Llama-3.1-8B-Instruct-GGUF"
_DEFAULT_GGUF_FILENAME = "*Q4_K_M.gguf"

# ── Known sizes for progress polling ─────────────────────────────────────────

# OCR: measured via stat() on ~/.paddlex/official_models (~99 MB across 40 files)
_OCR_EXPECTED_BYTES = 103_400_000   # ~103 MB
_OCR_EXPECTED_FILES = 40

def _llm_expected_bytes() -> int:
    """Expected LLM download size for the current platform."""
    if _is_apple_silicon():
        return 5_634_000_000  # ~5.63 GB — MLX 4-bit 8B (multiple weight shards + metadata)
    return 4_920_000_000      # ~4.92 GB — GGUF Q4_K_M single file (Windows / Linux)

def _llm_expected_files() -> int:
    """Expected number of files in the LLM download for the current platform."""
    if _is_apple_silicon():
        return 13  # weight shards + config + tokenizer files
    return 1       # single .gguf blob

# ── Path helpers ──────────────────────────────────────────────────────────────

def _ocr_models_dir() -> Path:
    return Path.home() / ".paddlex" / "official_models"

def _llm_hf_cache_dir(model_id: str) -> Path:
    """Return the HuggingFace hub cache directory for a model."""
    hf_home = Path(os.environ.get("HF_HOME", Path.home() / ".cache" / "huggingface"))
    safe_name = model_id.replace("/", "--")
    return hf_home / "hub" / f"models--{safe_name}"

def _get_llm_model_id() -> str | None:
    """Return the LLM model id for this platform, or None if not applicable."""
    if _is_apple_silicon():
        return os.environ.get("RECEIPT_LLM_MLX_MODEL", _DEFAULT_MLX_MODEL)
    elif sys.platform != "darwin":
        return os.environ.get("RECEIPT_LLM_GGUF_MODEL", _DEFAULT_GGUF_MODEL)
    return None  # macOS Intel uses ollama

# ── OCR model check ──────────────────────────────────────────────────────────

def _ocr_models_present() -> bool:
    """Check whether PaddleOCR models are cached in ~/.paddlex."""
    models_dir = _ocr_models_dir()
    if not models_dir.is_dir():
        return False
    has_det = any(d.name.startswith("PP-OCRv") and "det" in d.name for d in models_dir.iterdir() if d.is_dir())
    has_rec = any(d.name.endswith("_rec") for d in models_dir.iterdir() if d.is_dir())
    return has_det and has_rec

def _download_ocr_models() -> bool:
    """Trigger PaddleOCR model download by running a minimal init."""
    try:
        _progress("Downloading OCR models …")
        os.environ.setdefault("OMP_NUM_THREADS", "2")
        os.environ.setdefault("MKL_NUM_THREADS", "2")
        from paddleocr import PaddleOCR  # type: ignore
        _progress("Initializing PaddleOCR (this downloads models on first run) …")
        PaddleOCR(
            lang="en",
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
        )
        _progress("OCR models downloaded.")
        return True
    except Exception as exc:
        _progress(f"OCR model init error: {exc}")
        # On Windows, PaddleOCR often raises during GPU/DirectX detection even
        # when the model files downloaded successfully.  Check the disk before
        # reporting failure so a successful download isn't falsely rejected.
        if _ocr_models_present():
            _progress("OCR models verified on disk — treating as downloaded.")
            return True
        return False

# ── LLM model check ─────────────────────────────────────────────────────────

def _hf_model_is_cached(repo_id: str) -> bool:
    """Return True if the HF hub repo is present AND has no in-progress blobs."""
    try:
        from huggingface_hub import scan_cache_dir  # type: ignore
        if not any(r.repo_id == repo_id for r in scan_cache_dir().repos):
            return False
        # Any .incomplete file means the download was interrupted.
        blobs_dir = _llm_hf_cache_dir(repo_id) / "blobs"
        if blobs_dir.is_dir() and any(
            f.suffix == ".incomplete" for f in blobs_dir.iterdir() if f.is_file()
        ):
            return False
        return True
    except Exception:
        return False

def _llm_gguf_snapshot_present(repo_id: str) -> bool:
    """Return True if the Q4_K_M file is resolvable in the HF snapshots tree.

    An old partial download (before allow_patterns was added) may have fetched
    different quantisation variants but not the Q4_K_M file we actually need.
    """
    import fnmatch
    gguf_pattern = os.environ.get("RECEIPT_LLM_GGUF_FILENAME", _DEFAULT_GGUF_FILENAME)
    snapshots_dir = _llm_hf_cache_dir(repo_id) / "snapshots"
    if not snapshots_dir.is_dir():
        return False
    for rev_dir in snapshots_dir.iterdir():
        if not rev_dir.is_dir():
            continue
        for f in rev_dir.iterdir():
            if fnmatch.fnmatch(f.name, gguf_pattern):
                try:
                    target = f.resolve()
                    # Blob must be at least 4 GB to be a complete Q4_K_M download.
                    return target.exists() and target.stat().st_size > 4_000_000_000
                except OSError:
                    pass
    return False

def _llm_model_present() -> bool:
    """Check whether the LLM model for the current platform is cached."""
    model_id = _get_llm_model_id()
    if model_id is None:
        return True  # macOS Intel → ollama; report as available
    if not _hf_model_is_cached(model_id):
        return False
    # For GGUF platforms, also verify the specific quantisation file is present
    # and fully downloaded (not just that the repo entry exists).
    if not _is_apple_silicon():
        return _llm_gguf_snapshot_present(model_id)
    return True

def _download_llm_model() -> bool:
    """Download the LLM model for the current platform."""
    model_id = _get_llm_model_id()
    if model_id is None:
        return True

    if _llm_model_present():
        _progress("LLM model already cached.")
        return True

    _progress("Downloading AI analysis model …")
    try:
        from huggingface_hub import snapshot_download  # type: ignore
        os.environ["HF_HUB_DISABLE_PROGRESS_BARS"] = "1"

        # MLX repos (Apple Silicon) contain safetensors shards — no .gguf files.
        # Filtering by a GGUF pattern there would download nothing.
        if _is_apple_silicon():
            allow = None
        else:
            gguf_filename = os.environ.get("RECEIPT_LLM_GGUF_FILENAME", _DEFAULT_GGUF_FILENAME)
            allow = [gguf_filename]
            _progress(f"  Downloading {gguf_filename} from {model_id} (~4.92 GB) …")

        try:
            sys.path.insert(0, str(Path(__file__).parent))
            from scan_receipt import _ProgressTqdm  # type: ignore
            snapshot_download(repo_id=model_id, allow_patterns=allow, tqdm_class=_ProgressTqdm)
        except (ImportError, TypeError, AttributeError):
            snapshot_download(repo_id=model_id, allow_patterns=allow)

        _progress("AI analysis model downloaded.")
        return True
    except Exception as exc:
        _progress(f"AI model download failed: {exc}")
        return False

# ── Progress polling ─────────────────────────────────────────────────────────

def _dir_stats(path: Path) -> tuple[int, int]:
    """Return (total_bytes, file_count) for all regular files under *path*."""
    total_bytes = 0
    file_count = 0
    if not path.exists():
        return 0, 0
    for f in path.rglob("*"):
        if f.is_file():
            try:
                total_bytes += f.stat().st_size
                file_count += 1
            except OSError:
                pass
    return total_bytes, file_count

def _poll_progress() -> dict:
    """Return current download progress by polling model directories on disk."""
    ocr_bytes, ocr_files = _dir_stats(_ocr_models_dir())

    llm_bytes, llm_files = 0, 0
    model_id = _get_llm_model_id()
    if model_id is not None:
        llm_dir = _llm_hf_cache_dir(model_id)
        # Count blobs/ only — HF hub writes .incomplete files directly inside
        # blobs/ while downloading, so stat()-ing blobs/ already captures
        # in-flight data.  A separate rglob over llm_dir would double-count
        # the snapshots/ symlinks.
        blobs_dir = llm_dir / "blobs"
        if blobs_dir.exists():
            llm_bytes, llm_files = _dir_stats(blobs_dir)

    total_expected = _OCR_EXPECTED_BYTES + _llm_expected_bytes()
    total_files_expected = _OCR_EXPECTED_FILES + _llm_expected_files()

    return {
        "downloadedBytes": ocr_bytes + llm_bytes,
        "totalBytes": total_expected,
        "downloadedFiles": ocr_files + llm_files,
        "totalFiles": total_files_expected,
    }

# ── Remove models ────────────────────────────────────────────────────────────

def _remove_models() -> None:
    """Delete all cached AI models (OCR + LLM)."""
    ocr_dir = _ocr_models_dir()
    if ocr_dir.exists():
        _progress("Removing OCR models …")
        shutil.rmtree(ocr_dir, ignore_errors=True)

    model_id = _get_llm_model_id()
    if model_id is not None:
        llm_dir = _llm_hf_cache_dir(model_id)
        if llm_dir.exists():
            _progress("Removing AI analysis model …")
            shutil.rmtree(llm_dir, ignore_errors=True)

    _progress("All AI models removed.")

# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    if "--remove" in sys.argv:
        _remove_models()
        print(json.dumps({"removed": True}))
        return

    if "--progress" in sys.argv:
        print(json.dumps(_poll_progress()))
        return

    download_mode = "--download" in sys.argv

    if download_mode:
        _progress("Downloading AI models …")
        ocr_ok = _ocr_models_present() or _download_ocr_models()
        llm_ok = _llm_model_present() or _download_llm_model()
        if ocr_ok and llm_ok:
            _progress("All models ready.")
        else:
            _progress("Some models could not be downloaded.")
    else:
        ocr_ok = _ocr_models_present()
        llm_ok = _llm_model_present()

    print(json.dumps({"ocr": ocr_ok, "llm": llm_ok}))


if __name__ == "__main__":
    main()
