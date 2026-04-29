#!/usr/bin/env python3
"""
categorize_items.py — LLM-based grocery item categorization.

Usage:
    python3 categorize_items.py '<json_payload>'

Where json_payload is a JSON object:
    {"items": ["Organic Milk 2L", "Bananas", ...],
     "categories": ["Dairy & Eggs", "Produce", ...]}

Output (stdout):
    {"categories": ["Dairy & Eggs", "Produce", ...]}

Uses the same on-device LLM backend as scan_receipt.py (MLX on Apple Silicon,
llama-cpp on Windows/Linux, ollama as universal fallback).
"""
from __future__ import annotations

import json
import os
import re
import sys
from typing import Callable

# ── Import LLM infrastructure from scan_receipt.py ───────────────────────────
# Both scripts are bundled in the same resource directory, so a sys.path
# insert is sufficient to make scan_receipt importable.
_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
if _THIS_DIR not in sys.path:
    sys.path.insert(0, _THIS_DIR)

try:
    from scan_receipt import (  # type: ignore[import]
        _call_mlx,
        _call_llama_cpp,
        _call_ollama,
        _is_apple_silicon,
        _is_windows,
        _is_linux,
        _progress as _scan_progress,
    )

    _HAS_SCAN_RECEIPT = True
except ImportError:  # pragma: no cover
    _HAS_SCAN_RECEIPT = False
    _scan_progress = None  # type: ignore[assignment]

_PREFIX = "[categorize_items]"


def _progress(message: str) -> None:
    """Write a progress line to stderr."""
    print(f"{_PREFIX} {message}", file=sys.stderr, flush=True)


# ── Prompt templates ──────────────────────────────────────────────────────────

_SYSTEM_PROMPT = (
    "You are a receipt line item categorizer. "
    "Given a JSON list of receipt line item names and a JSON list of user-defined category names, "
    "assign each item to exactly one category from the provided list. "
    "Receipt line items may include grocery food/drink products, household supplies, "
    "personal care items, taxes (e.g. HST, GST, PST, VAT, sales tax), service charges, "
    "fees, discounts, subtotals, bag fees, deposits, and other charges. "
    "Match tax-related items (HST, GST, PST, VAT, TAX, etc.) to a 'Tax' category when available. "
    "Match totals/subtotals to a 'Total' category when available. "
    "Return ONLY a JSON array of strings (one per input item) where each string "
    "is the assigned category. Use 'Other' when no category fits. "
    "The output array MUST have the same length as the input items array. "
    "Do NOT include any explanation, markdown, or extra text — raw JSON array only."
)


def _build_user_prompt(items: list[str], categories: list[str]) -> str:
    return (
        f"Categorize these receipt line items into the given categories.\n"
        f"Items: {json.dumps(items)}\n"
        f"Categories: {json.dumps(categories)}\n"
        f"Return a JSON array with exactly {len(items)} category strings."
    )


# ── Response parsing ──────────────────────────────────────────────────────────


def _coerce_to_categories(
    parsed: object, items: list[str], categories: list[str]
) -> list[str] | None:
    """Validate and normalise a parsed LLM response into a category list."""
    if not isinstance(parsed, list):
        return None
    result: list[str] = []
    for i in range(len(items)):
        raw = parsed[i] if i < len(parsed) else "Other"
        cat = str(raw).strip()
        result.append(cat if cat in categories else "Other")

    return result


def _parse_response(
    response: str, items: list[str], categories: list[str]
) -> list[str] | None:
    """Extract a category list from an LLM response string."""
    # Strip markdown code fences if present
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", response)
    candidate = fence.group(1).strip() if fence else response.strip()

    for text in (candidate, response):
        try:
            parsed = json.loads(text)
            result = _coerce_to_categories(parsed, items, categories)
            if result is not None:
                return result
        except json.JSONDecodeError:
            pass

    # Last resort: find first JSON array anywhere in the response
    arr_match = re.search(r"\[.*?\]", response, re.DOTALL)
    if arr_match:
        try:
            parsed = json.loads(arr_match.group(0))
            result = _coerce_to_categories(parsed, items, categories)
            if result is not None:
                return result
        except json.JSONDecodeError:
            pass

    _progress(f"Could not parse LLM response (first 300 chars): {response[:300]}")
    return None


