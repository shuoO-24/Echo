from __future__ import annotations

from ec.sessionizer import apply_retention, rebuild_sessions


class CategorizeLayer:
    """Sessionize + label stage facade."""

    def rebuild(self) -> int:
        return rebuild_sessions()

    def retention(self, days: int) -> int:
        return apply_retention(days)
