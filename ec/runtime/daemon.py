from __future__ import annotations

import os
import signal
import time

from ec.config import SETTINGS
from ec.infrastructure.duckdb.connection import ensure_app_dir
from ec.input_monitor import InputMonitor
from ec.layers.monitor import MonitorLayer


def _pid_is_running(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def get_running_pid() -> int | None:
    if not SETTINGS.pid_path.exists():
        return None
    try:
        pid = int(SETTINGS.pid_path.read_text(encoding="utf-8").strip())
    except ValueError:
        SETTINGS.pid_path.unlink(missing_ok=True)
        return None
    if _pid_is_running(pid):
        return pid
    SETTINGS.pid_path.unlink(missing_ok=True)
    return None


def daemon_status() -> tuple[bool, int | None]:
    pid = get_running_pid()
    return pid is not None, pid


def run_foreground_loop(interval_seconds: int, capture_text: bool = False) -> None:
    ensure_app_dir()
    SETTINGS.pid_path.write_text(str(os.getpid()), encoding="utf-8")
    monitor = InputMonitor(capture_text=capture_text)
    monitor_layer = MonitorLayer()
    monitor.start()
    print(
        f"echo-daemon-started pid={os.getpid()} interval={interval_seconds}s "
        f"capture_text={capture_text}"
    )
    try:
        while True:
            snapshot = monitor_layer.capture_once_with_input(monitor)
            if snapshot.capture.warning:
                print(f"warning: {snapshot.capture.warning}")
            time.sleep(interval_seconds)
    finally:
        monitor.stop()
        SETTINGS.pid_path.unlink(missing_ok=True)


def stop_daemon() -> tuple[bool, str]:
    pid = get_running_pid()
    if pid is None:
        return False, "daemon is not running"
    try:
        os.kill(pid, signal.SIGTERM)
    except PermissionError:
        return (
            False,
            "permission denied while stopping daemon (try from same shell/user context)",
        )
    return True, f"daemon stop signal sent to pid={pid}"
