import unittest

from ec.desktop.app_icons import APP_ALIASES, resolve_application_path


class TestAppIcons(unittest.TestCase):
    def test_domain_for_app_guesses_slug(self) -> None:
        from ec.desktop.app_icons import _domain_for_app

        self.assertEqual(_domain_for_app("Cursor"), "cursor.com")
        self.assertEqual(_domain_for_app("SomeNewApp"), "somenewapp.com")

    def test_resolve_cursor_path_on_macos(self) -> None:
        import sys

        if sys.platform != "darwin":
            self.skipTest("macOS only")
        path = resolve_application_path("Cursor")
        if path is None:
            self.skipTest("Cursor.app not installed")
        self.assertTrue(path.endswith(".app"))


if __name__ == "__main__":
    unittest.main()
