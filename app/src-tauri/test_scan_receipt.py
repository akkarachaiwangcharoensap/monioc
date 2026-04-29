"""
Unit tests for scan_receipt.py

Run with:
    python -m pytest src-tauri/test_scan_receipt.py -v
  or (stdlib only):
    python -m unittest src-tauri/test_scan_receipt.py -v

Coverage:
  - Platform detection helpers (_is_apple_silicon, _is_windows, _is_linux)
  - Backend routing in parse_rows_with_llm:
      macOS Apple Silicon  →  MLX first, then ollama
      Windows              →  llama-cpp-python first, then ollama
      Linux                →  llama-cpp-python first, then ollama
      macOS Intel          →  ollama directly (no MLX, no llama-cpp)
  - MLX generate() is called with `temperature=` NOT the old `temp=` kwarg
  - MLX is skipped gracefully on non-Apple-Silicon platforms
  - RECEIPT_LLM_DISABLE=1 short-circuits all LLM backends
  - Ollama fallback is used when the primary backend returns None
"""

from __future__ import annotations

import json
import sys
import types
import unittest
from unittest.mock import MagicMock, call, patch


# ---------------------------------------------------------------------------
# Helper: import scan_receipt without triggering heavy optional dependencies
# ---------------------------------------------------------------------------


def _import_scan_receipt():
    import importlib

    return importlib.import_module("scan_receipt")


# ---------------------------------------------------------------------------
# 1. Platform detection
# ---------------------------------------------------------------------------


class TestPlatformDetection(unittest.TestCase):
    """_is_apple_silicon / _is_windows / _is_linux behave correctly."""

    def _load(self):
        return _import_scan_receipt()

    def test_apple_silicon_true_on_arm64_darwin(self):
        sr = self._load()
        with patch.object(sr.sys, "platform", "darwin"), patch.object(
            sr.platform, "machine", return_value="arm64"
        ):
            self.assertTrue(sr._is_apple_silicon())

    def test_apple_silicon_false_on_intel_mac(self):
        sr = self._load()
        with patch.object(sr.sys, "platform", "darwin"), patch.object(
            sr.platform, "machine", return_value="x86_64"
        ):
            self.assertFalse(sr._is_apple_silicon())

    def test_apple_silicon_false_on_windows(self):
        sr = self._load()
        with patch.object(sr.sys, "platform", "win32"), patch.object(
            sr.platform, "machine", return_value="AMD64"
        ):
            self.assertFalse(sr._is_apple_silicon())

    def test_apple_silicon_false_on_linux(self):
        sr = self._load()
        with patch.object(sr.sys, "platform", "linux"), patch.object(
            sr.platform, "machine", return_value="x86_64"
        ):
            self.assertFalse(sr._is_apple_silicon())

    def test_is_macos_intel_true_on_x86_darwin(self):
        sr = self._load()
        with patch.object(sr.sys, "platform", "darwin"), patch.object(
            sr.platform, "machine", return_value="x86_64"
        ):
            self.assertTrue(sr._is_macos_intel())

    def test_is_windows_true(self):
        sr = self._load()
        with patch.object(sr.sys, "platform", "win32"):
            self.assertTrue(sr._is_windows())

    def test_is_windows_false_on_linux(self):
        sr = self._load()
        with patch.object(sr.sys, "platform", "linux"):
            self.assertFalse(sr._is_windows())

    def test_is_linux_true(self):
        sr = self._load()
        with patch.object(sr.sys, "platform", "linux"):
            self.assertTrue(sr._is_linux())

    def test_is_linux_false_on_darwin(self):
        sr = self._load()
        with patch.object(sr.sys, "platform", "darwin"):
            self.assertFalse(sr._is_linux())


# ---------------------------------------------------------------------------
# 2. Backend routing
# ---------------------------------------------------------------------------

_GOOD_MLX_RESPONSE = '[{"name": "Milk 2%", "price": 3.99}]'
_GOOD_LLAMA_RESPONSE = '[{"name": "Bread", "price": 2.49}]'
_GOOD_OLLAMA_RESPONSE = '[{"name": "Eggs", "price": 4.99}]'
_OCR_TEXT = "Milk 2%  $3.99\nTaxes  $0.40\nTOTAL  $4.39"


class TestBackendRoutingMacOSAppleSilicon(unittest.TestCase):
    """On Apple Silicon, MLX is tried first; ollama is the fallback."""

    def setUp(self):
        self.sr = _import_scan_receipt()
        # Simulate Apple Silicon
        self._patches = [
            patch.object(self.sr, "_is_apple_silicon", return_value=True),
            patch.object(self.sr, "_is_windows", return_value=False),
            patch.object(self.sr, "_is_linux", return_value=False),
        ]
        for p in self._patches:
            p.start()

    def tearDown(self):
        for p in self._patches:
            p.stop()

    def test_mlx_is_used_when_available(self):
        with patch.object(
            self.sr, "_call_mlx", return_value=_GOOD_MLX_RESPONSE
        ), patch.object(self.sr, "_call_ollama") as mock_ollama:
            rows = self.sr.parse_rows_with_llm(_OCR_TEXT)
        mock_ollama.assert_not_called()
        self.assertIsNotNone(rows)
        self.assertEqual(rows[0]["name"], "Milk 2%")

    def test_ollama_fallback_when_mlx_returns_none(self):
        with patch.object(self.sr, "_call_mlx", return_value=None), patch.object(
            self.sr, "_call_ollama", return_value=_GOOD_OLLAMA_RESPONSE
        ) as mock_ollama:
            rows = self.sr.parse_rows_with_llm(_OCR_TEXT)
        mock_ollama.assert_called_once()
        self.assertIsNotNone(rows)
        self.assertEqual(rows[0]["name"], "Eggs")

    def test_llama_cpp_is_never_called_on_apple_silicon(self):
        with patch.object(
            self.sr, "_call_mlx", return_value=_GOOD_MLX_RESPONSE
        ), patch.object(self.sr, "_call_llama_cpp") as mock_llama, patch.object(
            self.sr, "_call_ollama"
        ):
            self.sr.parse_rows_with_llm(_OCR_TEXT)
        mock_llama.assert_not_called()

    def test_none_returned_when_all_backends_fail(self):
        with patch.object(self.sr, "_call_mlx", return_value=None), patch.object(
            self.sr, "_call_ollama", return_value=None
        ):
            result = self.sr.parse_rows_with_llm(_OCR_TEXT)
        self.assertIsNone(result)


