from __future__ import annotations

import subprocess
from dataclasses import dataclass

from ec.infrastructure.duckdb.models import RawEvent


@dataclass
class CaptureResult:
    event: RawEvent
    warning: str = ""


def capture_foreground_once() -> CaptureResult:
    script = """
    tell application "System Events"
      set frontApp to name of first application process whose frontmost is true
      set frontTitle to ""
      try
        tell process frontApp
          if (count of windows) > 0 then
            set frontTitle to name of front window
          end if
        end tell
      end try
      return frontApp & tab & frontTitle
    end tell
    """
    result = subprocess.run(
        ["osascript", "-e", script],
        check=False,
        capture_output=True,
        text=True,
    )
    app = "unknown"
    title = ""
    warning = ""
    if result.returncode == 0 and result.stdout.strip():
        output = result.stdout.strip()
        if "\t" in output:
            app_part, title_part = output.split("\t", maxsplit=1)
            app = app_part.strip() or app
            title = title_part.strip()
        else:
            app = output
    elif result.stderr.strip():
        err = result.stderr.strip()
        if "-10822" in err:
            warning = (
                "macOS blocked automation/accessibility for System Events. Grant permission to "
                "your terminal app in System Settings -> Privacy & Security -> Accessibility, "
                f"then re-run capture-once. Raw error: {err}"
            )
        else:
            warning = err

    if app == "unknown":
        warning = warning or (
            "Could not read frontmost app. On macOS, grant Accessibility permission to "
            "Terminal/Cursor in System Settings -> Privacy & Security -> Accessibility."
        )
    return CaptureResult(
        event=RawEvent.from_dict({"app": app, "window_title": title, "source": "macos.focus"}),
        warning=warning,
    )
