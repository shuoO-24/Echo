from __future__ import annotations

import argparse
from datetime import date, datetime
from pathlib import Path
import sys
import time

from ec.app import EchoApp
from ec.config import SETTINGS
from ec.infrastructure.duckdb.collector import ingest_jsonl
from ec.runtime.daemon import daemon_status, run_foreground_loop, stop_daemon
from ec.runtime.doctor import run_doctor
from ec.infrastructure.duckdb.models import extract_project_name
from ec.layers.remember.grouping import group_sessions, project_label
from ec.runtime.launchd import install_launch_agent
from ec.layers.remember.log_format import (
    FollowBuffer,
    collapse_raw_rows,
    format_activity_row,
    format_typed_text,
    reconstruct_typed_streams,
)

APP = EchoApp()


def _print_project_report(target: str | None = None) -> None:
    day = target or date.today().isoformat()
    sessions = APP.remember.session_detail_rows(day)
    if not sessions:
        print("No activity for this date yet.")
        return
    projects = group_sessions(sessions)
    print(f"today: {day}")
    for project in projects:
        print(f"\n[{project['project']}] {project['minutes']} min")
        for cat in project["categories"]:
            print(f"  {cat['category']:13} {cat['minutes']:6} min  sessions={cat['sessions']}")
            for app_row in cat["apps"]:
                print(
                    f"    - {app_row['app']:18} {app_row['minutes']:6} min  sessions={app_row['sessions']}"
                )


def _print_today_report() -> None:
    _print_project_report()


def cmd_capture_once(_: argparse.Namespace) -> None:
    result = APP.monitor.capture_once()
    event = result.event
    print(f"captured=1 app={event.app} title={event.window_title!r}")
    if result.warning:
        print(f"warning: {result.warning}")


def cmd_ingest_json(args: argparse.Namespace) -> None:
    count = ingest_jsonl(Path(args.path))
    print(f"ingested={count}")


def cmd_sessionize(_: argparse.Namespace) -> None:
    count = APP.categorize.rebuild()
    print(f"sessions={count}")


def cmd_today(_: argparse.Namespace) -> None:
    _print_today_report()


def cmd_timeline(args: argparse.Namespace) -> None:
    target = args.date or date.today().isoformat()
    sessions = APP.remember.session_detail_rows(target)
    if not sessions:
        print(f"No sessions for {target}.")
        return
    projects = group_sessions(sessions)
    print(f"timeline: {target}")
    for project in projects:
        print(f"\n[{project['project']}]")
        for cat in project["categories"]:
            print(f"  -- {cat['category']} ({cat['minutes']} min) --")
            for item in cat["sessions"]:
                start_ts = item["start"]
                end_ts = item["end"]
                app = item["app"]
                title = item["title"][:70]
                switches = item["switches"]
                print(
                    f"  - {start_ts} -> {end_ts} | {app:20} | sw={switches:2} | {title}"
                )


def cmd_retention(args: argparse.Namespace) -> None:
    deleted = APP.categorize.retention(args.days)
    print(f"deleted_raw_events={deleted}")


def cmd_start(args: argparse.Namespace) -> None:
    running, pid = daemon_status()
    if running:
        print(f"daemon already running pid={pid}")
        return
    run_foreground_loop(interval_seconds=args.interval, capture_text=args.capture_text)


def cmd_stop(_: argparse.Namespace) -> None:
    stopped, message = stop_daemon()
    print(message)


def cmd_status(_: argparse.Namespace) -> None:
    running, pid = daemon_status()
    if running:
        print(f"daemon running pid={pid}")
    else:
        print("daemon not running")


def cmd_doctor(_: argparse.Namespace) -> None:
    print(f"[info] python={sys.executable}")
    print(f"[info] db={SETTINGS.db_path}")
    for line in run_doctor():
        print(line)


def cmd_launchd_install(args: argparse.Namespace) -> None:
    plist = install_launch_agent(interval_seconds=args.interval, load_now=args.load_now)
    print(f"launch-agent written: {plist}")
    if args.load_now:
        print("launch-agent loaded")


