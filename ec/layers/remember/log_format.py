from __future__ import annotations

from ec.infrastructure.duckdb.models import extract_project_name

RawRow = tuple


def _same_context(prev: list, app: str, title: str) -> bool:
    return prev[2] == app and prev[3] == title


def collapse_raw_rows(rows: list[RawRow]) -> list[list]:
    """Merge consecutive rows with same app/title; concatenate typed text."""
    collapsed: list[list] = []
    for ts, app, title, kb_count, mouse_count, typed_text in rows:
        if not collapsed:
            collapsed.append([ts, ts, app, title, kb_count, mouse_count, typed_text or "", 1])
            continue
        prev = collapsed[-1]
        if _same_context(prev, app, title):
            prev[1] = ts
            prev[4] += kb_count
            prev[5] += mouse_count
            if typed_text:
                prev[6] += typed_text
            prev[7] += 1
        else:
            collapsed.append([ts, ts, app, title, kb_count, mouse_count, typed_text or "", 1])
    return collapsed


def reconstruct_typed_streams(rows: list[RawRow]) -> list[dict]:
    """Stitch interval fragments into continuous typed text per app/title context."""
    streams: list[dict] = []
    current: dict | None = None

    for ts, app, title, kb_count, _mouse_count, typed_text in rows:
        if not typed_text:
            continue
        context = (app, title)
        if current and current["context"] == context:
            current["end_ts"] = ts
            current["kb"] += kb_count
            current["text"] += typed_text
        else:
            if current and current["text"].strip():
                streams.append(current)
            current = {
                "context": context,
                "app": app,
                "title": title,
                "start_ts": ts,
                "end_ts": ts,
                "kb": kb_count,
                "text": typed_text,
            }

    if current and current["text"].strip():
        streams.append(current)
    return streams


def format_typed_text(value: str, max_chars: int) -> str:
    text = value.replace("\n", "↵").replace("\t", "→")
    if len(text) > max_chars:
        return text[:max_chars] + "…"
    return text


def format_activity_row(
    start_ts,
    end_ts,
    app: str,
    title: str,
    kb_count: int,
    mouse_count: int,
    typed_text: str,
    *,
    repeats: int = 1,
    text_chars: int = 120,
    repo: str = "",
) -> str:
    title = (title or "")[:50]
    prefix = f"- {start_ts}" if start_ts == end_ts else f"- {start_ts} -> {end_ts}"
    line = f"{prefix} | {app:18} | kb={kb_count:3} mouse={mouse_count:3} | title={title!r}"
    project = extract_project_name(app, title, repo)
    if project:
        line += f" | proj={project}"
    if typed_text:
        line += f" | text={format_typed_text(typed_text, text_chars)}"
    elif not kb_count and not mouse_count:
        line += " | idle"
    if repeats > 1:
        line += f" x{repeats}"
    return line


class FollowBuffer:
    """Collapse consecutive rows while streaming live output."""

    def __init__(self) -> None:
        self._pending: list | None = None

    def push(self, ts, app, title, kb_count, mouse_count, typed_text) -> str | None:
        typed_text = typed_text or ""
        if self._pending is None:
            self._pending = [ts, ts, app, title, kb_count, mouse_count, typed_text, 1]
            return None
        prev = self._pending
        if _same_context(prev, app, title):
            prev[1] = ts
            prev[4] += kb_count
            prev[5] += mouse_count
            if typed_text:
                prev[6] += typed_text
            prev[7] += 1
            return None
        line = self.flush(text_chars=120)
        self._pending = [ts, ts, app, title, kb_count, mouse_count, typed_text, 1]
        return line

    def flush(self, *, text_chars: int = 120) -> str | None:
        if self._pending is None:
            return None
        start_ts, end_ts, app, title, kb_count, mouse_count, typed_text, repeats = self._pending
        self._pending = None
        return format_activity_row(
            start_ts,
            end_ts,
            app,
            title,
            kb_count,
            mouse_count,
            typed_text,
            repeats=repeats,
            text_chars=text_chars,
        )

    def pending_typed_text(self) -> str:
        if self._pending is None:
            return ""
        return self._pending[6]
