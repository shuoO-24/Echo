# Echo — Technical Design

*Working name: **Echo** — your activity echoed back to you. The CLI binary ships as `ec` (the shell already owns `echo`); the product, menubar app, and `.app` bundle are all "Echo."*

A local-first daemon that captures laptop activity, remembers it as a session timeline, categorizes it, and learns to predict and pre-stage your workflows. Built metadata-only; the only thing that ever leaves the machine is normalized title text in a once-a-night labeling batch.

Companion diagram: `file://session/activity-monitor-architecture.html` (open in a browser tab).

---

## 1. Mental model

It's a feature pipeline where the entity being predicted is *you*. Same shape you'd build for any ML system, which is exactly why it reads well as AI-infra portfolio work.

```
Sensors → Collector → Store → Sessionize → Categorize → Features → Models → Actions
 (taps)   (ingest)  (DuckDB)  (segment)   (label)     (build)   (predict)(automate)
```

Six layers map to the four asks:

| Ask | Layers |
|---|---|
| Monitor | Sensors + Collector |
| Remember | Store (raw + rollups) |
| Categorize | Sessionize + Categorize |
| Predict / automate | Features + Models + Action runner |

Design invariants that hold across every layer:
- **Metadata, never content.** Titles and counts, not keystrokes.
- **Local by default.** Raw data never leaves disk; only title strings go to the cloud labeler.
- **Event-driven, not polling.** The daemon must be invisible on CPU and battery.
- **Suggest, then act on confirm.** No automation fires unprompted on a noisy signal.

---

## 2. Sensors (macOS)

Each sensor emits a small normalized record on change, plus a low-frequency heartbeat for the currently-focused window so long sessions aren't invisible.

| Signal | Source API | Why it matters |
|---|---|---|
| Foreground app + window title | `NSWorkspace.didActivateApplicationNotification` + Accessibility (`AXUIElement`) for title | single highest-signal stream |
| Active tab URL + page title | browser extension → native messaging host | window titles alone are weak for browser work |
| Idle / active | `CGEventSource.secondsSinceLastEventType` | needed to cut sessions |
| Keystroke + mouse **counts** | `CGEventTap` (listen-only), aggregated per interval | activity intensity without keylogging |
| Shell / git context | `precmd`/`preexec` zsh hook → cwd, repo, branch, command class | huge for dev-workflow inference |
| Meeting state | EventKit (calendar) + CoreAudio mic-in-use flag | "in a meeting" is a strong, clean category |
| Files opened | FSEvents on a watchlist | optional, noisy — gate behind a flag |

Capture rules:
- **Permissions:** Accessibility + Input Monitoring prompts on first run. Document this; it's the main install friction.
- **Sampling:** fire on focus-change events; heartbeat every 5–15s while a window stays focused. No high-frequency polling.
- **Redaction at the edge:** the `CGEventTap` only ever increments counters — it never buffers key codes. Titles are normalized (trim, lowercase host, strip query strings) before they're written.

---

## 3. Collector (ingest)

One lightweight daemon. Responsibilities:

1. Drain the in-process sensor queue.
2. **Debounce** focus churn (Alt-Tab storms collapse to the window you actually land on, e.g. ignore focuses shorter than ~800ms).
3. **Normalize + redact**: strip URL paths to host, drop anything content-shaped, stamp `ts` in UTC.
4. Append to the store.

Start with an in-process channel (Go channel / Python `queue.Queue` / asyncio queue). Only introduce a real broker (NATS/Redis Streams/Kafka) if you specifically want the streaming story for interviews — functionally it buys nothing at single-user scale.

---

## 4. Store (DuckDB)

Local, columnar, zero-ops, embeds in-process. Fast at the analytical "how much time on X last week" queries that are the whole point.

### `raw_events` — wide, append-only, 30–90 day retention

| Column | Type | Notes |
|---|---|---|
| `ts` | TIMESTAMP | UTC, event time |
| `app` | TEXT | foreground app bundle id |
| `window_title` | TEXT | normalized; highest-signal field |
| `url_host` | TEXT | host only, never full path (privacy) |
| `repo` | TEXT | from shell hook when in a repo |
| `branch` | TEXT | "" |
| `idle` | BOOLEAN | derived from idle timer |
| `kb_count` | INT | keystroke count this interval — never keys |
| `mouse_count` | INT | mouse events this interval |
| `in_meeting` | BOOLEAN | calendar + mic-in-use |
| `source` | TEXT | which sensor emitted it |

