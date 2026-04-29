"""
Unit tests for categorize_items.py

Run with:
    python -m pytest src-tauri/test_categorize_items.py -v
  or (stdlib only):
    python -m unittest discover -s src-tauri -p "test_categorize_items.py" -v

Coverage:
  - _coerce_to_categories: valid list, category not in allowed set, short list, non-list
  - _parse_response: clean JSON array, markdown code fences, embedded array fallback,
    completely unparseable output
  - _categorize_with_llm platform routing: Apple Silicon, Windows/Linux, Intel macOS,
    scan_receipt unavailable fallback
  - main() entry point: no args, invalid JSON, empty items, LLM unavailable
"""
from __future__ import annotations

import importlib
import json
import sys
import unittest
from io import StringIO
from unittest.mock import MagicMock, patch


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _import_ci():
    """Import categorize_items fresh each time to avoid state leakage."""
    if "categorize_items" in sys.modules:
        del sys.modules["categorize_items"]
    return importlib.import_module("categorize_items")


_CATS = ["Produce", "Dairy & Eggs", "Beverages", "Snacks & Candy", "Other"]
_ITEMS = ["Organic Milk 2L", "Bananas", "Cola 2L"]


# ---------------------------------------------------------------------------
# 1. _coerce_to_categories
# ---------------------------------------------------------------------------

class TestCoerceToCategories(unittest.TestCase):
    """_coerce_to_categories validates and normalises a parsed LLM list."""

    def setUp(self):
        self.ci = _import_ci()

    def test_valid_exact_match(self):
        result = self.ci._coerce_to_categories(
            ["Dairy & Eggs", "Produce", "Beverages"], _ITEMS, _CATS
        )
        self.assertEqual(result, ["Dairy & Eggs", "Produce", "Beverages"])

    def test_unknown_category_replaced_with_other(self):
        result = self.ci._coerce_to_categories(
            ["Dairy & Eggs", "Candy", "Beverages"], _ITEMS, _CATS
        )
        self.assertEqual(result, ["Dairy & Eggs", "Other", "Beverages"])

    def test_short_list_padded_with_other(self):
        # LLM returned only 1 category for 3 items
        result = self.ci._coerce_to_categories(["Produce"], _ITEMS, _CATS)
        self.assertEqual(result, ["Produce", "Other", "Other"])

    def test_empty_list_all_other(self):
        result = self.ci._coerce_to_categories([], _ITEMS, _CATS)
        self.assertEqual(result, ["Other", "Other", "Other"])

    def test_non_list_returns_none(self):
        self.assertIsNone(self.ci._coerce_to_categories("Produce", _ITEMS, _CATS))
        self.assertIsNone(self.ci._coerce_to_categories({"categories": []}, _ITEMS, _CATS))
        self.assertIsNone(self.ci._coerce_to_categories(None, _ITEMS, _CATS))

    def test_whitespace_stripped_before_lookup(self):
        # Entries with extra whitespace should still match cleanly.
        result = self.ci._coerce_to_categories(
            ["  Produce  ", "Dairy & Eggs", "Beverages"], _ITEMS, _CATS
        )
        # " Produce " → stripped to "Produce", which IS in _CATS
        self.assertEqual(result, ["Produce", "Dairy & Eggs", "Beverages"])

    def test_numeric_entries_become_other(self):
        result = self.ci._coerce_to_categories([42, "Produce", 3.14], _ITEMS, _CATS)
        # str(42) = "42", not in _CATS → "Other"
        self.assertEqual(result, ["Other", "Produce", "Other"])

    def test_empty_items_returns_empty(self):
        result = self.ci._coerce_to_categories([], [], _CATS)
        self.assertEqual(result, [])

    def test_long_list_truncated_to_item_count(self):
        # LLM returned more categories than items
        result = self.ci._coerce_to_categories(
            ["Produce", "Beverages", "Snacks & Candy", "Dairy & Eggs"],
            _ITEMS,  # 3 items
            _CATS,
        )
        self.assertEqual(result, ["Produce", "Beverages", "Snacks & Candy"])


