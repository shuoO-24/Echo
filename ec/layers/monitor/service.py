from __future__ import annotations

from dataclasses import dataclass, field

from ec.infrastructure.duckdb.collector import insert_events
from ec.input_monitor import InputMonitor
from ec.sensors.macos import CaptureResult, capture_foreground_once


@dataclass
class MonitorSnapshot:
    capture: CaptureResult
    kb_count: int = 0
    mouse_count: int = 0
    typed_text: str = ""


@dataclass
class MonitorLayer:
    """Sensors + collector boundary from architecture design."""

    _last_context: tuple[str, str] | None = field(default=None, init=False)

    def capture_once(self) -> CaptureResult:
        result = capture_foreground_once()
        insert_events([result.event])
        return result

    def capture_once_with_input(self, monitor: InputMonitor) -> MonitorSnapshot:
        capture = capture_foreground_once()
        context = (capture.event.app, capture.event.window_title)
        if self._last_context != context:
            monitor.reset_context()
            self._last_context = context

        input_snapshot = monitor.snapshot_and_reset()
        capture.event.kb_count = input_snapshot.kb_count
        capture.event.mouse_count = input_snapshot.mouse_count
        capture.event.typed_text = input_snapshot.typed_text
        insert_events([capture.event])
        return MonitorSnapshot(
            capture=capture,
            kb_count=input_snapshot.kb_count,
            mouse_count=input_snapshot.mouse_count,
            typed_text=input_snapshot.typed_text,
        )
