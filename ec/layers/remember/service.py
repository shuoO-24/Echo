from __future__ import annotations

from datetime import date

from ec.infrastructure.duckdb.connection import connect


class RememberLayer:
    """Read/query facade for store layer."""

    def today_rows(self) -> list[tuple]:
        with connect() as conn:
            return conn.execute(
                """
                SELECT category, app, ROUND(SUM(active_minutes), 1) AS minutes,
                       SUM(session_count) AS sessions, SUM(switch_count) AS switches
                FROM daily_rollups
                WHERE date = CURRENT_DATE
                GROUP BY 1, 2
                ORDER BY minutes DESC
                """
            ).fetchall()

    def timeline_rows(self, target: str | None = None) -> tuple[str, list[tuple]]:
        day = target or date.today().isoformat()
        with connect() as conn:
            rows = conn.execute(
                """
                SELECT start_ts, end_ts, app, category, COALESCE(primary_title, ''), switch_count
                FROM sessions
                WHERE CAST(start_ts AS DATE) = ?
                ORDER BY start_ts
                """,
                [day],
            ).fetchall()
        return day, rows

    def raw_rows(self, *, last: int, where_clause: str = "1=1", order: str = "DESC") -> list[tuple]:
        with connect() as conn:
            return conn.execute(
                f"""
                SELECT ts, app, COALESCE(window_title, ''), kb_count, mouse_count, COALESCE(typed_text, '')
                FROM raw_events
                WHERE {where_clause}
                ORDER BY ts {order}
                LIMIT ?
                """,
                [last],
            ).fetchall()

    def session_detail_rows(self, target: str) -> list[tuple]:
        with connect() as conn:
            return conn.execute(
                """
                SELECT start_ts, end_ts, app, category, COALESCE(primary_title, ''),
                       kb_total, mouse_total, switch_count, COALESCE(summary, ''), COALESCE(repo, '')
                FROM sessions
                WHERE CAST(start_ts AS DATE) = ?
                ORDER BY start_ts
                """,
                [target],
            ).fetchall()

    def raw_events_for_date(self, target: str) -> list[tuple]:
        with connect() as conn:
            return conn.execute(
                """
                SELECT ts, app, COALESCE(window_title, ''), kb_count, mouse_count, COALESCE(typed_text, '')
                FROM raw_events
                WHERE CAST(ts AS DATE) = ?
                ORDER BY ts ASC
                """,
                [target],
            ).fetchall()

    def day_stats(self, target: str) -> tuple[int, int, int]:
        with connect() as conn:
            row = conn.execute(
                """
                SELECT COUNT(*), COALESCE(SUM(kb_count), 0), COALESCE(SUM(mouse_count), 0)
                FROM raw_events
                WHERE CAST(ts AS DATE) = ?
                """,
                [target],
            ).fetchone()
        return int(row[0]), int(row[1]), int(row[2])

    def summary_rows_for_date(self, target: str) -> list[tuple]:
        with connect() as conn:
            return conn.execute(
                """
                SELECT category, app, ROUND(SUM(active_minutes), 1), SUM(session_count), SUM(switch_count)
                FROM daily_rollups
                WHERE date = ?
                GROUP BY 1, 2
                ORDER BY 3 DESC
                """,
                [target],
            ).fetchall()

    def raw_events_after(self, after_ts, limit: int = 200) -> list[tuple]:
        with connect() as conn:
            return conn.execute(
                """
                SELECT ts, app, COALESCE(window_title, ''), kb_count, mouse_count, COALESCE(typed_text, '')
                FROM raw_events
                WHERE ts > ?
                ORDER BY ts ASC
                LIMIT ?
                """,
                [after_ts, limit],
            ).fetchall()

    def latest_raw_ts(self):
        with connect() as conn:
            row = conn.execute("SELECT MAX(ts) FROM raw_events").fetchone()
            return row[0]