# ---------------------------------------------------------------------------
# 2. _parse_response
# ---------------------------------------------------------------------------

class TestParseResponse(unittest.TestCase):
    """_parse_response extracts a category list from raw LLM text."""

    def setUp(self):
        self.ci = _import_ci()

    def _parse(self, response: str) -> list[str] | None:
        return self.ci._parse_response(response, _ITEMS, _CATS)

    def test_clean_json_array(self):
        response = json.dumps(["Dairy & Eggs", "Produce", "Beverages"])
        self.assertEqual(self._parse(response), ["Dairy & Eggs", "Produce", "Beverages"])

    def test_json_array_wrapped_in_markdown_fence(self):
        response = '```json\n["Produce", "Dairy & Eggs", "Beverages"]\n```'
        self.assertEqual(self._parse(response), ["Produce", "Dairy & Eggs", "Beverages"])

    def test_json_array_in_plain_code_fence(self):
        response = '```\n["Produce", "Beverages", "Snacks & Candy"]\n```'
        self.assertEqual(self._parse(response), ["Produce", "Beverages", "Snacks & Candy"])

    def test_array_embedded_in_prose(self):
        # Last resort: re.search for first JSON array in the text
        response = 'Here are the categories:\n["Produce", "Dairy & Eggs", "Beverages"]\nDone.'
        result = self._parse(response)
        self.assertIsNotNone(result)
        self.assertEqual(result, ["Produce", "Dairy & Eggs", "Beverages"])

    def test_completely_unparseable_returns_none(self):
        self.assertIsNone(self._parse("Sorry, I cannot categorize these items."))

    def test_empty_string_returns_none(self):
        self.assertIsNone(self._parse(""))

    def test_unknown_categories_in_response_replaced_with_other(self):
        response = json.dumps(["Dairy & Eggs", "Junk Food", "Beverages"])
        result = self._parse(response)
        self.assertEqual(result, ["Dairy & Eggs", "Other", "Beverages"])

    def test_short_array_padded(self):
        response = json.dumps(["Produce"])
        result = self._parse(response)
        self.assertEqual(result, ["Produce", "Other", "Other"])


# ---------------------------------------------------------------------------
# 3. _categorize_with_llm platform routing
# ---------------------------------------------------------------------------

