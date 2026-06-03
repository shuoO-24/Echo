from __future__ import annotations

import unittest

from ec.input_monitor import InputMonitor


class TestInputMonitor(unittest.TestCase):
    def test_delta_across_snapshots(self) -> None:
        monitor = InputMonitor(capture_text=True)
        monitor._append_char("h")
        monitor._append_char("i")
        first = monitor.snapshot_and_reset()
        self.assertEqual(first.typed_text, "hi")

        monitor._append_char(" ")
        monitor._append_char("t")
        monitor._append_char("h")
        monitor._append_char("e")
        monitor._append_char("r")
        monitor._append_char("e")
        second = monitor.snapshot_and_reset()
        self.assertEqual(second.typed_text, " there")

    def test_reset_context_clears_buffer(self) -> None:
        monitor = InputMonitor(capture_text=True)
        monitor._append_char("x")
        monitor.snapshot_and_reset()
        monitor.reset_context()
        monitor._append_char("y")
        snap = monitor.snapshot_and_reset()
        self.assertEqual(snap.typed_text, "y")


if __name__ == "__main__":
    unittest.main()
