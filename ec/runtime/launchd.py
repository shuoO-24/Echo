from __future__ import annotations

import subprocess
import sys
from pathlib import Path

from ec.config import SETTINGS
from ec.infrastructure.duckdb.connection import ensure_app_dir


def build_plist(interval_seconds: int) -> str:
    ensure_app_dir()
    python_path = sys.executable
    app_dir = SETTINGS.app_dir
    plist = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>{SETTINGS.launch_agent_label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>{python_path}</string>
    <string>-m</string>
    <string>ec.main</string>
    <string>start</string>
    <string>--interval</string>
    <string>{interval_seconds}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>{Path.cwd()}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>EnvironmentVariables</key>
  <dict>
    <key>ECHO_APP_DIR</key>
    <string>{app_dir}</string>
  </dict>
  <key>StandardOutPath</key>
  <string>{app_dir / "echo-launchd.out.log"}</string>
  <key>StandardErrorPath</key>
  <string>{app_dir / "echo-launchd.err.log"}</string>
</dict>
</plist>
"""
    return plist


def install_launch_agent(interval_seconds: int, load_now: bool) -> Path:
    plist_path = SETTINGS.launch_agent_plist_path
    plist_path.parent.mkdir(parents=True, exist_ok=True)
    plist_path.write_text(build_plist(interval_seconds), encoding="utf-8")
    if load_now:
        subprocess.run(["launchctl", "unload", str(plist_path)], check=False, capture_output=True)
        subprocess.run(["launchctl", "load", str(plist_path)], check=True)
    return plist_path
