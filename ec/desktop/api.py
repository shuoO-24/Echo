from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from datetime import date, datetime
from typing import Any

from ec.app import EchoApp
from ec.config import SETTINGS
from ec.desktop.day_payload import build_day_payload
from ec.desktop.ask import answer_prompt, ask_model, llm_available
from ec.desktop.timezone_display import display_today, format_hms
from ec.layers.remember.grouping import activity_category
from ec.layers.remember.log_format import collapse_raw_rows
from ec.runtime.daemon import daemon_status, stop_daemon

APP = EchoApp()


def _iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat(sep=" ", timespec="seconds")
    return str(value)


def _target_date(value: str | None) -> str:
    if value:
        return value
    return display_today()


def day_payload(target: str | None = None) -> dict[str, Any]:
    day = _target_date(target)
    session_rows = APP.remember.session_detail_rows(day)
    return build_day_payload(day, session_rows)


def activity_list_payload(
    *,
    target: str | None = None,
    after: str | None = None,
    limit: int = 48,
) -> list[dict[str, Any]]:
    day = _target_date(target)
    if after:
        after_ts = datetime.fromisoformat(after.replace("Z", ""))
        rows = APP.remember.raw_events_after(after_ts, limit=limit)
    else:
        rows = APP.remember.raw_events_for_date(day)
        if len(rows) > limit:
            rows = rows[-limit:]
        rows = list(reversed(rows))

    collapsed = collapse_raw_rows(rows)
    items: list[dict[str, Any]] = []
    for start_ts, end_ts, app, title, kb_count, mouse_count, _typed, _repeats in collapsed:
        title = (title or "")[:80]
        items.append(
            {
                "t": format_hms(start_ts),
                "app": app,
                "win": title,
                "cat": activity_category(app, title),
                "kb": int(kb_count),
                "ms": int(mouse_count),
                "_ts": start_ts.isoformat(sep=" ", timespec="seconds"),
            }
        )
    return list(reversed(items))


def collector_status_payload() -> dict[str, Any]:
    running, pid = daemon_status()
    return {"running": running, "pid": pid}


def collector_stop_payload() -> dict[str, Any]:
    _ok, message = stop_daemon()
    running, pid = daemon_status()
    return {"running": running, "pid": pid, "message": message}


def collector_start_payload() -> dict[str, Any]:
    running, pid = daemon_status()
    if running:
        return {"running": True, "pid": pid}
    subprocess.Popen(
        [
            sys.executable,
            "-m",
            "ec.main",
            "start",
            "--interval",
            str(SETTINGS.default_sample_interval_seconds),
            "--capture-text",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
        env=os.environ.copy(),
    )
    time.sleep(0.6)
    running, pid = daemon_status()
    return {"running": running, "pid": pid}


def status_payload() -> dict[str, Any]:
    running, pid = daemon_status()
    latest = APP.remember.latest_raw_ts()
    return {
        "daemon": {"running": running, "pid": pid},
        "db_path": str(SETTINGS.db_path),
        "latest_ts": _iso(latest),
    }


def today_payload(target: str | None = None) -> dict[str, Any]:
    """Legacy shape for older clients."""
    day = day_payload(target)
    event_count, kb_total, mouse_total = APP.remember.day_stats(day["date"])
    return {
        "date": day["date"],
        "events": event_count,
        "kb_total": kb_total,
        "mouse_total": mouse_total,
        "categories": [{"category": c["name"], "minutes": c["mins"]} for c in day["categories"]],
        "projects": [],
    }


def timeline_payload(target: str | None = None) -> dict[str, Any]:
    day = day_payload(target)
    return {"date": day["date"], "projects": day["projects"]}


def activity_payload(
    *,
    target: str | None = None,
    after: str | None = None,
    limit: int = 48,
) -> dict[str, Any]:
    items = activity_list_payload(target=target, after=after, limit=limit)
    cursor = items[0]["_ts"] if items else _iso(APP.remember.latest_raw_ts())
    for item in items:
        item.pop("_ts", None)
    return {"date": _target_date(target), "items": items, "cursor": cursor}


def rebuild_sessions() -> dict[str, Any]:
    count = APP.categorize.rebuild()
    return {"sessions": count}


def ask_payload(prompt: str, target: str | None = None) -> dict[str, Any]:
    day = day_payload(target)
    return answer_prompt(prompt, day)


def ask_status_payload() -> dict[str, Any]:
    available = llm_available()
    return {
        "llm_available": available,
        "model": ask_model() if available else None,
    }


def icon_png(app_name: str, size: int = 64) -> bytes | None:
    from ec.desktop.app_icons import get_icon_png

    return get_icon_png(app_name, size=size)


def json_response(data: Any) -> bytes:
    return json.dumps(data, ensure_ascii=False).encode("utf-8")
