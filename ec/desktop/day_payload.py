from __future__ import annotations

from datetime import date, datetime
from typing import Any

from ec.layers.remember.grouping import NO_PROJECT, group_sessions, project_label, session_duration_minutes
from ec.desktop.timezone_display import format_hm, minutes_from_midnight, tz_label

CAT_ORDER = ["Coding", "Meeting", "Comms", "Research", "Distraction", "Uncategorized"]


def _fmt_clock(mins: int) -> str:
    return f"{mins // 60:02d}:{mins % 60:02d}"


def _fmt_mins_label(minutes: float) -> str:
    total = int(round(minutes))
    hours, mm = divmod(total, 60)
    if hours == 0:
        return f"{mm}m"
    return f"{hours}h {mm:02d}m"


def _date_long(day: str) -> str:
    return date.fromisoformat(day).strftime("%A, %B %d")


def build_day_payload(day: str, session_rows: list[tuple]) -> dict[str, Any]:
    sessions_out: list[dict[str, Any]] = []
    kb_total = 0
    mouse_total = 0

    for start_ts, end_ts, app, category, title, kb, mouse, switches, _summary, repo in session_rows:
        start_m = minutes_from_midnight(start_ts)
        end_m = minutes_from_midnight(end_ts)
        mins = session_duration_minutes(start_ts, end_ts)
        proj = project_label(app, title or "", repo or "")
        project = None if proj == NO_PROJECT else proj
        kb_total += int(kb)
        mouse_total += int(mouse)
        sessions_out.append(
            {
                "start": start_m,
                "end": end_m,
                "s": format_hm(start_ts),
                "e": format_hm(end_ts),
                "app": app,
                "title": (title or "")[:120],
                "project": project,
                "cat": category,
                "kb": int(kb),
                "ms": int(mouse),
                "mins": int(round(mins)),
            }
        )

    sessions_out.sort(key=lambda row: row["start"])
    tracked_min = sum(s["mins"] for s in sessions_out)
    day_start = sessions_out[0]["start"] if sessions_out else 0
    day_end = sessions_out[-1]["end"] if sessions_out else 0

    cat_totals: dict[str, int] = {name: 0 for name in CAT_ORDER}
    for row in sessions_out:
        cat_totals[row["cat"]] = cat_totals.get(row["cat"], 0) + row["mins"]

    categories = []
    for name in CAT_ORDER:
        mins = cat_totals.get(name, 0)
        if mins <= 0:
            continue
        categories.append(
            {
                "name": name,
                "mins": mins,
                "pct": (mins / tracked_min) if tracked_min else 0.0,
            }
        )
    if not categories and tracked_min:
        categories = [{"name": "Uncategorized", "mins": tracked_min, "pct": 1.0}]

    grouped = group_sessions(session_rows)
    projects_out = []
    for block in grouped:
        name = None if block["project"] == NO_PROJECT else block["project"]
        apps_map: dict[str, int] = {}
        cats_map: dict[str, int] = {}
        session_count = 0
        for cat in block["categories"]:
            sess = cat["sessions"]
            if isinstance(sess, list):
                session_count += len(sess)
            else:
                session_count += int(sess)
            cats_map[cat["category"]] = cats_map.get(cat["category"], 0) + int(round(cat["minutes"]))
            for app_row in cat["apps"]:
                apps_map[app_row["app"]] = apps_map.get(app_row["app"], 0) + int(round(app_row["minutes"]))
        projects_out.append(
            {
                "name": name,
                "mins": int(round(block["minutes"])),
                "sessions": session_count,
                "apps": [
                    {"app": app, "mins": mins}
                    for app, mins in sorted(apps_map.items(), key=lambda item: -item[1])
                ],
                "cats": [
                    {"cat": cat, "mins": mins}
                    for cat, mins in sorted(cats_map.items(), key=lambda item: -item[1])
                ],
            }
        )

    coding_sessions = [s for s in sessions_out if s["cat"] == "Coding"]
    if coding_sessions:
        longest = max(coding_sessions, key=lambda s: s["mins"])
        longest_focus = {
            "mins": longest["mins"],
            "title": longest["title"],
            "project": longest["project"] or "",
        }
    else:
        longest_focus = {"mins": 0, "title": "", "project": ""}

    return {
        "date": day,
        "dateLong": _date_long(day),
        "timezone": tz_label(),
        "dayStart": day_start,
        "dayEnd": day_end,
        "totals": {
            "tracked_min": tracked_min,
            "sessions": len(sessions_out),
            "kb": kb_total,
            "ms": mouse_total,
        },
        "categories": categories,
        "longestFocus": longest_focus,
        "projects": projects_out,
        "sessions": sessions_out,
        "total": tracked_min,
    }
