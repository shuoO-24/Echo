from __future__ import annotations

import sys
import webbrowser

from ec.desktop.server import create_server, serve_forever


def run_desktop(
    *,
    host: str = "127.0.0.1",
    port: int = 7000,
    window: bool = True,
    browser: bool = False,
) -> None:
    url = f"http://{host}:{port}/"

    if window:
        httpd = serve_forever(host, port)
        try:
            import webview
        except ImportError as exc:
            print(
                "pywebview is required for the native window. "
                "Install with: pip install pywebview\n"
                "Or run: python -m ec.main desktop --browser\n"
                f"Error: {exc}",
                file=sys.stderr,
            )
            raise SystemExit(1) from exc

        webview.create_window(
            "Echo",
            url,
            width=980,
            height=760,
            min_size=(720, 520),
        )
        print(f"Echo desktop: {url}")
        webview.start()
        httpd.shutdown()
        return

    httpd = create_server(host, port)
    if browser:
        webbrowser.open(url)
    print(f"Echo desktop: {url} (Ctrl+C to stop)")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("desktop: stopped")
    finally:
        httpd.server_close()
