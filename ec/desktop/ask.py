from __future__ import annotations

import json
import os
import re
import time
import urllib.error
import urllib.request
from typing import Any

ASK_MODEL = "kimi-k2.6"
MOONSHOT_BASE_URL = "https://api.moonshot.ai/v1"
OPENAI_BASE_URL = "https://api.openai.com/v1"


def _fmt_mins(minutes: float | int) -> str:
    total = int(round(minutes))
    hours, mm = divmod(total, 60)
    if hours == 0:
        return f"{mm}m"
    return f"{hours}h {mm:02d}m"


def _day_context(day: dict[str, Any]) -> str:
    lines = [
        f"date: {day.get('date')}",
        f"tracked: {_fmt_mins(day.get('total', 0))}",
        f"sessions: {day.get('totals', {}).get('sessions', len(day.get('sessions', [])))}",
        f"kb: {day.get('totals', {}).get('kb', 0)} · ms: {day.get('totals', {}).get('ms', 0)}",
    ]
    cats = day.get("categories") or []
    if cats:
        lines.append("categories:")
        for c in cats:
            pct = int(round((c.get("pct") or 0) * 100))
            lines.append(f"  - {c.get('name')}: {c.get('mins')}m ({pct}%)")
    projects = day.get("projects") or []
    if projects:
        lines.append("projects:")
        for p in projects[:8]:
            name = p.get("name") or "(no project)"
            lines.append(f"  - {name}: {_fmt_mins(p.get('mins', 0))} · {p.get('sessions')} sessions")
            for a in (p.get("apps") or [])[:4]:
                lines.append(f"      {a.get('app')}: {_fmt_mins(a.get('mins', 0))}")
    focus = day.get("longestFocus") or {}
    if focus.get("mins"):
        lines.append(
            f"longest_focus: {_fmt_mins(focus.get('mins', 0))} · {focus.get('title') or '—'} · project={focus.get('project') or '—'}"
        )
    sessions = day.get("sessions") or []
    if sessions:
        lines.append("recent_sessions:")
        for s in sessions[-8:]:
            lines.append(
                f"  - {s.get('s')}–{s.get('e')} {s.get('app')} · {s.get('cat')} · {s.get('title') or '—'} · {_fmt_mins(s.get('mins', 0))}"
            )
    return "\n".join(lines)


def _answer_locally(prompt: str, day: dict[str, Any]) -> str:
    p = prompt.strip().lower()
    total = _fmt_mins(day.get("total", 0))
    sessions_n = len(day.get("sessions") or [])
    cats = day.get("categories") or []

    if re.search(r"\b(help|\?)\s*$", p) or p == "help":
        return (
            "Ask about your day in plain language. Try: “how much coding today?”, "
            "“top apps”, “summarize my day”, or “longest focus block”."
        )

    coding = next((c for c in cats if c.get("name") == "Coding"), None)
    coding_mins = coding.get("mins", 0) if coding else 0
    coding_pct = int(round((coding.get("pct") or 0) * 100)) if coding else 0

    if re.search(r"\b(coding|code|dev|develop)\b", p):
        if coding:
            return f"You spent {_fmt_mins(coding_mins)} coding ({coding_pct}% of {_fmt_mins(day.get('total', 0))} tracked)."
        return "No coding time is categorized for this day yet."

    if re.search(r"\b(longest|focus|deep\s*work)\b", p):
        focus = day.get("longestFocus") or {}
        if focus.get("mins"):
            proj = focus.get("project") or "—"
            title = focus.get("title") or "—"
            return f"Longest focus: {_fmt_mins(focus['mins'])} in {title} ({proj})."
        return "No focus blocks recorded for this day."

    if re.search(r"\b(top|most|apps?|applications?)\b", p):
        apps: dict[str, int] = {}
        for proj in day.get("projects") or []:
            for a in proj.get("apps") or []:
                apps[a["app"]] = apps.get(a["app"], 0) + int(a.get("mins", 0))
        if not apps:
            return "No app breakdown available for this day."
        ranked = sorted(apps.items(), key=lambda item: -item[1])[:5]
        parts = [f"{name} ({_fmt_mins(mins)})" for name, mins in ranked]
        return "Top apps: " + ", ".join(parts) + "."

    if re.search(r"\b(summar|overview|recap|bullet|today)\b", p):
        bullets = [f"• {_fmt_mins(day.get('total', 0))} tracked across {sessions_n} sessions."]
        if coding:
            bullets.append(f"• {_fmt_mins(coding_mins)} coding ({coding_pct}%).")
        for c in cats[:4]:
            if c.get("name") != "Coding":
                bullets.append(f"• {_fmt_mins(c.get('mins', 0))} {str(c.get('name', '')).lower()}.")
        focus = day.get("longestFocus") or {}
        if focus.get("mins"):
            bullets.append(f"• Longest focus {_fmt_mins(focus['mins'])} — {focus.get('title') or '—'}.")
        return "\n".join(bullets)

    if re.search(r"\b(project|repo)\b", p):
        projects = day.get("projects") or []
        if not projects:
            return "No project breakdown for this day."
        parts = []
        for proj in projects[:6]:
            name = proj.get("name") or "(no project)"
            parts.append(f"{name}: {_fmt_mins(proj.get('mins', 0))}")
        return "Projects: " + "; ".join(parts) + "."

    return (
        f"For {day.get('date')}, you tracked {total} across {sessions_n} sessions. "
        f"Ask about coding time, top apps, projects, longest focus, or say “summarize my day”."
    )