### `sessions` — derived (see §5)

`(session_id, start_ts, end_ts, app, primary_title, repo, category, summary, label_source, kb_total, mouse_total, switch_count)`

### `daily_rollups` — aggregates, kept forever

Per `(date, category, app)`: total active minutes, session count, switch count. This is the offline-store analogue: raw events age out, rollups are the permanent record.

### `label_cache` — see §5

`(title_norm TEXT PRIMARY KEY, category TEXT, summary TEXT, source TEXT, decided_at TIMESTAMP)`

Retention job runs nightly: delete `raw_events` older than the window after rollups are computed.

---

## 5. Categorize (two stages)

### Stage A — Sessionize

Collapse the raw event stream into sessions, the unit everything downstream operates on.

Cut a new session when **any** of:
- idle gap > `N` minutes (start with N=5), or
- foreground app changes, or
- within the same app, the "work context" changes (repo change; URL host change; title distance over a threshold).

Merge rule: ignore sub-`M`-second flickers (M≈30) back to the prior context so a quick Slack glance mid-coding doesn't shatter the session. Each session carries aggregates (`kb_total`, `switch_count`, duration) used later as features.

### Stage B — Label

Two tiers, cheap-to-expensive, with a cache that makes the expensive tier nearly free.

**Tier 1 — rules (handles ~80–90%).** A lookup table of `(app, title regex) → category`:

```
Xcode | iTerm | VS Code            → Coding
Calendar app | in_meeting=true     → Meeting
Slack | Mail | Messages            → Comms
Chrome + (docs|stackoverflow|arxiv)→ Research
Chrome + (youtube|twitter|reddit)  → Distraction
```

**Tier 2 — cloud LLM for the rules-miss (~10–20%).** Once a night, batch the unlabeled sessions to an LLM API (OpenAI / Anthropic). Send **only** `app + normalized title`; get back `{category, one-line summary}`. Cents a day at most.

