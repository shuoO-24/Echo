from __future__ import annotations

import unittest

from ec.layers.remember.log_format import collapse_raw_rows, reconstruct_typed_streams


class TestLogFormat(unittest.TestCase):
    def test_collapse_heartbeats(self) -> None:
        rows = [
            ("t1", "Cursor", "main.py", 0, 0, ""),
            ("t2", "Cursor", "main.py", 0, 0, ""),
            ("t3", "Cursor", "main.py", 3, 0, "hi"),
        ]
        collapsed = collapse_raw_rows(rows)
        self.assertEqual(len(collapsed), 1)
        self.assertEqual(collapsed[0][6], "hi")
        self.assertEqual(collapsed[0][7], 3)

    def test_reconstruct_typed_stream(self) -> None:
        rows = [
            ("t1", "Cursor", "main.py", 5, 0, "hel"),
            ("t2", "Cursor", "main.py", 2, 0, "lo "),
            ("t3", "Cursor", "main.py", 1, 0, "world"),
        ]
        streams = reconstruct_typed_streams(rows)
        self.assertEqual(len(streams), 1)
        self.assertEqual(streams[0]["text"], "hello world")


if __name__ == "__main__":
    unittest.main()