class TestBackendRoutingWindows(unittest.TestCase):
    """On Windows, llama-cpp-python is tried first; ollama is the fallback."""

    def setUp(self):
        self.sr = _import_scan_receipt()
        self._patches = [
            patch.object(self.sr, "_is_apple_silicon", return_value=False),
            patch.object(self.sr, "_is_windows", return_value=True),
            patch.object(self.sr, "_is_linux", return_value=False),
        ]
        for p in self._patches:
            p.start()

    def tearDown(self):
        for p in self._patches:
            p.stop()

    def test_llama_cpp_is_used_on_windows(self):
        with patch.object(
            self.sr, "_call_llama_cpp", return_value=_GOOD_LLAMA_RESPONSE
        ), patch.object(self.sr, "_call_ollama") as mock_ollama, patch.object(
            self.sr, "_call_mlx"
        ) as mock_mlx:
            rows = self.sr.parse_rows_with_llm(_OCR_TEXT)
        mock_mlx.assert_not_called()
        mock_ollama.assert_not_called()
        self.assertIsNotNone(rows)
        self.assertEqual(rows[0]["name"], "Bread")

    def test_ollama_fallback_when_llama_cpp_returns_none(self):
        with patch.object(self.sr, "_call_llama_cpp", return_value=None), patch.object(
            self.sr, "_call_ollama", return_value=_GOOD_OLLAMA_RESPONSE
        ) as mock_ollama:
            rows = self.sr.parse_rows_with_llm(_OCR_TEXT)
        mock_ollama.assert_called_once()
        self.assertIsNotNone(rows)

    def test_mlx_is_never_called_on_windows(self):
        with patch.object(
            self.sr, "_call_llama_cpp", return_value=_GOOD_LLAMA_RESPONSE
        ), patch.object(self.sr, "_call_ollama"), patch.object(
            self.sr, "_call_mlx"
        ) as mock_mlx:
            self.sr.parse_rows_with_llm(_OCR_TEXT)
        mock_mlx.assert_not_called()

    def test_none_returned_when_all_backends_fail_on_windows(self):
        with patch.object(self.sr, "_call_llama_cpp", return_value=None), patch.object(
            self.sr, "_call_ollama", return_value=None
        ):
            result = self.sr.parse_rows_with_llm(_OCR_TEXT)
        self.assertIsNone(result)


class TestBackendRoutingLinux(unittest.TestCase):
    """On Linux, llama-cpp-python is tried first; ollama is the fallback."""

    def setUp(self):
        self.sr = _import_scan_receipt()
        self._patches = [
            patch.object(self.sr, "_is_apple_silicon", return_value=False),
            patch.object(self.sr, "_is_windows", return_value=False),
            patch.object(self.sr, "_is_linux", return_value=True),
        ]
        for p in self._patches:
            p.start()

    def tearDown(self):
        for p in self._patches:
            p.stop()

    def test_llama_cpp_is_used_on_linux(self):
        with patch.object(
            self.sr, "_call_llama_cpp", return_value=_GOOD_LLAMA_RESPONSE
        ), patch.object(self.sr, "_call_ollama") as mock_ollama, patch.object(
            self.sr, "_call_mlx"
        ) as mock_mlx:
            rows = self.sr.parse_rows_with_llm(_OCR_TEXT)
        mock_mlx.assert_not_called()
        mock_ollama.assert_not_called()
        self.assertIsNotNone(rows)

    def test_ollama_fallback_when_llama_cpp_returns_none_on_linux(self):
        with patch.object(self.sr, "_call_llama_cpp", return_value=None), patch.object(
            self.sr, "_call_ollama", return_value=_GOOD_OLLAMA_RESPONSE
        ) as mock_ollama:
            rows = self.sr.parse_rows_with_llm(_OCR_TEXT)
        mock_ollama.assert_called_once()
        self.assertIsNotNone(rows)

    def test_mlx_is_never_called_on_linux(self):
        with patch.object(
            self.sr, "_call_llama_cpp", return_value=_GOOD_LLAMA_RESPONSE
        ), patch.object(self.sr, "_call_ollama"), patch.object(
            self.sr, "_call_mlx"
        ) as mock_mlx:
            self.sr.parse_rows_with_llm(_OCR_TEXT)
        mock_mlx.assert_not_called()


class TestBackendRoutingMacOSIntel(unittest.TestCase):
    """On macOS Intel, ollama is used directly — no MLX, no llama-cpp."""

    def setUp(self):
        self.sr = _import_scan_receipt()
        self._patches = [
            patch.object(self.sr, "_is_apple_silicon", return_value=False),
            patch.object(self.sr, "_is_windows", return_value=False),
            patch.object(self.sr, "_is_linux", return_value=False),
        ]
        for p in self._patches:
            p.start()

    def tearDown(self):
        for p in self._patches:
            p.stop()

    def test_ollama_is_used_directly_on_intel_mac(self):
        with patch.object(
            self.sr, "_call_ollama", return_value=_GOOD_OLLAMA_RESPONSE
        ) as mock_ollama, patch.object(self.sr, "_call_mlx") as mock_mlx, patch.object(
            self.sr, "_call_llama_cpp"
        ) as mock_llama:
            rows = self.sr.parse_rows_with_llm(_OCR_TEXT)
        mock_mlx.assert_not_called()
        mock_llama.assert_not_called()
        mock_ollama.assert_called_once()
        self.assertIsNotNone(rows)