**The cache is the trick.** Before calling the LLM, look up `title_norm` in `label_cache`. On miss, call; write the result back. After a few weeks the cache covers almost every recurring title, so live API calls trend toward zero. Categories stay a fixed enum you control (the LLM picks from the list, it doesn't invent labels).

Output: a clean, labeled session timeline. That alone is the product — a private RescueTime you own.

---

## 6. Features + Models (predict)

Only worth building after a few weeks of labeled sessions. All classical, all local, nothing to host.

### Feature builder

Per session (or per time-slice), build a feature row:
- time-of-day bucket, day-of-week, weekend flag
- previous N session categories (the transition context)
- current repo / app
- recent switch rate, recent idle ratio

### Models

| Target | Method | Notes |
|---|---|---|
| Next-context | Markov chain or gradient-boosted classifier on transitions | "after standup you usually open the deploy repo" |
| Routine detection | sequential pattern mining (PrefixSpan) | finds frequent sequences like `open repo → run tests → Slack` |
| Focus / anomaly alerts | rolling switch-rate threshold | flags context-switch storms in real time |

`scikit-learn` covers the classifier; PrefixSpan via `prefixspan`. No deep learning, no GPU, no model serving.

---

## 7. Action runner (automate)

The dangerous layer. Every automation is gated behind a confirmation until it's earned trust.

- Pre-open your standup tabs at 9:45.
- Auto-enable Focus / DND when a deep-work session is detected.
- Draft an end-of-day worklog from the session timeline.
- Surface "you usually do X now" nudges.

**Hard rule:** suggest, then act on confirm. An automation that fires unprompted on a noisy signal is worse than no automation. Promote an action from "suggest" to "auto" only after it's been confirmed enough times to trust.

---

## 8. Deployment & form factor

It is **not** a single Mac app. It's a background daemon plus a thin viewer. The daemon is the product; the "app" is just how you look at the data.

### What actually runs

| Piece | Form | How it runs |
|---|---|---|
| Collector daemon | headless, no window, no dock icon | `launchd` user agent (`~/Library/LaunchAgents/*.plist`, `RunAtLoad` + `KeepAlive`) |
| Browser extension | WebExtension inside Chrome/Safari | rides in the browser; talks to the daemon via a native messaging host |
| Store | single DuckDB file | on disk, e.g. `~/Library/Application Support/Echo/echo.duckdb` |
| Nightly jobs (rollups, retention, LLM labeling) | scripts | `launchd` `StartCalendarInterval`, or a timer inside the daemon |
| Viewer | see below | the only user-facing surface |

The daemon is always-on and invisible. Everything else is optional polish.

### Viewer — pick one, cheapest first

1. **CLI** (week 1). `ec today` prints the breakdown. Zero UI code. Ship this first. (Binary is `ec`, not `echo` — the shell builtin owns that name.)
2. **Menubar app** (natural home). Top-bar icon showing current category; click for today's timeline and any pending action confirmations. Most Mac-native. SwiftUI `MenuBarExtra`, or Python + `rumps`.
3. **Local web page** (richest). Daemon serves `localhost:7000`; open in a browser for charts and the full timeline. Best visuals, least "native app" feel.

### Why the menubar wins eventually

The action layer (§7) needs somewhere to surface a confirmation prompt ("open standup tabs?", "enable DND?"). A menubar app is the clean home for those — a CLI can't prompt, a web page isn't always open. So the likely end state is: **launchd daemon + browser extension + menubar app**, with the web page as an optional deep-dive dashboard.

Packaging: ship the daemon + menubar as one signed `.app` bundle that installs the launch agent on first run. The browser extension installs separately from the store. No App Store review needed for a personal/notarized build, but the Accessibility + Input Monitoring permission prompts (§11) are unavoidable.

---

## 9. Build order

Ship something useful in week 1. The labeled timeline is the product; prediction is the bonus.

| Phase | Deliverable | Proves |
|---|---|---|
| Week 1 | Focus watcher → DuckDB → `ec today` "where did my time go" CLI | the pipeline works end to end |
| Week 2 | Sessionizer + rules labels + daily timeline view | usable product |
| Week 3+ | Nightly cloud-LLM pass + cache for rules-miss sessions | auto-categories without hand-listing every app |
| Later | Feature builder + transition model + first single automation (worklog draft) | the predict/automate layer earns trust |

---

## 10. Stack

| Layer | Choice | Rationale |
|---|---|---|
| Sensor daemon | Swift, or Python + `pyobjc` | Swift for clean native-API access; Python if you want to move faster |
| Browser tab | WebExtension + native messaging host | only way to get reliable URLs |
| Bus | in-process queue | broker only for the Kafka interview story |
| Store / compute | DuckDB | columnar, zero-ops, embedded |
| Rules | regex table in code/config | boring, fast, debuggable |
| LLM labeler | OpenAI / Anthropic API, nightly batch | no model to host; cents/day; cache → ~zero |
| Models | scikit-learn + `prefixspan` | classical, local, no serving |
| UI | local web page reading DuckDB, or a menubar app | timeline + daily worklog |

---

## 11. Privacy posture (the load-bearing decision)

- Keystrokes are **counted, never recorded.** The event tap increments integers and discards key codes.
- URLs stored as **host only**, never full path or query string.
- **Raw events never leave the machine.** The single network egress is the nightly labeler, which sees only `app + normalized title` — and only for cache-miss sessions.
- Everything is on local disk in a single DuckDB file you can delete.

Decide this explicitly before adding any sensor that widens the surface (full URLs, file contents, OCR of the screen). The metadata-only line is what makes the tool usable instead of creepy.

---

## 12. Risks

- **Permissions friction:** Accessibility + Input Monitoring prompts scare people. Document why each is needed.
- **Battery/CPU:** event-driven not polling; profile the daemon, it must be near-invisible.
- **Cold start:** rules carry you until there's enough labeled data for models. Don't build models early.
- **Sessionizer tuning:** N (idle gap) and M (flicker merge) need a few days of real data to feel right. Make them config, not constants.
- **Scope creep:** the timeline is the product. Resist building prediction before the timeline is genuinely useful.
