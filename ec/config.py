from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    app_dir: Path = Path(
        os.environ.get(
            "ECHO_APP_DIR",
            str(Path.home() / "Library" / "Application Support" / "Echo"),
        )
    )
    db_name: str = "echo.duckdb"
    idle_gap_minutes: int = 5
    flicker_merge_seconds: int = 30
    default_sample_interval_seconds: int = 10

    @property
    def db_path(self) -> Path:
        return self.app_dir / self.db_name

    @property
    def pid_path(self) -> Path:
        return self.app_dir / "echo.pid"

    @property
    def launch_agent_label(self) -> str:
        return "com.echo.collector"

    @property
    def launch_agent_plist_path(self) -> Path:
        return Path.home() / "Library" / "LaunchAgents" / f"{self.launch_agent_label}.plist"


SETTINGS = Settings()
