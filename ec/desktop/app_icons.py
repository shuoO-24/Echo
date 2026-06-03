from __future__ import annotations

import hashlib
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

from ec.infrastructure.duckdb.connection import ensure_app_dir

# macOS process name → application name for NSWorkspace lookup
APP_ALIASES: dict[str, str] = {
    "Code": "Visual Studio Code",
    "Google Chrome": "Google Chrome",
    "Chrome": "Google Chrome",
    "Safari": "Safari",
    "Firefox": "Firefox",
    "Terminal": "Terminal",
    "iTerm": "iTerm",
    "iTerm2": "iTerm",
    "Cursor": "Cursor",
    "Slack": "Slack",
    "Zoom": "zoom.us",
    "Notion": "Notion",
    "Mail": "Mail",
    "Messages": "Messages",
    "Calendar": "Calendar",
    "Finder": "Finder",
    "Discord": "Discord",
    "Spotify": "Spotify",
    "Figma": "Figma",
    "Xcode": "Xcode",
    "Arc": "Arc",
    "Linear": "Linear",
    "GitHub Desktop": "GitHub Desktop",
}

# App display name → site domain for favicon lookup
APP_WEB_DOMAINS: dict[str, str] = {
    "Cursor": "cursor.com",
    "Visual Studio Code": "code.visualstudio.com",
    "Code": "code.visualstudio.com",
    "Google Chrome": "google.com",
    "Chrome": "google.com",
    "Safari": "apple.com",
    "Firefox": "mozilla.org",
    "Slack": "slack.com",
    "Zoom": "zoom.us",
    "Notion": "notion.so",
    "Mail": "apple.com",
    "Messages": "apple.com",
    "Calendar": "google.com",
    "Terminal": "apple.com",
    "iTerm": "iterm2.com",
    "Discord": "discord.com",
    "Spotify": "spotify.com",
    "Figma": "figma.com",
    "Xcode": "apple.com",
    "Arc": "arc.net",
    "Linear": "linear.app",
    "GitHub Desktop": "github.com",
    "GitHub": "github.com",
    "YouTube": "youtube.com",
    "Twitter": "x.com",
    "X": "x.com",
}


def _icon_cache_dir() -> Path:
    path = ensure_app_dir() / "icons"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _cache_file(app_name: str, size: int, source: str = "") -> Path:
    digest = hashlib.sha256(f"{app_name}:{size}:{source}".encode()).hexdigest()[:12]
    safe = "".join(c if c.isalnum() else "_" for c in app_name)[:48]
    return _icon_cache_dir() / f"{safe}_{size}_{digest}.png"


def resolve_application_path(app_name: str) -> str | None:
    if not app_name or app_name == "unknown":
        return None
    lookup = APP_ALIASES.get(app_name, app_name)
    if sys.platform == "darwin":
        try:
            from AppKit import NSWorkspace

            path = NSWorkspace.sharedWorkspace().fullPathForApplication_(lookup)
            if path:
                return str(path)
        except Exception:
            pass
    for candidate in (
        Path(f"/Applications/{lookup}.app"),
        Path(f"/Applications/{app_name}.app"),
        Path.home() / "Applications" / f"{lookup}.app",
    ):
        if candidate.is_dir():
            return str(candidate)
    return None


def _domain_for_app(app_name: str) -> str:
    if not app_name:
        return ""
    if app_name in APP_WEB_DOMAINS:
        return APP_WEB_DOMAINS[app_name]
    lookup = APP_ALIASES.get(app_name, app_name)
    if lookup in APP_WEB_DOMAINS:
        return APP_WEB_DOMAINS[lookup]
    slug = re.sub(r"[^a-z0-9]", "", app_name.lower())
    if len(slug) >= 3:
        return f"{slug}.com"
    return ""


def _fetch_url_bytes(url: str, timeout: float = 6.0) -> bytes | None:
    try:
        request = urllib.request.Request(
            url,
            headers={"User-Agent": "Echo/1.0 (desktop icon lookup)"},
        )
        with urllib.request.urlopen(request, timeout=timeout) as response:
            data = response.read()
            if len(data) < 80:
                return None
            return data
    except (urllib.error.URLError, TimeoutError, ValueError):
        return None


def _fetch_web_icon_png(app_name: str, size: int) -> bytes | None:
    domain = _domain_for_app(app_name)
    if not domain:
        return None

    sz = 128 if size > 48 else 64 if size > 24 else 32
    urls = [
        f"https://www.google.com/s2/favicons?domain={domain}&sz={sz}",
        f"https://icons.duckduckgo.com/ip3/{domain}.ico",
        f"https://{domain}/favicon.ico",
    ]
    for url in urls:
        data = _fetch_url_bytes(url)
        if data:
            return data
    return None


def _extract_macos_icon_png(app_path: str, size: int) -> bytes | None:
    if sys.platform != "darwin":
        return None
    try:
        import AppKit

        workspace = AppKit.NSWorkspace.sharedWorkspace()
        icon = workspace.iconForFile_(app_path)
        icon.setSize_(AppKit.NSMakeSize(size, size))
        tiff = icon.TIFFRepresentation()
        if tiff is None:
            return None
        rep = AppKit.NSBitmapImageRep.imageRepWithData_(tiff)
        if rep is None:
            return None
        png = rep.representationUsingType_properties_(AppKit.NSBitmapImageFileTypePNG, None)
        if png is None:
            return None
        return bytes(png)
    except Exception:
        return None


def get_icon_png(app_name: str, size: int = 64) -> bytes | None:
    size = max(16, min(int(size), 128))
    cache = _cache_file(app_name, size)
    if cache.exists():
        return cache.read_bytes()

    data: bytes | None = None
    app_path = resolve_application_path(app_name)
    if app_path:
        data = _extract_macos_icon_png(app_path, size)

    if not data:
        web_cache = _cache_file(app_name, size, "web")
        if web_cache.exists():
            return web_cache.read_bytes()
        data = _fetch_web_icon_png(app_name, size)
        if data:
            web_cache.write_bytes(data)
            return data

    if data:
        cache.write_bytes(data)
    return data
