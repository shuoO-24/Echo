from __future__ import annotations

from ec.layers.categorize import CategorizeLayer
from ec.layers.monitor import MonitorLayer
from ec.layers.remember import RememberLayer


class EchoApp:
    """Architecture-aligned entrypoint composed of monitor/remember/categorize layers."""

    def __init__(self) -> None:
        self.monitor = MonitorLayer()
        self.remember = RememberLayer()
        self.categorize = CategorizeLayer()
