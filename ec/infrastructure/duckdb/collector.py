from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable

from ec.infrastructure.duckdb.connection import connect
from ec.infrastructure.duckdb.models import RawEvent


def insert_events(events: Iterable[RawEvent]) -> int:
    rows = [
        (
            event.ts,
            event.app,
            event.window_title,
            event.url_host,
            event.repo,
            event.branch,
            event.idle,
            event.kb_count,
            event.mouse_count,
            event.typed_text,
            event.in_meeting,
            event.source,
        )
        for event in events
    ]
    if not rows:
        return 0

    with connect() as conn:
        conn.executemany(
            """
            INSERT INTO raw_events (
                ts, app, window_title, url_host, repo, branch, idle,
                kb_count, mouse_count, typed_text, in_meeting, source
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            rows,
        )
    return len(rows)


def ingest_jsonl(path: Path) -> int:
    events: list[RawEvent] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        payload = json.loads(line)
        events.append(RawEvent.from_dict(payload))
    return insert_events(events)
