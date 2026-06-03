from __future__ import annotations

from collections import defaultdict
from typing import Any

from ec.config import SETTINGS
from ec.infrastructure.duckdb.models import extract_project_name
from ec.rules import categorize

NO_PROJECT = "(no project)"


def project_label(app: str, title: str, repo: str = "") -> str:
    name = extract_project_name(app, title, repo)
    return name or NO_PROJECT


def session_duration_minutes(start_ts, end_ts) -> float:
    seconds = (end_ts - start_ts).total_seconds() + SETTINGS.default_sample_interval_seconds
    return max(seconds / 60.0, 0.0)


def activity_category(app: str, title: str) -> str:
    category, _, _ = categorize(app=app, title=title or "", in_meeting=False)
    return category


def _empty_category_bucket() -> dict[str, Any]:
    return {
        "minutes": 0.0,
        "sessions": 0,
        "switches": 0,
        "apps": defaultdict(lambda: {"minutes": 0.0, "sessions": 0}),
        "session_items": [],
        "activity_items": [],
    }


def _finalize_projects(project_buckets: dict[str, dict[str, dict]]) -> list[dict[str, Any]]:
    projects: list[dict[str, Any]] = []
    for project in sorted(project_buckets, key=lambda name: (name == NO_PROJECT, name.lower())):
        categories_out: list[dict[str, Any]] = []
        project_minutes = 0.0
        for category in sorted(
            project_buckets[project],
            key=lambda cat: -project_buckets[project][cat]["minutes"],
        ):
            bucket = project_buckets[project][category]
            minutes = round(bucket["minutes"], 1)
            if minutes <= 0 and not bucket["session_items"] and not bucket["activity_items"]:
                continue
            project_minutes += minutes
            apps = [
                {
                    "app": app,
                    "minutes": round(stats["minutes"], 1),
                    "sessions": int(stats["sessions"]),
                }
                for app, stats in sorted(
                    bucket["apps"].items(), key=lambda item: -item[1]["minutes"]
                )
            ]
            categories_out.append(
                {
                    "category": category,
                    "minutes": minutes,
                    "sessions": int(bucket["sessions"]),
                    "switches": int(bucket["switches"]),
                    "apps": apps,
                    "sessions": bucket["session_items"],
                    "activities": bucket["activity_items"],
                }
            )
        if not categories_out:
            continue
        projects.append(
            {
                "project": project,
                "minutes": round(project_minutes, 1),
                "categories": categories_out,
            }
        )
    return projects


def group_sessions(session_rows: list[tuple]) -> list[dict[str, Any]]:
    """Group session detail rows by project, then category."""
    project_buckets: dict[str, dict[str, dict]] = defaultdict(
        lambda: defaultdict(_empty_category_bucket)
    )

    for start_ts, end_ts, app, category, title, kb, mouse, switches, _summary, repo in session_rows:
        project = project_label(app, title or "", repo or "")
        minutes = session_duration_minutes(start_ts, end_ts)
        bucket = project_buckets[project][category]
        bucket["minutes"] += minutes
        bucket["sessions"] += 1
        bucket["switches"] += int(switches)
        bucket["apps"][app]["minutes"] += minutes
        bucket["apps"][app]["sessions"] += 1
        bucket["session_items"].append(
            {
                "start": start_ts,
                "end": end_ts,
                "app": app,
                "category": category,
                "title": (title or "")[:120],
                "project": project,
                "kb": int(kb),
                "mouse": int(mouse),
                "switches": int(switches),
            }
        )

    return _finalize_projects(project_buckets)


def group_activities(activity_items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Group activity dicts (must include project + category) by project then category."""
    project_buckets: dict[str, dict[str, dict]] = defaultdict(
        lambda: defaultdict(_empty_category_bucket)
    )

    for item in activity_items:
        project = item.get("project") or NO_PROJECT
        category = item.get("category") or activity_category(item["app"], item.get("title", ""))
        bucket = project_buckets[project][category]
        bucket["activity_items"].append(item)

    return _finalize_projects(project_buckets)


def flatten_category_totals(projects: list[dict[str, Any]]) -> list[dict[str, Any]]:
    totals: dict[str, float] = defaultdict(float)
    for project in projects:
        for cat in project["categories"]:
            totals[cat["category"]] += cat["minutes"]
    return [
        {"category": cat, "minutes": round(mins, 1)}
        for cat, mins in sorted(totals.items(), key=lambda item: -item[1])
    ]
