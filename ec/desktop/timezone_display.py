from __future__ import annotations

import os
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

# Pacific Time (PST/PDT). Override with ECHO_DISPLAY_TZ if needed.
DISPLAY_TZ = ZoneInfo(os.environ.get("ECHO_DISPLAY_TZ", "America/Los_Angeles"))


def _as_utc(ts: datetime) -> datetime:
    if ts.tzinfo is None:
        return ts.replace(tzinfo=timezone.utc)
    return ts.astimezone(timezone.utc)


def to_display(ts: datetime) -> datetime:
    return _as_utc(ts).astimezone(DISPLAY_TZ)


def minutes_from_midnight(ts: datetime) -> int:
    local = to_display(ts)
    return local.hour * 60 + local.minute


def format_hm(ts: datetime) -> str:
    return to_display(ts).strftime("%H:%M")


def format_hms(ts: datetime) -> str:
    return to_display(ts).strftime("%H:%M:%S")


def tz_label() -> str:
    """Short label for UI, e.g. PST or PDT."""
    return to_display(datetime.now(timezone.utc)).strftime("%Z")
