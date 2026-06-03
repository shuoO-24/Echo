import unittest
from datetime import datetime

from ec.layers.remember.grouping import (
    NO_PROJECT,
    group_sessions,
    project_label,
)


class TestGrouping(unittest.TestCase):
    def test_project_label_from_title(self) -> None:
        self.assertEqual(project_label("Cursor", "main.py — echo"), "echo")

    def test_project_label_no_project(self) -> None:
        self.assertEqual(project_label("Slack", "general"), NO_PROJECT)

    def test_group_sessions_by_project_and_category(self) -> None:
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
            (
                datetime(2026, 6, 2, 11, 0),
                datetime(2026, 6, 2, 11, 15),
                "Slack",
                "Comms",
                "general",
                0,
                0,
                0,
                "",
                "",
            ),
        ]
        projects = group_sessions(rows)
        self.assertEqual(len(projects), 2)
        echo = next(p for p in projects if p["project"] == "echo")
        self.assertEqual(echo["categories"][0]["category"], "Coding")
        other = next(p for p in projects if p["project"] == NO_PROJECT)
        self.assertEqual(other["categories"][0]["category"], "Comms")


if __name__ == "__main__":
    unittest.main()
