from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import re
from typing import Any
from urllib.parse import urlparse

_CODING_APP_RE = re.compile(
    r"xcode|iterm|terminal|visual studio code|cursor|\bcode\b", re.I
)


def utc_now() -> datetime:
    return datetime.now(tz=timezone.utc).replace(tzinfo=None)


def normalize_title(value: str | None) -> str:
    if not value:
        return ""
    return " ".join(value.strip().lower().split())


def normalize_url_host(url: str | None) -> str:
    if not url:
        return ""
    url = url.strip()
    parsed = urlparse(url if "://" in url else f"https://{url}")
    return (parsed.netloc or parsed.path or "").split("/")[0].lower()


def extract_project_name(app: str, title: str, repo: str = "") -> str:
    if repo.strip():
        return repo.strip().split("/")[-1]
    if not _CODING_APP_RE.search(app) or not title:
        return ""
    for sep in (" — ", " - ", " – "):
        if sep in title:
            project = title.rsplit(sep, 1)[-1].strip()
            if project and project != title:
                return project
    return ""


@dataclass
class RawEvent:
    ts: datetime
    app: str
    window_title: str = ""
    url_host: str = ""
    repo: str = ""
    branch: str = ""
    idle: bool = False
    kb_count: int = 0
    mouse_count: int = 0
    typed_text: str = ""
    in_meeting: bool = False
    source: str = "unknown"

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> "RawEvent":
        ts = payload.get("ts")
        if isinstance(ts, str):
            ts = datetime.fromisoformat(ts.replace("Z", "+00:00")).astimezone(
                timezone.utc
            ).replace(tzinfo=None)
        if not isinstance(ts, datetime):
            ts = utc_now()

        return cls(
            ts=ts,
            app=str(payload.get("app", "")).strip() or "unknown",
            window_title=normalize_title(payload.get("window_title")),
            url_host=normalize_url_host(payload.get("url_host")),
            repo=str(payload.get("repo", "")).strip(),
            branch=str(payload.get("branch", "")).strip(),
            idle=bool(payload.get("idle", False)),
            kb_count=int(payload.get("kb_count", 0) or 0),
            mouse_count=int(payload.get("mouse_count", 0) or 0),
            typed_text=str(payload.get("typed_text", "") or "")[:500],
            in_meeting=bool(payload.get("in_meeting", False)),
            source=str(payload.get("source", "unknown")).strip() or "unknown",
        )