# ── LLM dispatch ──────────────────────────────────────────────────────────────


def _categorize_with_llm(items: list[str], categories: list[str]) -> list[str] | None:
    """Call the best available on-device LLM to assign categories."""
    if not _HAS_SCAN_RECEIPT:
        _progress("scan_receipt.py not importable — LLM backends unavailable.")
        return None

    user_prompt = _build_user_prompt(items, categories)

    _progress(f"User prompt. {user_prompt}")

    ollama_prompt = f"{_SYSTEM_PROMPT}\n\n{user_prompt}"
    response: str | None = None

    # Mirror the platform-selection logic from scan_receipt.py.
    if _is_apple_silicon():  # type: ignore[misc]
        _progress("Platform: Apple Silicon — using MLX for category inference.")
        response = _call_mlx(user_prompt, system_prompt=_SYSTEM_PROMPT)  # type: ignore[misc]
        if response is None:
            _progress("MLX unavailable — falling back to ollama.")
            response = _call_ollama(ollama_prompt)  # type: ignore[misc]
    elif _is_windows() or _is_linux():  # type: ignore[misc]
        _progress("Platform: Windows/Linux — using llama-cpp for category inference.")
        response = _call_llama_cpp(user_prompt, system_prompt=_SYSTEM_PROMPT)  # type: ignore[misc]
        if response is None:
            _progress("llama-cpp unavailable — falling back to ollama.")
            response = _call_ollama(ollama_prompt)  # type: ignore[misc]
    else:
        _progress("Platform: macOS Intel — using ollama for category inference.")
        response = _call_ollama(ollama_prompt)  # type: ignore[misc]

    if not response:
        return None

    return _parse_response(response, items, categories)


# ── Entry point ───────────────────────────────────────────────────────────────


def main() -> None:
    if len(sys.argv) < 2:
        _progress("Usage: categorize_items.py '<json_payload>'")
        print(json.dumps({"categories": [], "error": "no input provided"}))
        sys.exit(1)

    try:
        payload = json.loads(sys.argv[1])
        items: list[str] = [str(x) for x in payload.get("items", [])]
        categories: list[str] = [str(x) for x in payload.get("categories", [])]
    except Exception as exc:
        _progress(f"Failed to parse input: {exc}")
        print(json.dumps({"categories": [], "error": str(exc)}))
        sys.exit(1)

    if not items:
        print(json.dumps({"categories": []}))
        return

    # Replace empty names with a placeholder so the LLM always returns exactly
    # len(items) categories in the correct positions.  An empty entry passed raw
    # can cause the LLM to skip it and return a shorter array, which shifts all
    # subsequent categories.  Rust's apply_categories will assign None (shown as
    # "-- None --") to any row whose name is empty, ignoring the LLM result.
    _EMPTY_PLACEHOLDER = "[blank row]"
    items_for_llm = [item if item.strip() else _EMPTY_PLACEHOLDER for item in items]

    # Batch to avoid positional drift on long receipts.  On-device quantized
    # models lose track of their position in the array after ~20 items and start
    # assigning categories to the wrong rows.  Splitting into small batches keeps
    # each LLM call short enough to stay accurate.
    _BATCH_SIZE = 15
    assigned: list[str] = []
    for _batch_start in range(0, len(items_for_llm), _BATCH_SIZE):
        _batch = items_for_llm[_batch_start : _batch_start + _BATCH_SIZE]
        _progress(
            f"Categorizing items {_batch_start + 1}–{_batch_start + len(_batch)}"
            f" of {len(items_for_llm)}."
        )
        _batch_result = _categorize_with_llm(_batch, categories)
        if _batch_result is None:
            _progress(f"LLM unavailable for batch {_batch_start}; using 'Other'.")
            _batch_result = ["Other"] * len(_batch)
        assigned.extend(_batch_result)

    _progress(f"Done. Categories assigned: {json.dumps(assigned)}")
    print(json.dumps({"categories": assigned}))


if __name__ == "__main__":
    main()