class TestLLMDisable(unittest.TestCase):
    """RECEIPT_LLM_DISABLE=1 short-circuits all backends."""

    def test_returns_none_when_disabled(self):
        sr = _import_scan_receipt()
        with patch.dict("os.environ", {"RECEIPT_LLM_DISABLE": "1"}), patch.object(
            sr, "_call_mlx"
        ) as mock_mlx, patch.object(sr, "_call_llama_cpp") as mock_llama, patch.object(
            sr, "_call_ollama"
        ) as mock_ollama:
            result = sr.parse_rows_with_llm(_OCR_TEXT)
        self.assertIsNone(result)
        mock_mlx.assert_not_called()
        mock_llama.assert_not_called()
        mock_ollama.assert_not_called()

    def test_not_disabled_by_default(self):
        sr = _import_scan_receipt()
        env = {
            k: v
            for k, v in __import__("os").environ.items()
            if k != "RECEIPT_LLM_DISABLE"
        }
        with patch.dict("os.environ", env, clear=True), patch.object(
            sr, "_is_apple_silicon", return_value=True
        ), patch.object(sr, "_is_windows", return_value=False), patch.object(
            sr, "_is_linux", return_value=False
        ), patch.object(
            sr, "_call_mlx", return_value=_GOOD_MLX_RESPONSE
        ):
            result = sr.parse_rows_with_llm(_OCR_TEXT)
        self.assertIsNotNone(result)


# ---------------------------------------------------------------------------
# 3. _call_mlx: generate() kwarg correctness
# ---------------------------------------------------------------------------


def _make_fake_mlx_lm(
    generate_return: str, has_make_sampler: bool = True
) -> types.ModuleType:
    """Return a lightweight fake mlx_lm module with controllable generate.

    When `has_make_sampler=True` (mlx-lm ≥ 0.19 / 0.30 behaviour), a
    ``mlx_lm.sample_utils`` sub-module with ``make_sampler`` is also injected.
    When `has_make_sampler=False` (older mlx-lm), no sample_utils module exists,
    so the code falls back to passing ``temperature=`` directly.
    """
    fake_tokenizer = MagicMock()
    fake_tokenizer.chat_template = None  # triggers the plain-text path

    fake_model = MagicMock()

    mock_generate = MagicMock(return_value=generate_return)
    mock_load = MagicMock(return_value=(fake_model, fake_tokenizer))

    mod = types.ModuleType("mlx_lm")
    mod.load = mock_load
    mod.generate = mock_generate
    return mod


def _make_fake_sample_utils(sampler_return: object = None) -> tuple:
    """Return (fake sample_utils module, mock make_sampler, mock sampler)."""
    mock_sampler = MagicMock(name="sampler_callable")
    mock_make_sampler = MagicMock(return_value=mock_sampler)
    fake_su = types.ModuleType("mlx_lm.sample_utils")
    fake_su.make_sampler = mock_make_sampler
    return fake_su, mock_make_sampler, mock_sampler


