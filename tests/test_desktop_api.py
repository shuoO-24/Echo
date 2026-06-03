import unittest

from ec.desktop.api import json_response


class TestDesktopApi(unittest.TestCase):
    def test_json_response_roundtrip(self) -> None:
        payload = json_response({"ok": True})
        self.assertEqual(payload, b'{"ok": true}')


if __name__ == "__main__":
    unittest.main()
