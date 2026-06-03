import unittest
from datetime import datetime

from ec.desktop.day_payload import build_day_payload


class TestDayPayload(unittest.TestCase):
    def test_build_day_payload_shape(self) -> None:
        rows = [
            (
                datetime(2026, 6, 2, 10, 0),
                datetime(2026, 6, 2, 10, 30),
                "Cursor",
                "Coding",
                "main.py — echo",
                100,
                10,
                1,
                "",
                "",
            ),
        ]
        payload = build_day_payload("2026-06-02", rows)
        self.assertEqual(payload["date"], "2026-06-02")
        self.assertIn("categories", payload)
        self.assertIn("projects", payload)
        self.assertEqual(payload["sessions"][0]["cat"], "Coding")
        self.assertEqual(payload["sessions"][0]["project"], "echo")


if __name__ == "__main__":
    unittest.main()
