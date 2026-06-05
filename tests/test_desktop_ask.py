import os
import unittest

from ec.desktop.ask import (
    ASK_MODEL,
    _chat_request_body,
    _is_kimi_model,
    _llm_api_key,
    answer_prompt,
    ask_model,
    llm_available,
)


class TestDesktopAsk(unittest.TestCase):
    def test_coding_question(self) -> None:
        day = {
            "date": "2026-06-03",
            "total": 120,
            "categories": [{"name": "Coding", "mins": 90, "pct": 0.75}],
            "sessions": [],
            "projects": [],
            "longestFocus": {"mins": 0, "title": "", "project": ""},
            "totals": {"sessions": 0, "kb": 0, "ms": 0},
        }
        out = answer_prompt("how much coding today?", day)
        self.assertIn("coding", out["answer"].lower())
        self.assertEqual(out["source"], "local")
        self.assertIsNone(out["model"])

    def test_empty_prompt(self) -> None:
        with self.assertRaises(ValueError):
            answer_prompt("  ", {"date": "2026-06-03", "total": 0, "categories": [], "sessions": []})

    def test_default_model_is_kimi(self) -> None:
        self.assertEqual(ASK_MODEL, "kimi-k2.6")
        self.assertTrue(_is_kimi_model("kimi-k2.6"))
        saved = os.environ.copy()
        try:
            os.environ.pop("ECHO_ASK_MODEL", None)
            os.environ.pop("ECHO_OPENAI_MODEL", None)
            self.assertEqual(ask_model(), "kimi-k2.6")
        finally:
            os.environ.clear()
            os.environ.update(saved)

    def test_kimi_request_disables_thinking(self) -> None:
        body = _chat_request_body("kimi-k2.6", "summarize", {"date": "2026-06-03", "total": 0})
        self.assertEqual(body["thinking"], {"type": "disabled"})
        self.assertNotIn("temperature", body)

    def test_openai_request_uses_temperature(self) -> None:
        body = _chat_request_body("gpt-4o-mini", "summarize", {"date": "2026-06-03", "total": 0})
        self.assertEqual(body["temperature"], 0.2)
        self.assertNotIn("thinking", body)

    def test_llm_key_prefers_moonshot_for_kimi(self) -> None:
        saved = os.environ.copy()
        try:
            os.environ["MOONSHOT_API_KEY"] = "ms"
            os.environ["OPENAI_API_KEY"] = "oa"
            self.assertEqual(_llm_api_key("kimi-k2.6"), "ms")
            self.assertTrue(llm_available())
        finally:
            os.environ.clear()
            os.environ.update(saved)

    def test_llm_key_uses_openai_for_gpt(self) -> None:
        saved = os.environ.copy()
        try:
            os.environ["OPENAI_API_KEY"] = "oa"
            self.assertEqual(_llm_api_key("gpt-4o-mini"), "oa")
        finally:
            os.environ.clear()
            os.environ.update(saved)


if __name__ == "__main__":
    unittest.main()
