from __future__ import annotations

import json
import mimetypes
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from ec.desktop import api

STATIC_DIR = Path(__file__).resolve().parent / "static"


class EchoDesktopHandler(BaseHTTPRequestHandler):
    server_version = "EchoDesktop/2.0"

    def log_message(self, format: str, *args) -> None:
        return

    def _send_json(self, payload: bytes, *, status: int = 200) -> None:
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _send_bytes(self, body: bytes, content_type: str) -> None:
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _query(self) -> dict[str, list[str]]:
        return parse_qs(urlparse(self.path).query)

    def _q(self, name: str, default: str = "") -> str:
        values = self._query().get(name)
        return values[0] if values else default

    def _read_json_body(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        return json.loads(raw.decode("utf-8"))

    def _serve_static(self, rel_path: str) -> None:
        path = (STATIC_DIR / rel_path).resolve()
        if not str(path).startswith(str(STATIC_DIR.resolve())):
            self.send_error(403)
            return
        if not path.is_file():
            self.send_error(404)
            return
        content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        self._send_bytes(path.read_bytes(), content_type)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        route = parsed.path

        try:
            if route in ("/", "/index.html"):
                self._serve_static("index.html")
                return
            if route.startswith("/static/"):
                self._serve_static(route.removeprefix("/static/"))
                return
            if route == "/api/day":
                self._send_json(api.json_response(api.day_payload(self._q("date") or None)))
                return
            if route == "/api/activity":
                limit = int(self._q("limit", "48"))
                items = api.activity_list_payload(
                    target=self._q("date") or None,
                    after=self._q("after") or None,
                    limit=limit,
                )
                self._send_json(json.dumps(items, ensure_ascii=False).encode("utf-8"))
                return
            if route == "/api/collector/status":
                self._send_json(api.json_response(api.collector_status_payload()))
                return
            if route == "/api/icon":
                app_name = self._q("app")
                if not app_name:
                    self.send_error(400)
                    return
                size = int(self._q("size", "64"))
                png = api.icon_png(app_name, size=size)
                if not png:
                    self.send_error(404)
                    return
                self._send_bytes(png, "image/png")
                return
            if route == "/api/status":
                self._send_json(api.json_response(api.status_payload()))
                return
            if route == "/api/ask/status":
                self._send_json(api.json_response(api.ask_status_payload()))
                return
            if route == "/api/today":
                self._send_json(api.json_response(api.today_payload(self._q("date") or None)))
                return
            if route == "/api/timeline":
                self._send_json(api.json_response(api.timeline_payload(self._q("date") or None)))
                return
            self.send_error(404)
        except Exception as exc:
            self._send_json(api.json_response({"error": str(exc)}), status=500)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        try:
            if parsed.path in ("/api/rebuild", "/api/sessions/rebuild"):
                self._send_json(api.json_response(api.rebuild_sessions()))
                return
            if parsed.path == "/api/collector/stop":
                self._send_json(api.json_response(api.collector_stop_payload()))
                return
            if parsed.path == "/api/collector/start":
                self._send_json(api.json_response(api.collector_start_payload()))
                return
            if parsed.path in ("/api/ask", "/api/query"):
                body = self._read_json_body()
                prompt = str(body.get("prompt") or body.get("sql", "")).strip()
                if not prompt:
                    self._send_json(api.json_response({"error": "missing prompt"}), status=400)
                    return
                try:
                    result = api.ask_payload(prompt, body.get("date"))
                    self._send_json(api.json_response(result))
                except ValueError as exc:
                    self._send_json(
                        api.json_response(
                            {
                                "error": str(exc),
                                "hint": "try: how much time did I spend coding today?",
                            }
                        ),
                        status=400,
                    )
                return
            self.send_error(404)
        except Exception as exc:
            self._send_json(api.json_response({"error": str(exc)}), status=500)


def create_server(host: str = "127.0.0.1", port: int = 7000) -> ThreadingHTTPServer:
    return ThreadingHTTPServer((host, port), EchoDesktopHandler)


def serve_forever(host: str = "127.0.0.1", port: int = 7000) -> ThreadingHTTPServer:
    httpd = create_server(host, port)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    return httpd