def cmd_raw(args: argparse.Namespace) -> None:
    order = "ASC" if args.chronological else "DESC"
    if args.text_only:
        where_clause = "COALESCE(typed_text, '') <> ''"
    elif args.active_only:
        where_clause = "kb_count > 0 OR mouse_count > 0 OR COALESCE(typed_text, '') <> ''"
    else:
        where_clause = "1=1"
    rows = APP.remember.raw_rows(last=args.last, where_clause=where_clause, order=order)

    if not rows:
        print("No raw events found.")
        return

    if args.collapse:
        collapsed_rows: list[tuple] = []
        for row in collapse_raw_rows(rows):
            collapsed_rows.append(tuple(row))
    else:
        collapsed_rows = [
            (ts, ts, app, title, kb_count, mouse_count, typed_text, 1)
            for ts, app, title, kb_count, mouse_count, typed_text in rows
        ]

    print(f"raw_events (last {len(rows)}, shown {len(collapsed_rows)}):")
    for start_ts, end_ts, app, title, kb_count, mouse_count, typed_text, repeats in collapsed_rows:
        title = (title or "")[:50]
        typed_text = (typed_text or "")[: args.text_chars]
        if not typed_text:
            typed_text = "<empty>"
        else:
            typed_text = format_typed_text(typed_text, args.text_chars)
        ts_display = str(start_ts) if start_ts == end_ts else f"{start_ts} -> {end_ts}"
        repeat_suffix = f" x{repeats}" if repeats > 1 else ""
        project = extract_project_name(app, title)
        proj_suffix = f" | proj={project}" if project else ""
        print(
            f"- {ts_display} | {app:18} | kb={kb_count:3} mouse={mouse_count:3} | title={title!r}{proj_suffix} | text={typed_text}{repeat_suffix}"
        )


def cmd_tick(_: argparse.Namespace) -> None:
    count = APP.categorize.rebuild()
    print(f"sessions={count}")
    _print_today_report()


def _format_duration(start_ts, end_ts, sample_seconds: int) -> str:
    seconds = (end_ts - start_ts).total_seconds() + sample_seconds
    if seconds < 60:
        return f"{seconds:.0f}s"
    return f"{seconds / 60:.1f} min"


def cmd_log(args: argparse.Namespace) -> None:
    target = args.date or date.today().isoformat()
    if not args.no_rebuild:
        count = APP.categorize.rebuild()
        print(f"log: {target} (sessions rebuilt={count})")
    else:
        print(f"log: {target}")

    event_count, kb_total, mouse_total = APP.remember.day_stats(target)
    print(f"events={event_count} kb={kb_total} mouse={mouse_total}")
    print()

    print("== summary (by project) ==")
    sessions = APP.remember.session_detail_rows(target)
    if not sessions:
        print("No sessions for this date.")
    else:
        for project in group_sessions(sessions):
            print(f"\n[{project['project']}] {project['minutes']} min")
            for cat in project["categories"]:
                print(f"  {cat['category']:13} {cat['minutes']:6} min  sessions={cat['sessions']}")
    print()

    print("== sessions ==")
    sessions = APP.remember.session_detail_rows(target)
    if not sessions:
        print("No sessions.")
    else:
        sample = SETTINGS.default_sample_interval_seconds
        for start_ts, end_ts, app, category, title, kb, mouse, switches, summary, repo in sessions:
            duration = _format_duration(start_ts, end_ts, sample)
            project = extract_project_name(app, title, repo)
            proj_suffix = f" | proj={project}" if project else ""
            print(
                f"- {start_ts} -> {end_ts} ({duration}) | {category:13} | {app:18} | "
                f"kb={kb:4} mouse={mouse:4} sw={switches:2} | {title[:60]}{proj_suffix}"
            )
            if summary:
                print(f"  summary: {summary}")
    print()

    raw = APP.remember.raw_events_for_date(target)

    print("== typed stream ==")
    typed_streams = reconstruct_typed_streams(raw)
    if not typed_streams:
        print("No typed text captured (run daemon with --capture-text).")
    else:
        for stream in typed_streams:
            text = format_typed_text(stream["text"], args.text_chars)
            project = extract_project_name(stream["app"], stream["title"])
            proj_suffix = f" | proj={project}" if project else ""
            print(
                f"- {stream['start_ts']} -> {stream['end_ts']} | {stream['app']:18} | "
                f"kb={stream['kb']:4} | title={stream['title'][:50]!r}{proj_suffix} | {text}"
            )
    print()

    print("== activity ==")
    if not raw:
        print("No raw events.")
        return

    if args.full:
        display_rows = [
            (ts, ts, app, title, kb_count, mouse_count, typed_text, 1)
            for ts, app, title, kb_count, mouse_count, typed_text in raw
        ]
    else:
        display_rows = collapse_raw_rows(raw)

    print(f"rows={len(raw)} shown={len(display_rows)}")
    for start_ts, end_ts, app, title, kb_count, mouse_count, typed_text, repeats in display_rows:
        print(
            format_activity_row(
                start_ts,
                end_ts,
                app,
                title,
                kb_count,
                mouse_count,
                typed_text,
                repeats=repeats,
                text_chars=args.text_chars,
            )
        )