def ask_model() -> str:
    return os.environ.get("ECHO_ASK_MODEL") or os.environ.get("ECHO_OPENAI_MODEL") or ASK_MODEL


def _is_kimi_model(model: str) -> bool:
    name = model.lower()
    return name.startswith("kimi-") or name.startswith("moonshot-")


def _env_key(*names: str) -> str | None:
    for name in names:
        value = os.environ.get(name, "").strip()
        if value:
            return value
    return None


def _moonshot_api_key() -> str | None:
    return _env_key("ECHO_MOONSHOT_API_KEY", "MOONSHOT_API_KEY")


def _openai_api_key() -> str | None:
    return _env_key("ECHO_OPENAI_API_KEY", "OPENAI_API_KEY")


def _llm_api_key(model: str) -> str | None:
    if _is_kimi_model(model):
        return _moonshot_api_key()
    return _openai_api_key()


def _llm_base_url(model: str) -> str:
    override = os.environ.get("ECHO_LLM_BASE_URL", "").strip().rstrip("/")
    if override:
        return override
    if _is_kimi_model(model):
        return MOONSHOT_BASE_URL
    return OPENAI_BASE_URL


def llm_available() -> bool:
    return bool(_llm_api_key(ask_model()))


def _chat_request_body(model: str, prompt: str, day: dict[str, Any]) -> dict[str, Any]:
    context = _day_context(day)
    body: dict[str, Any] = {
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are Echo, a concise activity assistant. Answer using only the provided "
                    "day context. Use short paragraphs or bullets. Do not invent data."
                ),
            },
            {
                "role": "user",
                "content": f"Day context:\n{context}\n\nQuestion: {prompt}",
            },
        ],
    }
    if _is_kimi_model(model):
        body["thinking"] = {"type": "disabled"}
    else:
        body["temperature"] = 0.2
    return body


def _answer_with_llm(prompt: str, day: dict[str, Any]) -> str:
    model = ask_model()
    api_key = _llm_api_key(model)
    if not api_key:
        raise RuntimeError("no_api_key")

    base = _llm_base_url(model)
    body = _chat_request_body(model, prompt, day)
    url = f"{base}/chat/completions"
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(detail[:200] or exc.reason) from exc

    choices = payload.get("choices") or []
    if not choices:
        raise RuntimeError("empty response from model")
    message = choices[0].get("message") or {}
    text = (message.get("content") or "").strip()
    if not text:
        raise RuntimeError("empty answer from model")
    return text


def answer_prompt(prompt: str, day: dict[str, Any]) -> dict[str, Any]:
    text = (prompt or "").strip()
    if not text:
        raise ValueError("Enter a question about your day.")

    started = time.perf_counter()
    model = ask_model()
    has_key = llm_available()
    if has_key:
        answer = _answer_with_llm(text, day)
        source = "llm"
    else:
        answer = _answer_locally(text, day)
        source = "local"
        model = None

    elapsed_ms = round((time.perf_counter() - started) * 1000, 1)
    return {
        "answer": answer,
        "source": source,
        "model": model,
        "elapsed_ms": elapsed_ms,
        "llm_available": has_key,
    }