class TestCallMLXSamplerKwarg(unittest.TestCase):
    """
    mlx-lm 0.30+: generate_step() no longer accepts temperature= / temp=
    directly.  Temperature must be passed as `sampler=make_sampler(temp=0.0)`.

    History of the breaking changes:
      mlx-lm < 0.12 : generate() accepted `temp=`
      mlx-lm 0.12–0.29 : generate() accepted `temperature=`
      mlx-lm ≥ 0.30 : generate_step() accepts neither; use `sampler=`

    Our code probes for make_sampler at import time and falls back to
    temperature= when sample_utils is unavailable (older installs).
    """

    def _run(self, fake_mlx_mod, extra_sys_modules: dict) -> tuple:
        sr = _import_scan_receipt()
        mods = {"mlx_lm": fake_mlx_mod, **extra_sys_modules}
        with patch.object(sr, "_is_apple_silicon", return_value=True), patch.dict(
            "sys.modules", mods
        ):
            result = sr._call_mlx("Milk 2%  $3.99")
        return result, fake_mlx_mod.generate

    # ── Modern path (mlx-lm ≥ 0.30 with make_sampler) ────────────────────────

    def test_sampler_kwarg_passed_when_make_sampler_available(self):
        """sampler= is forwarded to generate() when make_sampler can be imported."""
        fake_mlx = _make_fake_mlx_lm(_GOOD_MLX_RESPONSE)
        fake_su, mock_make_sampler, mock_sampler = _make_fake_sample_utils()

        result, mock_gen = self._run(fake_mlx, {"mlx_lm.sample_utils": fake_su})

        self.assertIsNotNone(result)
        mock_gen.assert_called_once()
        _, kwargs = mock_gen.call_args
        self.assertIn(
            "sampler", kwargs, "generate() must receive sampler= on mlx-lm 0.30+"
        )
        self.assertIs(kwargs["sampler"], mock_sampler)

    def test_make_sampler_called_with_temp_zero(self):
        """make_sampler must be called with temp=0.0 for deterministic output."""
        fake_mlx = _make_fake_mlx_lm(_GOOD_MLX_RESPONSE)
        fake_su, mock_make_sampler, _ = _make_fake_sample_utils()

        self._run(fake_mlx, {"mlx_lm.sample_utils": fake_su})

        mock_make_sampler.assert_called_once()
        _, kw = mock_make_sampler.call_args
        self.assertEqual(
            kw.get("temp"), 0.0, "make_sampler must be called with temp=0.0"
        )

    def test_neither_temp_nor_temperature_kwarg_passed_on_modern_mlx(self):
        """The old direct-temperature kwargs must NOT reach generate() on 0.30+."""
        fake_mlx = _make_fake_mlx_lm(_GOOD_MLX_RESPONSE)
        fake_su, _, _ = _make_fake_sample_utils()

        _, mock_gen = self._run(fake_mlx, {"mlx_lm.sample_utils": fake_su})
        _, kwargs = mock_gen.call_args
        self.assertNotIn(
            "temperature", kwargs, "temperature= must not be passed when using sampler="
        )
        self.assertNotIn("temp", kwargs, "temp= must not be passed when using sampler=")

    # ── Legacy fallback path (mlx-lm < 0.19, no sample_utils) ───────────────

    def test_temperature_kwarg_used_when_make_sampler_unavailable(self):
        """Older mlx-lm without sample_utils: fall back to temperature=."""
        fake_mlx = _make_fake_mlx_lm(_GOOD_MLX_RESPONSE)

        result, mock_gen = self._run(fake_mlx, {"mlx_lm.sample_utils": None})

        self.assertIsNotNone(result)
        mock_gen.assert_called_once()
        _, kwargs = mock_gen.call_args
        self.assertIn(
            "temperature",
            kwargs,
            "generate() must fall back to temperature= on old mlx-lm",
        )
        self.assertEqual(kwargs["temperature"], 0.0)
        self.assertNotIn("sampler", kwargs)

    def test_old_temp_kwarg_never_used(self):
        """The original `temp=` kwarg that mlx-lm < 0.12 used must never appear."""
        fake_mlx = _make_fake_mlx_lm(_GOOD_MLX_RESPONSE)
        fake_su, _, _ = _make_fake_sample_utils()
        _, mock_gen = self._run(fake_mlx, {"mlx_lm.sample_utils": fake_su})
        _, kwargs = mock_gen.call_args
        self.assertNotIn("temp", kwargs)

    # ── Error / edge cases ───────────────────────────────────────────────────

    def test_returns_none_on_non_apple_silicon(self):
        sr = _import_scan_receipt()
        fake_mlx = _make_fake_mlx_lm(_GOOD_MLX_RESPONSE)
        with patch.object(sr, "_is_apple_silicon", return_value=False), patch.dict(
            "sys.modules", {"mlx_lm": fake_mlx}
        ):
            result = sr._call_mlx("some text")
        self.assertIsNone(result, "_call_mlx must return None on non-Apple-Silicon")
        fake_mlx.generate.assert_not_called()

    def test_returns_none_when_mlx_lm_not_installed(self):
        sr = _import_scan_receipt()
        with patch.object(sr, "_is_apple_silicon", return_value=True), patch.dict(
            "sys.modules", {"mlx_lm": None}
        ):
            result = sr._call_mlx("some text")
        self.assertIsNone(result)

    def test_returns_none_when_model_load_fails(self):
        sr = _import_scan_receipt()
        fake_mlx = types.ModuleType("mlx_lm")
        fake_mlx.load = MagicMock(side_effect=RuntimeError("disk full"))
        fake_mlx.generate = MagicMock()
        fake_su, _, _ = _make_fake_sample_utils()
        with patch.object(sr, "_is_apple_silicon", return_value=True), patch.dict(
            "sys.modules", {"mlx_lm": fake_mlx, "mlx_lm.sample_utils": fake_su}
        ):
            result = sr._call_mlx("some text")
        self.assertIsNone(result)
        fake_mlx.generate.assert_not_called()

    def test_returns_none_when_generate_raises(self):
        """Any exception from generate() is caught and None is returned."""
        sr = _import_scan_receipt()
        fake_mlx = _make_fake_mlx_lm(_GOOD_MLX_RESPONSE)
        fake_mlx.generate.side_effect = TypeError(
            "generate_step() got an unexpected keyword argument 'temperature'"
        )
        fake_su, _, _ = _make_fake_sample_utils()
        with patch.object(sr, "_is_apple_silicon", return_value=True), patch.dict(
            "sys.modules", {"mlx_lm": fake_mlx, "mlx_lm.sample_utils": fake_su}
        ):
            result = sr._call_mlx("some text")
        self.assertIsNone(result)


# ---------------------------------------------------------------------------
# 4. Chat-template vs plain-text prompt path
# ---------------------------------------------------------------------------


class TestMLXChatTemplatePath(unittest.TestCase):
    """_call_mlx uses the tokenizer chat template when available."""

    def test_uses_chat_template_when_present(self):
        sr = _import_scan_receipt()

        fake_tokenizer = MagicMock()
        fake_tokenizer.chat_template = "<some template>"
        fake_tokenizer.apply_chat_template = MagicMock(return_value="<formatted>")

        fake_mod = types.ModuleType("mlx_lm")
        fake_mod.load = MagicMock(return_value=(MagicMock(), fake_tokenizer))
        fake_mod.generate = MagicMock(return_value=_GOOD_MLX_RESPONSE)
        fake_su, _, _ = _make_fake_sample_utils()

        with patch.object(sr, "_is_apple_silicon", return_value=True), patch.dict(
            "sys.modules", {"mlx_lm": fake_mod, "mlx_lm.sample_utils": fake_su}
        ):
            sr._call_mlx("some text")

        fake_tokenizer.apply_chat_template.assert_called_once()
        # The formatted string should reach generate()
        args, kwargs = fake_mod.generate.call_args
        self.assertIn("prompt", kwargs)
        self.assertEqual(kwargs["prompt"], "<formatted>")

    def test_falls_back_to_plain_text_when_no_template(self):
        sr = _import_scan_receipt()

        fake_tokenizer = MagicMock()
        fake_tokenizer.chat_template = None

        fake_mod = types.ModuleType("mlx_lm")
        fake_mod.load = MagicMock(return_value=(MagicMock(), fake_tokenizer))
        fake_mod.generate = MagicMock(return_value=_GOOD_MLX_RESPONSE)
        fake_su, _, _ = _make_fake_sample_utils()

        with patch.object(sr, "_is_apple_silicon", return_value=True), patch.dict(
            "sys.modules", {"mlx_lm": fake_mod, "mlx_lm.sample_utils": fake_su}
        ):
            sr._call_mlx("some text")

        _, kwargs = fake_mod.generate.call_args
        self.assertIn("prompt", kwargs)
        # Plain-text path includes both the system prompt and user content
        self.assertIn("some text", kwargs["prompt"])


