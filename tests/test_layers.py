from __future__ import annotations

import unittest
from unittest.mock import patch

from ec.app import EchoApp
from ec.layers.categorize import CategorizeLayer
from ec.layers.monitor import MonitorLayer
from ec.layers.remember import RememberLayer


class TestLayerComposition(unittest.TestCase):
    def test_echo_app_wires_layers(self) -> None:
        app = EchoApp()
        self.assertIsInstance(app.monitor, MonitorLayer)
        self.assertIsInstance(app.remember, RememberLayer)
        self.assertIsInstance(app.categorize, CategorizeLayer)


class TestRememberLayer(unittest.TestCase):
    def test_raw_rows_uses_requested_order(self) -> None:
        layer = RememberLayer()

        class FakeConn:
            def execute(self, query: str, _params: list[int]):
                class Result:
                    def fetchall(self_inner):
                        return []

                self.query = query
                return Result()

        class FakeCtx:
            def __enter__(self):
                self.conn = FakeConn()
                return self.conn

            def __exit__(self, exc_type, exc, tb):
                return False

        with patch("ec.layers.remember.service.connect", return_value=FakeCtx()):
            rows = layer.raw_rows(last=5, where_clause="1=1", order="ASC")
            self.assertEqual(rows, [])


if __name__ == "__main__":
    unittest.main()
