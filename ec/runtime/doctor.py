from __future__ import annotations

from ec.infrastructure.duckdb.connection import connect, ensure_app_dir
from ec.sensors.macos import capture_foreground_once


def run_doctor() -> list[str]:
    output: list[str] = []

    app_dir = ensure_app_dir()
    output.append(f"[ok] app_dir={app_dir}")

    try:
        with connect() as conn:
            conn.execute("SELECT 1").fetchone()
        output.append("[ok] duckdb=ready")
    except Exception as exc:
        output.append(f"[error] duckdb={exc}")

    result = capture_foreground_once()
    if result.event.app == "unknown":
        if result.warning:
            output.append(f"[warn] sensor=unknown ({result.warning})")
        else:
            output.append("[warn] sensor=unknown (check Accessibility permissions)")
    else:
        output.append(f"[ok] sensor=app:{result.event.app} title:{result.event.window_title!r}")
    return output