# ---------------------------------------------------------------------------
# 5. Response parsing sanity checks
# ---------------------------------------------------------------------------


class TestParseLLMResponse(unittest.TestCase):
    """_parse_llm_response handles common LLM output formats."""

    def setUp(self):
        self.sr = _import_scan_receipt()

    def test_clean_json_array(self):
        rows = self.sr._parse_llm_response('[{"name":"Milk","price":3.99}]')
        self.assertIsNotNone(rows)
        self.assertEqual(rows[0]["name"], "Milk")
        self.assertAlmostEqual(rows[0]["price"], 3.99)

    def test_markdown_fenced_json(self):
        resp = '```json\n[{"name":"Eggs","price":4.99}]\n```'
        rows = self.sr._parse_llm_response(resp)
        self.assertIsNotNone(rows)
        self.assertEqual(rows[0]["name"], "Eggs")

    def test_json_buried_in_prose(self):
        resp = 'Here are the items:\n[{"name":"Bread","price":2.49}]\nHope that helps!'
        rows = self.sr._parse_llm_response(resp)
        self.assertIsNotNone(rows)
        self.assertEqual(rows[0]["name"], "Bread")

    def test_empty_response_returns_none(self):
        self.assertIsNone(self.sr._parse_llm_response(""))
        self.assertIsNone(self.sr._parse_llm_response("   "))

    def test_non_json_response_returns_none(self):
        self.assertIsNone(self.sr._parse_llm_response("I cannot parse this receipt."))


# ---------------------------------------------------------------------------
# 6. Ollama auto-install & model-pull helpers
# ---------------------------------------------------------------------------


class TestEnsureOllamaInstalled(unittest.TestCase):
    """_ensure_ollama_installed locates / downloads the ollama binary."""

    def _load(self):
        return _import_scan_receipt()

    def test_returns_existing_binary_when_on_path(self):
        """If ollama is already on PATH, return it without downloading."""
        sr = self._load()
        with patch.object(sr.shutil, "which", return_value="/usr/local/bin/ollama"):
            result = sr._ensure_ollama_installed()
        self.assertEqual(result, "/usr/local/bin/ollama")

    def test_returns_none_on_windows_when_missing(self):
        """On Windows we only print guidance; no auto-install is attempted."""
        sr = self._load()
        with patch.object(sr.shutil, "which", return_value=None), patch.object(
            sr.sys, "platform", "win32"
        ), patch("os.path.isfile", return_value=False):
            result = sr._ensure_ollama_installed()
        self.assertIsNone(result)

    def test_attempts_macos_install_when_missing(self):
        """On macOS, _install_ollama_macos() is attempted when binary not found."""
        sr = self._load()
        with patch.object(sr.shutil, "which", return_value=None), patch.object(
            sr.sys, "platform", "darwin"
        ), patch("os.path.isfile", return_value=False), patch.object(
            sr, "_install_ollama_macos", return_value="/tmp/ollama"
        ) as mock_install:
            result = sr._ensure_ollama_installed()
        mock_install.assert_called_once()
        self.assertEqual(result, "/tmp/ollama")

    def test_attempts_linux_install_when_missing(self):
        """On Linux, _install_ollama_linux() is attempted when binary not found."""
        sr = self._load()
        with patch.object(sr.shutil, "which", return_value=None), patch.object(
            sr.sys, "platform", "linux"
        ), patch("os.path.isfile", return_value=False), patch.object(
            sr, "_install_ollama_linux", return_value="/usr/bin/ollama"
        ) as mock_install:
            result = sr._ensure_ollama_installed()
        mock_install.assert_called_once()
        self.assertEqual(result, "/usr/bin/ollama")


class TestPullOllamaModel(unittest.TestCase):
    """_pull_ollama_model streams progress and returns True on success."""

    def _load(self):
        return _import_scan_receipt()

    def _make_fake_pull_response(self, events: list[dict]) -> object:
        """Build a fake HTTPResponse that streams newline-delimited JSON events."""
        body = b"\n".join(json.dumps(e).encode() for e in events) + b"\n"

        class FakeResp:
            status = 200

            def __init__(self, data: bytes):
                self._data = data
                self._pos = 0

            def read(self, n: int = -1) -> bytes:
                if n == -1:
                    chunk = self._data[self._pos :]
                    self._pos = len(self._data)
                    return chunk
                chunk = self._data[self._pos : self._pos + n]
                self._pos += len(chunk)
                return chunk

            def close(self) -> None:
                pass

        return FakeResp(body)

    def test_returns_true_on_success(self):
        sr = self._load()
        events = [
            {"status": "pulling manifest"},
            {"status": "downloading", "total": 1_073_741_824, "completed": 536_870_912},
            {
                "status": "downloading",
                "total": 1_073_741_824,
                "completed": 1_073_741_824,
            },
            {"status": "success"},
        ]
        fake_resp = self._make_fake_pull_response(events)
        fake_conn = MagicMock()
        fake_conn.getresponse.return_value = fake_resp

        with patch.object(sr.http.client, "HTTPConnection", return_value=fake_conn):
            result = sr._pull_ollama_model("ministral-3:8b")
        self.assertTrue(result)

    def test_returns_false_on_non_200(self):
        sr = self._load()
        fake_resp = MagicMock()
        fake_resp.status = 404
        fake_conn = MagicMock()
        fake_conn.getresponse.return_value = fake_resp

        with patch.object(sr.http.client, "HTTPConnection", return_value=fake_conn):
            result = sr._pull_ollama_model("ministral-3:8b")
        self.assertFalse(result)

    def test_returns_false_on_connection_error(self):
        sr = self._load()
        with patch.object(
            sr.http.client, "HTTPConnection", side_effect=OSError("refused")
        ):
            result = sr._pull_ollama_model("ministral-3:8b")
        self.assertFalse(result)


