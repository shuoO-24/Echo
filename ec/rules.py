from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class Rule:
    category: str
    app_re: str = ".*"
    title_re: str = ".*"
    in_meeting: bool | None = None

    def matches(self, app: str, title: str, in_meeting: bool) -> bool:
        if self.in_meeting is not None and self.in_meeting != in_meeting:
            return False
        return bool(re.search(self.app_re, app, re.I)) and bool(
            re.search(self.title_re, title, re.I)
        )


DEFAULT_RULES = [
    Rule(category="Meeting", in_meeting=True),
    Rule(category="Meeting", app_re=r"calendar"),
    Rule(category="Coding", app_re=r"xcode|iterm|terminal|visual studio code|cursor|code"),
    Rule(category="Comms", app_re=r"slack|mail|messages|discord"),
    Rule(category="Research", app_re=r"chrome|safari|firefox", title_re=r"docs|stackoverflow|arxiv"),
    Rule(category="Distraction", app_re=r"chrome|safari|firefox", title_re=r"youtube|twitter|x.com|reddit"),
]


def categorize(app: str, title: str, in_meeting: bool) -> tuple[str, str, str]:
    for rule in DEFAULT_RULES:
        if rule.matches(app=app, title=title, in_meeting=in_meeting):
            return rule.category, f"{rule.category} via rules", "rules"
    return "Uncategorized", "Needs nightly label pass", "unknown"