def cmd_follow(args: argparse.Namespace) -> None:
    running, pid = daemon_status()
    if running:
        print(f"daemon running pid={pid}")
    else:
        print("daemon not running (start it in another terminal with: ec start --interval 10 --capture-text)")

    last_ts = APP.remember.latest_raw_ts()
    if last_ts is None:
        last_ts = datetime.min
        print("follow: waiting for first event...")
    elif args.tail:
        recent = APP.remember.raw_rows(last=args.tail, order="ASC")
        print(f"follow: last {len(recent)} events, then live stream (ctrl+c to stop)")
        buffer = FollowBuffer() if not args.full else None
        for row in recent:
            if args.full:
                print(
                    format_activity_row(
                        row[0], row[0], row[1], row[2], row[3], row[4], row[5], text_chars=args.text_chars
                    )
                )
            else:
                line = buffer.push(*row)
                if line:
                    print(line)
            last_ts = row[0]
        if buffer:
            pending = buffer.flush(text_chars=args.text_chars)
            if pending:
                print(pending)
    else:
        print(f"follow: live stream from {last_ts} (ctrl+c to stop)")

    buffer = FollowBuffer() if not args.full else None

    try:
        while True:
            rows = APP.remember.raw_events_after(last_ts)
            for row in rows:
                ts, app, title, kb_count, mouse_count, typed_text = row
                if args.full:
                    print(
                        format_activity_row(
                            ts, ts, app, title, kb_count, mouse_count, typed_text, text_chars=args.text_chars
                        )
                    )
                else:
                    line = buffer.push(ts, app, title, kb_count, mouse_count, typed_text)
                    if line:
                        print(line)
                    elif typed_text and buffer.pending_typed_text():
                        print(
                            f"  typing: {format_typed_text(buffer.pending_typed_text(), args.text_chars)}"
                        )
                last_ts = ts
            time.sleep(args.interval)
    except KeyboardInterrupt:
        if buffer:
            pending = buffer.flush(text_chars=args.text_chars)
            if pending:
                print(pending)
        print("follow: stopped")