class TestEnsureOllamaModel(unittest.TestCase):
    """_ensure_ollama_model returns True if model present, else pulls it."""

    def _load(self):
        return _import_scan_receipt()

    def test_returns_true_when_model_already_present(self):
        sr = self._load()
        fake_resp = MagicMock()
        fake_resp.status = 200
        fake_resp.read.return_value = b"{}"
        fake_conn = MagicMock()
        fake_conn.getresponse.return_value = fake_resp

        with patch.object(sr.http.client, "HTTPConnection", return_value=fake_conn):
            result = sr._ensure_ollama_model("ministral-3:8b")
        self.assertTrue(result)

    def test_pulls_when_model_absent(self):
        sr = self._load()
        # /api/show returns 404 → not present → pull
        fake_resp_404 = MagicMock()
        fake_resp_404.status = 404
        fake_resp_404.read.return_value = b""
        fake_conn = MagicMock()
        fake_conn.getresponse.return_value = fake_resp_404

        with patch.object(
            sr.http.client, "HTTPConnection", return_value=fake_conn
        ), patch.object(sr, "_pull_ollama_model", return_value=True) as mock_pull:
            result = sr._ensure_ollama_model("ministral-3:8b")
        mock_pull.assert_called_once_with("ministral-3:8b")
        self.assertTrue(result)


class TestCallOllamaWithAutoInstall(unittest.TestCase):
    """_call_ollama auto-installs binary / pulls model before inference."""

    def _load(self):
        return _import_scan_receipt()

    def test_returns_none_when_binary_not_installable(self):
        sr = self._load()
        with patch.object(sr, "_ensure_ollama_installed", return_value=None):
            result = sr._call_ollama("some prompt")
        self.assertIsNone(result)

    def test_returns_none_when_server_fails_to_start(self):
        sr = self._load()
        with patch.object(
            sr, "_ensure_ollama_installed", return_value="/usr/bin/ollama"
        ), patch.object(sr, "_start_ollama_server", return_value=False):
            result = sr._call_ollama("some prompt")
        self.assertIsNone(result)

    def test_returns_none_when_model_unavailable(self):
        sr = self._load()
        with patch.object(
            sr, "_ensure_ollama_installed", return_value="/usr/bin/ollama"
        ), patch.object(sr, "_start_ollama_server", return_value=True), patch.object(
            sr, "_ensure_ollama_model", return_value=False
        ):
            result = sr._call_ollama("some prompt")
        self.assertIsNone(result)

    def test_inference_runs_after_successful_setup(self):
        sr = self._load()
        response_body = json.dumps(
            {"response": '[{"name":"Milk","price":3.99}]'}
        ).encode()
        fake_resp = MagicMock()
        fake_resp.status = 200
        fake_resp.read.return_value = response_body
        fake_conn = MagicMock()
        fake_conn.getresponse.return_value = fake_resp

        with patch.object(
            sr, "_ensure_ollama_installed", return_value="/usr/bin/ollama"
        ), patch.object(sr, "_start_ollama_server", return_value=True), patch.object(
            sr, "_ensure_ollama_model", return_value=True
        ), patch.object(
            sr.http.client, "HTTPConnection", return_value=fake_conn
        ):
            result = sr._call_ollama("some prompt")
        self.assertIsNotNone(result)
        self.assertIn("Milk", result)


# ---------------------------------------------------------------------------
# 8. _filter_hallucinated_summary_rows
# ---------------------------------------------------------------------------