class TestCategorizePlatformRouting(unittest.TestCase):
    """_categorize_with_llm selects the right backend per platform."""

    def setUp(self):
        self.ci = _import_ci()
        # Ensure _HAS_SCAN_RECEIPT appears True for routing tests
        self.ci._HAS_SCAN_RECEIPT = True
        self._good_response = json.dumps(["Dairy & Eggs", "Produce", "Beverages"])

    def _patch_platform(self, apple=False, windows=False, linux=False):
        return [
            patch.object(self.ci, "_is_apple_silicon", return_value=apple),
            patch.object(self.ci, "_is_windows",       return_value=windows),
            patch.object(self.ci, "_is_linux",         return_value=linux),
        ]

    def _start(self, patches):
        for p in patches:
            p.start()
        return patches

    def _stop(self, patches):
        for p in patches:
            p.stop()

    # ── Apple Silicon ──────────────────────────────────────────────────────

    def test_apple_silicon_uses_mlx(self):
        patches = self._start(self._patch_platform(apple=True))
        try:
            with patch.object(self.ci, "_call_mlx",    return_value=self._good_response) as mock_mlx, \
                 patch.object(self.ci, "_call_ollama") as mock_ollama, \
                 patch.object(self.ci, "_call_llama_cpp") as mock_llama:
                result = self.ci._categorize_with_llm(_ITEMS, _CATS)
            mock_ollama.assert_not_called()
            mock_llama.assert_not_called()
            mock_mlx.assert_called_once()
            _, kwargs = mock_mlx.call_args
            self.assertEqual(kwargs.get("system_prompt"), self.ci._SYSTEM_PROMPT)
            self.assertEqual(result, ["Dairy & Eggs", "Produce", "Beverages"])
        finally:
            self._stop(patches)

    def test_apple_silicon_falls_back_to_ollama_when_mlx_unavailable(self):
        patches = self._start(self._patch_platform(apple=True))
        try:
            with patch.object(self.ci, "_call_mlx",    return_value=None), \
                 patch.object(self.ci, "_call_ollama", return_value=self._good_response) as mock_ollama:
                result = self.ci._categorize_with_llm(_ITEMS, _CATS)
            mock_ollama.assert_called_once()
            self.assertIsNotNone(result)
        finally:
            self._stop(patches)

    def test_apple_silicon_returns_none_when_all_backends_fail(self):
        patches = self._start(self._patch_platform(apple=True))
        try:
            with patch.object(self.ci, "_call_mlx",    return_value=None), \
                 patch.object(self.ci, "_call_ollama", return_value=None):
                result = self.ci._categorize_with_llm(_ITEMS, _CATS)
            self.assertIsNone(result)
        finally:
            self._stop(patches)

    # ── Windows ────────────────────────────────────────────────────────────

    def test_windows_uses_llama_cpp(self):
        patches = self._start(self._patch_platform(windows=True))
        try:
            with patch.object(self.ci, "_call_llama_cpp", return_value=self._good_response) as mock_llama, \
                 patch.object(self.ci, "_call_ollama")    as mock_ollama, \
                 patch.object(self.ci, "_call_mlx")       as mock_mlx:
                result = self.ci._categorize_with_llm(_ITEMS, _CATS)
            mock_mlx.assert_not_called()
            mock_ollama.assert_not_called()
            mock_llama.assert_called_once()
            _, kwargs = mock_llama.call_args
            self.assertEqual(kwargs.get("system_prompt"), self.ci._SYSTEM_PROMPT)
            self.assertIsNotNone(result)
        finally:
            self._stop(patches)

    def test_windows_falls_back_to_ollama(self):
        patches = self._start(self._patch_platform(windows=True))
        try:
            with patch.object(self.ci, "_call_llama_cpp", return_value=None), \
                 patch.object(self.ci, "_call_ollama",    return_value=self._good_response) as mock_ollama:
                result = self.ci._categorize_with_llm(_ITEMS, _CATS)
            mock_ollama.assert_called_once()
            self.assertIsNotNone(result)
        finally:
            self._stop(patches)

    # ── Linux ──────────────────────────────────────────────────────────────

    def test_linux_uses_llama_cpp(self):
        patches = self._start(self._patch_platform(linux=True))
        try:
            with patch.object(self.ci, "_call_llama_cpp", return_value=self._good_response) as mock_llama, \
                 patch.object(self.ci, "_call_ollama")    as mock_ollama, \
                 patch.object(self.ci, "_call_mlx")       as mock_mlx:
                result = self.ci._categorize_with_llm(_ITEMS, _CATS)
            mock_mlx.assert_not_called()
            mock_ollama.assert_not_called()
            mock_llama.assert_called_once()
            _, kwargs = mock_llama.call_args
            self.assertEqual(kwargs.get("system_prompt"), self.ci._SYSTEM_PROMPT)
            self.assertIsNotNone(result)
        finally:
            self._stop(patches)

    # ── Intel macOS (fallback) ─────────────────────────────────────────────

    def test_intel_mac_uses_ollama_directly(self):
        patches = self._start(self._patch_platform())  # all False = Intel macOS
        try:
            with patch.object(self.ci, "_call_ollama",    return_value=self._good_response) as mock_ollama, \
                 patch.object(self.ci, "_call_mlx")       as mock_mlx, \
                 patch.object(self.ci, "_call_llama_cpp") as mock_llama:
                result = self.ci._categorize_with_llm(_ITEMS, _CATS)
            mock_mlx.assert_not_called()
            mock_llama.assert_not_called()
            mock_ollama.assert_called_once()
            self.assertIsNotNone(result)
        finally:
            self._stop(patches)

    # ── scan_receipt unavailable ───────────────────────────────────────────

    def test_returns_none_when_scan_receipt_not_importable(self):
        original = self.ci._HAS_SCAN_RECEIPT
        try:
            self.ci._HAS_SCAN_RECEIPT = False
            result = self.ci._categorize_with_llm(_ITEMS, _CATS)
            self.assertIsNone(result)
        finally:
            self.ci._HAS_SCAN_RECEIPT = original