def cmd_desktop(args: argparse.Namespace) -> None:
    from ec.desktop.run import run_desktop

    run_desktop(
        port=args.port,
        window=not args.browser and not args.no_window,
        browser=args.browser,
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="ec", description="Echo activity monitor")
    sub = parser.add_subparsers(dest="command", required=True)

    capture = sub.add_parser("capture-once", help="Capture one active app/title snapshot")
    capture.set_defaults(func=cmd_capture_once)

    ingest = sub.add_parser("ingest-json", help="Ingest newline-delimited JSON events")
    ingest.add_argument("path", help="Path to JSONL file")
    ingest.set_defaults(func=cmd_ingest_json)

    session = sub.add_parser("sessionize", help="Build sessions and daily rollups")
    session.set_defaults(func=cmd_sessionize)

    today = sub.add_parser("today", help="Show today's category/app breakdown")
    today.set_defaults(func=cmd_today)

    timeline = sub.add_parser("timeline", help="Show session timeline")
    timeline.add_argument("--date", help="YYYY-MM-DD (default: today)")
    timeline.set_defaults(func=cmd_timeline)

    retention = sub.add_parser("retention", help="Delete old raw events")
    retention.add_argument("--days", type=int, default=90)
    retention.set_defaults(func=cmd_retention)

    start = sub.add_parser("start", help="Run always-on collector loop in foreground")
    start.add_argument("--interval", type=int, default=SETTINGS.default_sample_interval_seconds)
    start.add_argument(
        "--capture-text",
        action="store_true",
        help="Capture literal typed text (off by default; sensitive).",
    )
    start.set_defaults(func=cmd_start)

    stop = sub.add_parser("stop", help="Stop running collector loop")
    stop.set_defaults(func=cmd_stop)

    status = sub.add_parser("status", help="Show daemon status")
    status.set_defaults(func=cmd_status)

    doctor = sub.add_parser("doctor", help="Run environment and sensor checks")
    doctor.set_defaults(func=cmd_doctor)

    launchd = sub.add_parser("launchd-install", help="Write launchd plist")
    launchd.add_argument("--interval", type=int, default=SETTINGS.default_sample_interval_seconds)
    launchd.add_argument("--load-now", action="store_true")
    launchd.set_defaults(func=cmd_launchd_install)

    raw = sub.add_parser("raw", help="Show recent raw events")
    raw.add_argument("--last", type=int, default=20, help="Number of latest raw events to show")
    raw.add_argument(
        "--text-chars",
        type=int,
        default=40,
        help="Max characters of typed_text to display per row",
    )
    raw.add_argument(
        "--active-only",
        action="store_true",
        help="Show only rows with keyboard/mouse activity or non-empty text.",
    )
    raw.add_argument(
        "--text-only",
        action="store_true",
        help="Show only rows that contain typed text.",
    )
    raw.add_argument(
        "--collapse",
        action="store_true",
        help="Collapse consecutive rows with same app/title/text.",
    )
    raw.add_argument(
        "--chronological",
        action="store_true",
        help="Show rows oldest-to-newest.",
    )
    raw.set_defaults(func=cmd_raw)

    tick = sub.add_parser("tick", help="Rebuild sessions then print today's report")
    tick.set_defaults(func=cmd_tick)

    log = sub.add_parser("log", help="Full daily log: summary, sessions, and all raw events")
    log.add_argument("--date", help="YYYY-MM-DD (default: today)")
    log.add_argument(
        "--no-rebuild",
        action="store_true",
        help="Skip session rebuild before printing (default rebuilds for accuracy).",
    )
    log.add_argument("--text-chars", type=int, default=120, help="Max typed text chars per row")
    log.add_argument(
        "--full",
        action="store_true",
        help="Show every raw row without collapsing repeats.",
    )
    log.set_defaults(func=cmd_log)

    follow = sub.add_parser("follow", help="Stream activity continuously (live tail)")
    follow.add_argument("--interval", type=float, default=2.0, help="Poll interval in seconds")
    follow.add_argument("--tail", type=int, default=20, help="Show last N events before following")
    follow.add_argument("--text-chars", type=int, default=120)
    follow.add_argument("--full", action="store_true", help="Disable collapse while streaming")
    follow.set_defaults(func=cmd_follow)

    desktop = sub.add_parser("desktop", help="Open Echo desktop dashboard (native window)")
    desktop.add_argument("--port", type=int, default=7000, help="Local HTTP port (default: 7000)")
    desktop.add_argument(
        "--browser",
        action="store_true",
        help="Open in default browser instead of a native window",
    )
    desktop.add_argument(
        "--no-window",
        action="store_true",
        help="Serve only; print URL (no browser, no native window)",
    )
    desktop.set_defaults(func=cmd_desktop)

    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