class TestFilterHallucinatedSummaryRows(unittest.TestCase):
    """Summary rows (TOTAL, SUBTOTAL, TAX, …) that are absent from OCR text are dropped."""

    def _load(self):
        return _import_scan_receipt()

    def test_keeps_total_when_present_in_ocr(self):
        sr = self._load()
        rows = [
            {"name": "Milk", "price": 3.99},
            {"name": "TOTAL", "price": 4.39},
        ]
        ocr = "Milk  $3.99\nTOTAL  $4.39"
        result = sr._filter_hallucinated_summary_rows(rows, ocr)
        names = [r["name"] for r in result]
        self.assertIn("TOTAL", names)
        self.assertIn("Milk", names)

    def test_drops_total_when_absent_from_ocr(self):
        sr = self._load()
        rows = [
            {"name": "Milk", "price": 3.99},
            {"name": "TOTAL", "price": 3.99},  # hallucinated
        ]
        ocr = "Milk  $3.99"  # no TOTAL in image
        result = sr._filter_hallucinated_summary_rows(rows, ocr)
        names = [r["name"] for r in result]
        self.assertNotIn("TOTAL", names)
        self.assertIn("Milk", names)

    def test_drops_subtotal_hallucination(self):
        sr = self._load()
        rows = [
            {"name": "Bread", "price": 2.49},
            {"name": "SUBTOTAL", "price": 2.49},
        ]
        ocr = "Bread  $2.49"
        result = sr._filter_hallucinated_summary_rows(rows, ocr)
        names = [r["name"] for r in result]
        self.assertNotIn("SUBTOTAL", names)

    def test_drops_tax_hallucination(self):
        sr = self._load()
        rows = [
            {"name": "Eggs", "price": 4.99},
            {"name": "TAX", "price": 0.40},
        ]
        ocr = "Eggs  $4.99"
        result = sr._filter_hallucinated_summary_rows(rows, ocr)
        names = [r["name"] for r in result]
        self.assertNotIn("TAX", names)

    def test_drops_multiple_summary_hallucinations(self):
        sr = self._load()
        rows = [
            {"name": "Butter", "price": 5.49},
            {"name": "SUBTOTAL", "price": 5.49},
            {"name": "TAX", "price": 0.44},
            {"name": "TOTAL", "price": 5.93},
        ]
        ocr = "Butter  $5.49"
        result = sr._filter_hallucinated_summary_rows(rows, ocr)
        names = [r["name"] for r in result]
        self.assertEqual(names, ["Butter"])

    def test_preserves_product_containing_tax_keyword(self):
        """A row like 'Tax Free Organic Milk' must NOT be filtered."""
        sr = self._load()
        rows = [
            {"name": "Tax Free Organic Milk", "price": 4.29},
        ]
        ocr = "Tax Free Organic Milk  $4.29"
        result = sr._filter_hallucinated_summary_rows(rows, ocr)
        # The name contains 'Tax' but is not purely 'TAX', so it must survive
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["name"], "Tax Free Organic Milk")

    def test_case_insensitive_keyword_matching(self):
        sr = self._load()
        rows = [
            {"name": "Cheese", "price": 6.99},
            {"name": "Subtotal", "price": 6.99},
        ]
        ocr = "Cheese  $6.99"
        result = sr._filter_hallucinated_summary_rows(rows, ocr)
        names = [r["name"] for r in result]
        self.assertNotIn("Subtotal", names)

    def test_sub_total_with_space_dropped_when_absent(self):
        sr = self._load()
        rows = [
            {"name": "Yogurt", "price": 1.99},
            {"name": "Sub Total", "price": 1.99},
        ]
        ocr = "Yogurt  $1.99"
        result = sr._filter_hallucinated_summary_rows(rows, ocr)
        names = [r["name"] for r in result]
        self.assertNotIn("Sub Total", names)

    def test_empty_row_list_returns_empty(self):
        sr = self._load()
        result = sr._filter_hallucinated_summary_rows([], "some ocr text")
        self.assertEqual(result, [])


# ---------------------------------------------------------------------------
# 9. _to_price
# ---------------------------------------------------------------------------


class TestToPrice(unittest.TestCase):
    """_to_price correctly parses various price string formats."""

    def setUp(self):
        self.sr = _import_scan_receipt()

    def test_plain_decimal(self):
        self.assertAlmostEqual(self.sr._to_price("3.99"), 3.99)

    def test_dollar_prefix(self):
        self.assertAlmostEqual(self.sr._to_price("$2.99"), 2.99)

    def test_dollar_with_space(self):
        self.assertAlmostEqual(self.sr._to_price("$ 4.50"), 4.50)

    def test_comma_thousands(self):
        self.assertAlmostEqual(self.sr._to_price("$1,234.56"), 1234.56)

    def test_parenthetical_negative(self):
        self.assertAlmostEqual(self.sr._to_price("(1.99)"), -1.99)

    def test_none_returns_none(self):
        self.assertIsNone(self.sr._to_price(None))

    def test_non_numeric_returns_none(self):
        self.assertIsNone(self.sr._to_price("ABC"))

    def test_empty_string_returns_none(self):
        self.assertIsNone(self.sr._to_price(""))

    def test_value_over_limit_returns_none(self):
        self.assertIsNone(self.sr._to_price("9999999.99"))


# ---------------------------------------------------------------------------
# 10. _int_env
# ---------------------------------------------------------------------------


class TestIntEnv(unittest.TestCase):
    """_int_env returns the correct integer for valid / invalid env values."""

    def setUp(self):
        self.sr = _import_scan_receipt()

    def test_valid_integer_in_env(self):
        with patch.dict("os.environ", {"_TEST_INT_ENV": "42"}):
            self.assertEqual(self.sr._int_env("_TEST_INT_ENV", 10), 42)

    def test_missing_variable_returns_default(self):
        env = {
            k: v for k, v in __import__("os").environ.items() if k != "_TEST_INT_ENV"
        }
        with patch.dict("os.environ", env, clear=True):
            self.assertEqual(self.sr._int_env("_TEST_INT_ENV", 10), 10)

    def test_non_integer_string_returns_default(self):
        with patch.dict("os.environ", {"_TEST_INT_ENV": "not-a-number"}):
            self.assertEqual(self.sr._int_env("_TEST_INT_ENV", 5), 5)

    def test_zero_returns_default(self):
        with patch.dict("os.environ", {"_TEST_INT_ENV": "0"}):
            self.assertEqual(self.sr._int_env("_TEST_INT_ENV", 7), 7)

    def test_negative_returns_default(self):
        with patch.dict("os.environ", {"_TEST_INT_ENV": "-1"}):
            self.assertEqual(self.sr._int_env("_TEST_INT_ENV", 3), 3)

    def test_positive_integer_returned_directly(self):
        with patch.dict("os.environ", {"_TEST_INT_ENV": "1"}):
            self.assertEqual(self.sr._int_env("_TEST_INT_ENV", 99), 1)


# ---------------------------------------------------------------------------
# 11. _extract_total
# ---------------------------------------------------------------------------