# ---------------------------------------------------------------------------
# 4. main() entry point
# ---------------------------------------------------------------------------

class TestMain(unittest.TestCase):
    """main() parses argv, calls _categorize_with_llm, and prints JSON."""

    def setUp(self):
        self.ci = _import_ci()

    def _run_main(self, argv_tail: list[str]) -> tuple[str, int]:
        """
        Invoke main() with sys.argv = ['categorize_items.py', *argv_tail].
        Returns (stdout_str, exit_code).  Exit code 0 means SystemExit was
        NOT raised; non-zero means SystemExit(code) was raised.
        """
        buf = StringIO()
        exit_code = 0
        with patch.object(sys, "argv", ["categorize_items.py"] + argv_tail), \
             patch("sys.stdout", buf):
            try:
                self.ci.main()
            except SystemExit as exc:
                exit_code = exc.code if exc.code is not None else 0
        return buf.getvalue(), exit_code

    def test_no_args_exits_with_error(self):
        _, code = self._run_main([])
        self.assertNotEqual(code, 0)

    def test_invalid_json_arg_exits_with_error(self):
        _, code = self._run_main(["not valid json"])
        self.assertNotEqual(code, 0)

    def test_empty_items_list_returns_empty_categories(self):
        payload = json.dumps({"items": [], "categories": _CATS})
        output, code = self._run_main([payload])
        self.assertEqual(code, 0)
        data = json.loads(output)
        self.assertEqual(data["categories"], [])

    def test_llm_unavailable_returns_all_other(self):
        # Patch _categorize_with_llm to return None (LLM offline).
        payload = json.dumps({"items": _ITEMS, "categories": _CATS})
        with patch.object(self.ci, "_categorize_with_llm", return_value=None):
            output, code = self._run_main([payload])
        self.assertEqual(code, 0)
        data = json.loads(output)
        self.assertEqual(len(data["categories"]), len(_ITEMS))
        self.assertTrue(all(c == "Other" for c in data["categories"]))

    def test_successful_categorization(self):
        expected = ["Dairy & Eggs", "Produce", "Beverages"]
        payload = json.dumps({"items": _ITEMS, "categories": _CATS})
        with patch.object(self.ci, "_categorize_with_llm", return_value=expected):
            output, code = self._run_main([payload])
        self.assertEqual(code, 0)
        data = json.loads(output)
        self.assertEqual(data["categories"], expected)

    def test_missing_items_key_treated_as_empty(self):
        # payload without "items" key → items defaults to [] → returns empty list
        payload = json.dumps({"categories": _CATS})
        output, code = self._run_main([payload])
        self.assertEqual(code, 0)
        data = json.loads(output)
        self.assertEqual(data["categories"], [])

    def test_items_values_coerced_to_strings(self):
        # Non-string values in "items" should be coerced to str.
        payload = json.dumps({"items": [123, None, True], "categories": _CATS})
        assigned = ["Other", "Other", "Other"]
        with patch.object(self.ci, "_categorize_with_llm", return_value=assigned):
            output, code = self._run_main([payload])
        self.assertEqual(code, 0)
        data = json.loads(output)
        self.assertEqual(len(data["categories"]), 3)


if __name__ == "__main__":
    unittest.main()
