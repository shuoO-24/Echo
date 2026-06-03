from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from uuid import uuid4

from ec.config import SETTINGS
from ec.infrastructure.duckdb.connection import connect
from ec.rules import categorize


@dataclass
class EventRow:
    ts: datetime
    app: str
    window_title: str
    url_host: str
    repo: str
    idle: bool
    kb_count: int
    mouse_count: int
    in_meeting: bool


@dataclass
class SessionAccumulator:
    start_ts: datetime
    end_ts: datetime
    app: str
    primary_title: str
    repo: str
    in_meeting: bool
    kb_total: int = 0
    mouse_total: int = 0
    switch_count: int = 0

    def absorb(self, row: EventRow) -> None:
        self.end_ts = row.ts
        self.kb_total += row.kb_count
        self.mouse_total += row.mouse_count
        if row.window_title and row.window_title != self.primary_title:
            self.switch_count += 1
            self.primary_title = row.window_title
        if row.repo and row.repo != self.repo:
            self.switch_count += 1
            self.repo = row.repo
        self.in_meeting = self.in_meeting or row.in_meeting


def _context_key(row: EventRow) -> tuple[str, str, str]:
    return (
        row.app,
        row.repo or "",
        row.url_host or row.window_title or "",
    )


def _should_cut(prev: EventRow, curr: EventRow) -> bool:
    gap_seconds = (curr.ts - prev.ts).total_seconds()
    if gap_seconds > SETTINGS.idle_gap_minutes * 60:
        return True
    return _context_key(prev) != _context_key(curr)


def rebuild_sessions() -> int:
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT ts, app, window_title, url_host, repo, idle, kb_count, mouse_count, in_meeting
            FROM raw_events
            ORDER BY ts
            """
        ).fetchall()

        events = [EventRow(*row) for row in rows]
        sessions: list[SessionAccumulator] = []
        current: SessionAccumulator | None = None
        prev: EventRow | None = None

        for row in events:
            if current is None:
                current = SessionAccumulator(
                    start_ts=row.ts,
                    end_ts=row.ts,
                    app=row.app,
                    primary_title=row.window_title,
                    repo=row.repo,
                    in_meeting=row.in_meeting,
                    kb_total=row.kb_count,
                    mouse_total=row.mouse_count,
                )
                prev = row
                continue

            assert prev is not None
            if _should_cut(prev, row):
                duration = (current.end_ts - current.start_ts).total_seconds()
                if duration < SETTINGS.flicker_merge_seconds and sessions:
                    sessions[-1].end_ts = current.end_ts
                    sessions[-1].kb_total += current.kb_total
                    sessions[-1].mouse_total += current.mouse_total
                    sessions[-1].switch_count += 1
                else:
                    sessions.append(current)
                current = SessionAccumulator(
                    start_ts=row.ts,
                    end_ts=row.ts,
                    app=row.app,
                    primary_title=row.window_title,
                    repo=row.repo,
                    in_meeting=row.in_meeting,
                    kb_total=row.kb_count,
                    mouse_total=row.mouse_count,
                )
            else:
                current.absorb(row)
            prev = row

        if current is not None:
            sessions.append(current)

        conn.execute("DELETE FROM sessions")
        for s in sessions:
            category, summary, label_source = categorize(
                app=s.app, title=s.primary_title, in_meeting=s.in_meeting
            )
            conn.execute(
                """
                INSERT INTO sessions (
                    session_id, start_ts, end_ts, app, primary_title, repo, category,
                    summary, label_source, kb_total, mouse_total, switch_count
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    str(uuid4()),
                    s.start_ts,
                    s.end_ts,
                    s.app,
                    s.primary_title,
                    s.repo,
                    category,
                    summary,
                    label_source,
                    s.kb_total,
                    s.mouse_total,
                    s.switch_count,
                ),
            )

        conn.execute("DELETE FROM daily_rollups")
        conn.execute(
            """
            INSERT INTO daily_rollups
            SELECT
                CAST(start_ts AS DATE) AS date,
                COALESCE(category, 'Uncategorized') AS category,
                app,
                SUM(EXTRACT(EPOCH FROM (end_ts - start_ts)) / 60.0) AS active_minutes,
                COUNT(*) AS session_count,
                SUM(switch_count) AS switch_count
            FROM sessions
            GROUP BY 1, 2, 3
            """
        )
    return len(sessions)


def apply_retention(days: int) -> int:
    with connect() as conn:
        before = conn.execute("SELECT COUNT(*) FROM raw_events").fetchone()[0]
        conn.execute(
            """
            DELETE FROM raw_events
            WHERE ts < NOW() - (? * INTERVAL '1 day')
            """,
            [days],
        )
        after = conn.execute("SELECT COUNT(*) FROM raw_events").fetchone()[0]
    return before - after