class TestExtractTotal(unittest.TestCase):
    """_extract_total finds the receipt total in OCR text lines."""

    def setUp(self):
        self.sr = _import_scan_receipt()

    def test_finds_total_line(self):
        lines = ["Milk  $3.99", "Bread  $2.49", "TOTAL  $6.48"]
        self.assertAlmostEqual(self.sr._extract_total(lines), 6.48)

    def test_finds_grand_total(self):
        lines = ["Item  $1.00", "GRAND TOTAL  $1.05"]
        self.assertAlmostEqual(self.sr._extract_total(lines), 1.05)

    def test_finds_amount_due(self):
        lines = ["Item  $2.50", "AMOUNT DUE  $2.50"]
        self.assertAlmostEqual(self.sr._extract_total(lines), 2.50)

    def test_returns_last_total_when_multiple(self):
        """Searches from the end, so the last TOTAL keyword wins."""
        lines = ["TOTAL  $5.00", "BALANCE DUE  $5.50"]
        self.assertAlmostEqual(self.sr._extract_total(lines), 5.50)

    def test_returns_none_when_no_total_line(self):
        lines = ["Milk  $3.99", "Bread  $2.49"]
        self.assertIsNone(self.sr._extract_total(lines))

    def test_ignores_zero_total(self):
        lines = ["TOTAL  $0.00"]
        self.assertIsNone(self.sr._extract_total(lines))

    def test_empty_lines_returns_none(self):
        self.assertIsNone(self.sr._extract_total([]))


# ---------------------------------------------------------------------------
# 12. extract_rows (regex fallback)
# ---------------------------------------------------------------------------


class TestExtractRows(unittest.TestCase):
    """extract_rows parses OCR text into name/price dicts via regex heuristics."""

    def setUp(self):
        self.sr = _import_scan_receipt()

    def test_basic_extraction(self):
        text = "Milk 2%  $3.99\nBread  $2.49"
        rows = self.sr.extract_rows(text)
        self.assertEqual(len(rows), 2)
        self.assertAlmostEqual(rows[0]["price"], 3.99)

    def test_skips_lines_without_price(self):
        text = "Store Name\n123 Main St\nMilk  $3.99\nThank you!"
        rows = self.sr.extract_rows(text)
        self.assertEqual(len(rows), 1)
        self.assertAlmostEqual(rows[0]["price"], 3.99)

    def test_skips_divider_lines(self):
        text = "Item  $1.00\n---\nTOTAL  $1.00"
        rows = self.sr.extract_rows(text)
        # divider skipped; Item + TOTAL remain
        self.assertEqual(len(rows), 2)
        for row in rows:
            self.assertNotEqual(row["name"], "")

    def test_empty_text_returns_empty_list(self):
        self.assertEqual(self.sr.extract_rows(""), [])

    def test_price_stripped_from_name(self):
        text = "Cheddar Cheese  $5.99"
        rows = self.sr.extract_rows(text)
        self.assertEqual(len(rows), 1)
        self.assertNotIn("5.99", rows[0]["name"])


# ---------------------------------------------------------------------------
# OCR image sizing defaults
# ---------------------------------------------------------------------------


class TestOcrImageSizingDefaults(unittest.TestCase):
    """Verify the reduced OCR image sizing defaults for lower LLM RAM usage."""

    def _load(self):
        return _import_scan_receipt()

    def test_max_long_side_default(self):
        sr = self._load()
        self.assertEqual(sr._DEFAULT_MAX_LONG_SIDE, 1280)

    def test_max_pixels_default(self):
        sr = self._load()
        self.assertEqual(sr._DEFAULT_MAX_PIXELS, 1_000_000)


# ---------------------------------------------------------------------------
# TC-DEDUP-1  _dedupe_adjacent – consecutive OCR duplicate removal
# ---------------------------------------------------------------------------


class TestDedupeAdjacent(unittest.TestCase):
    """_dedupe_adjacent only strips consecutive identical lines (OCR artefacts).

    Regression tests for Bug-1: two receipt rows with the same name+price
    were silently dropped by _dedupe_preserve_order, so the LLM only saw one.
    """

    def _load(self):
        return _import_scan_receipt()

    def test_TC_DEDUP_1_removes_consecutive_duplicates(self):
        """Consecutive duplicate lines (OCR scanning artefacts) are removed."""
        sr = self._load()
        lines = ["Milk  $3.99", "Milk  $3.99", "Eggs  $2.49"]
        result = sr._dedupe_adjacent(lines)
        self.assertEqual(result, ["Milk  $3.99", "Eggs  $2.49"])

    def test_TC_DEDUP_2_preserves_non_adjacent_duplicates(self):
        """Two identical items that are not adjacent are BOTH preserved.

        This is the core regression: a receipt containing the same item twice
        (e.g. two boxes of Milk) must not lose the second entry.
        """
        sr = self._load()
        lines = ["Milk  $3.99", "Eggs  $2.49", "Milk  $3.99"]
        result = sr._dedupe_adjacent(lines)
        self.assertEqual(result, ["Milk  $3.99", "Eggs  $2.49", "Milk  $3.99"])

    def test_TC_DEDUP_3_empty_input(self):
        """Empty input returns an empty list."""
        sr = self._load()
        self.assertEqual(sr._dedupe_adjacent([]), [])

    def test_TC_DEDUP_4_no_duplicates_unchanged(self):
        """Input with no duplicates is returned as-is."""
        sr = self._load()
        lines = ["Apple  $1.00", "Banana  $0.75", "Carrot  $1.50"]
        self.assertEqual(sr._dedupe_adjacent(lines), lines)

    def test_TC_DEDUP_5_all_identical_lines_collapsed_to_one(self):
        """All-identical consecutive input collapses to a single line."""
        sr = self._load()
        lines = ["Total  $9.99"] * 4
        self.assertEqual(sr._dedupe_adjacent(lines), ["Total  $9.99"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
