from __future__ import annotations

import unittest

from ec.infrastructure.duckdb.models import extract_project_name


class TestProjectName(unittest.TestCase):
    def test_cursor_title(self) -> None:
        self.assertEqual(
            extract_project_name("Cursor", "main.py — echo"),
            "echo",
        )

    def test_repo_takes_priority(self) -> None:
        self.assertEqual(
            extract_project_name("Cursor", "main.py — echo", repo="/Users/me/Echo"),
            "Echo",
        )

    def test_non_coding_app(self) -> None:
        self.assertEqual(extract_project_name("Slack", "general — acme"), "")


if __name__ == "__main__":
    unittest.main()
