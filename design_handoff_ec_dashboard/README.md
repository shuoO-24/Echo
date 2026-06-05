# Handoff: Echo desktop dashboard — `ec://` terminal redesign

## Overview
A redesign of Echo's local desktop viewer (the page served on `localhost:7000`). It replaces the
plain blue dashboard with a **monospace "terminal" aesthetic** in a warm terracotta palette, with
four views (`today`, `timeline`, `projects`, `activity`), a live-streaming raw-event feed, a
light/dark ("paper"/dark) theme toggle, and per-app icon tiles.

This bundle is the design reference. There is also an **app icon** (the "Ripple" mark) included.

## About the design files
The files in `prototype/` are **design references created in HTML/React (Babel-in-browser)** — they
demonstrate the intended look, layout, and behavior. They are **not** meant to be shipped verbatim.
The task is to **recreate this UI inside Echo's existing desktop viewer**, which already serves HTML
over a small HTTP server (`localhost:7000`) and renders it in pywebview / the browser.

Because Echo already serves HTML, you have two realistic integration routes (see **Integration**).
Either way, the single most important step is replacing the prototype's mock data object
(`window.ECHO`, defined in `prototype/data.js`) with **real JSON from Echo's backend** — the shape
to expose is specified under **Data contract** below.

## Fidelity
**High-fidelity.** Colors, typography, spacing, radii, and interactions are final and exact. Recreate
pixel-for-pixel. All tokens are listed under **Design tokens**. The prototype is built at a fluid width
(max 1380px, centered) and is responsive down to ~1000px.

---

## Integration

Echo's viewer already serves HTML, so prefer the lightest path that fits your team.

### Route A — Static page served by the existing HTTP server (fastest)
1. Build the dashboard as a static HTML/CSS/JS bundle and serve it from the existing
   `localhost:7000` server (the same place today's UI is served).
2. Replace `window.ECHO` (mock) with a `fetch()` of the **Data contract** endpoints.
3. **Precompile the JSX.** The prototype loads React + Babel from a CDN and transforms JSX in the
   browser — fine for a design preview, not for production (no network at rest, slow first paint).
   Either (a) precompile the `.jsx` with esbuild/Vite into a single `app.js`, or (b) rewrite the
   components in plain JS / your preferred framework. No build server is required — a single
   pre-bundled `.js` file served statically is enough.

### Route B — Recreate in a component framework
If you'd rather own it as components, port the four views into React/Vue/Svelte using the
documentation here. The prototype's component split is a good map:
- `ec-app.jsx` → app shell: theme state, live-stream loop, header/prompt nav, tweak controls.
- `ec-views.jsx` → the views + `AppIcon` + `Panel` primitives (TodayView embeds the ASK query box).
- `ec-query.jsx` → the `query` tab + ASK box: the SQL console and its read-only interpreter.
- `shared.jsx` → `DayStrip` / `HourAxis` (timeline band helpers).

In both routes, **category colors are computed on the client** from a fixed name→color map (below);
the backend only needs to send the category *name* (`Coding`, `Meeting`, `Comms`, `Research`,
`Distraction`).

---

## Data contract

Replace `window.ECHO` with these endpoints. All durations are **integer minutes**; `start`/`end` and
`dayStart`/`dayEnd` are **minutes from local midnight** (e.g. `08:28` → `508`). This mirrors the
fields already present in `prototype/data.js`.

### `GET /api/day?date=YYYY-MM-DD`
Powers `today`, `timeline`, and `projects`.
```json
{
  "date": "2026-06-03",
  "dateLong": "Tuesday, June 3",
  "dayStart": 508,
  "dayEnd": 1029,
  "totals": { "tracked_min": 460, "sessions": 14, "kb": 25172, "ms": 7532 },
  "categories": [
    { "name": "Coding", "mins": 305 },
    { "name": "Meeting", "mins": 52 },
    { "name": "Comms", "mins": 46 },
    { "name": "Research", "mins": 39 },
    { "name": "Distraction", "mins": 18 }
  ],
  "longestFocus": { "mins": 88, "title": "collector.py", "project": "echo" },
  "projects": [
    {
      "name": "echo",
      "mins": 217,
      "sessions": 4,
      "apps": [{ "app": "Cursor", "mins": 217 }],
      "cats": [{ "cat": "Coding", "mins": 217 }]
    }
  ],
  "sessions": [
    {
      "start": 508, "end": 531,
      "app": "Cursor", "title": "features_to_redis.py",
      "project": "tracer", "cat": "Coding",
      "kb": 1840, "ms": 410
    }
  ]
}
```
Notes:
- `project` is `null` for non-project work; the UI renders it as `(no project)`.
- `categories` should be ordered largest-first (or by the canonical order above); the UI sorts
  projects' `apps`/`cats` largest-first itself.
- `title` is the parsed window title (the file/page); `app` is the foreground app name.

### `GET /api/activity?date=YYYY-MM-DD&limit=48`  (and live polling)
Powers the `activity` feed and the `today` "LIVE" preview. Returns **collapsed raw events,
newest first**. The prototype polls every ~2s when live is on (matches the real app's behavior);
a WebSocket/SSE push is a fine substitute.
```json
[
  { "t": "17:09:48", "app": "Notion", "win": "Sprint notes", "cat": "Comms", "kb": 24, "ms": 6 },
  { "t": "17:09:31", "app": "Cursor", "win": "collector.py",  "cat": "Coding", "kb": 88, "ms": 12 }
]
```
- `t` is a wall-clock `HH:MM:SS` string. `kb`/`ms` are the keystroke/mouse counts in that
  collapsed window. `win` is the window title.

### `POST /api/query`  (body: `{ "sql": "select …" }`)
Powers the `query` tab and the embedded **ASK** box on `today`. Run the SQL **read-only** against
`echo.duckdb` (a read-only connection / `SET access_mode='READ_ONLY'`; reject anything that isn't a
single `SELECT`). Return columns in declared order plus row objects:
```json
{
  "columns": [
    { "name": "app", "type": "text" },
    { "name": "mins", "type": "integer" }
  ],
  "rows": [
    { "app": "Cursor", "mins": 305 },
    { "app": "Zoom", "mins": 52 }
  ],
  "elapsed_ms": 3.2
}
```
- The UI right-aligns numeric columns and renders `start`/`end` as `HH:MM`. On a SQL error return
  HTTP 400 `{ "error": "…", "hint": "…" }`; the console prints it in red.
- Expose `sessions` (and optionally the raw `events`) as the queryable table(s). The prototype's
  column set is the contract: `app, cat, project, title, mins, kb, ms, start, end`.

### Control endpoints (header controls)
- `GET  /api/collector/status` → `{ "running": true }` (drives the status pill).
- `POST /api/collector/start` / `POST /api/collector/stop` → toggles the collector (the
  "collector running/stopped" pill is clickable; stopping pauses the live stream).
- `POST /api/sessions/rebuild` → re-runs sessionization (the existing "Rebuild sessions" action).
- Date nav `‹ ›` just refetches `/api/day` and `/api/activity` for the new date.

---

## Screens / Views

The app shell is a faux window: a chrome bar (traffic lights + **Ripple icon** + `echo` wordmark +
theme toggle), then a **prompt nav** row, then the active view. Content max-width 1380px, centered,
22px side padding.

### Prompt nav (persistent header)
- Left: `~/echo` (dim) · `$` (green) · `ec` (fg) · then the five commands
  `today | timeline | projects | query | activity` as clickable tabs. Active tab = accent background,
  `--bg` colored text, 4px radius. A blinking block cursor trails the row. When on `activity` with
  live on, a `--live` flag (accent) appears.
- Right cluster (dim, mono): clickable **collector** pill (green dot = running / red dot + red text
  = stopped), date `‹ 2026-06-03 ›`, `kb {n} · ms {n}` running totals, and a live `HH:MM:SS` clock.

### 1. `today` (default)
- **Headline row:** big total `7h 40m` + `tracked ·` + big `14` + `sessions ·` + accent `66% coding`;
  right-aligned dim `longest focus 1h 28m · collector.py`. Big numbers are `font-size: 2.8×` base,
  `letter-spacing:-0.03em`, `white-space:nowrap`.
- **Grid 1.55fr / 1fr:**
  - **ACTIVITY panel** — category rows: `name` (100px) · ASCII bar (`█` filled, `·` empty, 24 cells,
    in the category color, `letter-spacing:-1px`) · `mins` (right, 52px) · `pct%` (dim, right, 46px).
    Below: `day · 08:28–17:09` label, then an **ASCII day strip** — 58 `▇` glyphs, each colored by the
    category active at that slice of the working window (idle = `--line`), with `08/10/12/14/16` ticks.
  - **LIVE panel** — header right link `ec activity ▸` (switches view). Shows the 7 newest feed rows
    (see Activity row spec), then `● live`/`◌ paused` + blinking cursor.
- **Bottom row — `minmax(0,1.72fr) minmax(0,1fr)` grid, `align-items:start`:**
  - **ASK (left, wider)** — a heading `▸ ASK  query your day · read-only SQL`, then an embedded
    **compact** QUERY console (same component as the `query` tab; see view 4 below). On the home page
    it does NOT autofocus, the scrollback is capped at 210px, and only 3 example chips show.
  - **PROJECTS (right, narrower)** — a Panel (`▸ PROJECTS`, right header `time · sessions`) with the
    projects **stacked vertically** (one per row, divider between). Each: a `1fr auto` header grid
    (`◆ name` accent / `◇ (no project)` dim  ——  `mins · Ns`), a 6px stacked category bar, then app
    rows as `1fr auto` grids (`├─`/`└─` tree glyph + **AppIcon** + name  ——  mins). NB: use a `1fr auto`
    grid (not flex `space-between`) for these rows so names don't collapse in the narrow column.

### 2. `timeline`
- **TIMELINE panel:** a 30px solid day band (each session positioned by `start`/`end` within
  `dayStart..dayEnd`, colored by category). Hovering a session row **or** a band block outlines the
  block (`2px solid var(--fg)`). `08:00…16:00` ticks below.
- Then grouped **project → category → sessions**: project header (`◆ name`, `mins · N sessions`),
  category subhead (`▸ coding · 3h 37m` in category color), then session rows with a category-colored
  2px left border: `start → end` (116px) · **AppIcon** + app (132px) · title (flex, dim, ellipsis) ·
  duration (right, 54px). Rows highlight on hover.

### 3a. `query`  (and the embedded ASK box on `today`)
A small **read-only SQL console** over the `sessions` table. Header `▸ QUERY` / right `read-only ·
echo.duckdb`. A scrollback area of past commands + results, then an input line (`$` green prompt,
accent caret) and a row of clickable example-query chips + a `help` link.
- **Mechanics:** Enter runs; **↑/↓** recalls command history; clicking a chip runs it; `N rows · Xms`
  footer under each result; new results scroll the scrollback to the bottom (set `scrollTop`, never
  `scrollIntoView`).
- **Supported grammar** (parsed client-side in the prototype; in production back this with a real
  read-only DuckDB query — see the `/api/query` contract): `select <cols|aggregates> from sessions
  [where <col> <op> <val> [and …]] [group by <col>] [order by <col|alias> [asc|desc]] [limit n]`.
  Ops: `= != > < >= <= like`. Aggregates: `sum() count() avg() min() max()`, optional `as alias`.
  Columns: `app, cat (category), project, title, mins (duration), kb, ms, start, end`. `start/end`
  render as `HH:MM`. Plus meta commands: `help`, `schema` (lists columns + types), `clear`.
- **Result table:** monospace, accent column headers, 1px `--line` row borders, numeric columns
  right-aligned + `tabular-nums` + `toLocaleString()`. Errors print red (`✗ message` + `↳ hint`).
- **Production note:** the prototype ships a tiny in-browser interpreter (`ec-query.jsx`) purely so the
  design is live without a backend. Replace `runQuery()` with a POST to `/api/query` that runs the SQL
  read-only against `echo.duckdb` and returns `{columns, rows}`; keep the parser only as input hints.

### 3b. `projects`
- One **Panel per project** (title = project name, right = `mins · N sessions`). Body is a 2-column
  grid: **categories** (label + ASCII bar + mins) and **apps** (AppIcon + app + faded ASCII bar + mins).

### 4. `activity` (live)
- Control row: clickable **live: on/off** chip (`●` green when streaming / `◌` dim), `polling every
  1.6s`, `now ▸ {app} · {cat} · {win}`, right-aligned `kb · ms` totals.
- **ACTIVITY — RAW EVENTS panel** (`max-height: 58vh`, scrolls). Each row: category-colored 3px left
  stripe, `t` (70px, dim) · **AppIcon** (20px) · app (128px) · win (flex, dim, ellipsis) · `kb`
  (right, 60px) · `ms` (right, 56px). Newest row animates in (`ecin`, fade + 3px slide). Footer:
  `$ watching…` + blinking cursor; if collector stopped, shows an `ec start` link.

---

## Interactions & Behavior
- **Tab switching:** instant view swap (no transition needed).
- **Live stream:** when `live && collector`, every `liveSpeed` ms (default 1600), prepend a generated
  event, advance the clock 1–4s, and increment kb/ms totals. Cap the feed array (~48). In production,
  replace the generator with the polling/SSE feed from `/api/activity`.
- **Collector pill:** toggles running state; stopping pauses the stream and changes the footer.
- **Theme toggle:** `☾ dark` / `☀ light` in the chrome swaps the whole palette via CSS variables.
- **Hover:** feed/session/project rows lift to `--panel2`; timeline session hover outlines its band
  block. Tab and action items brighten on hover.
- **Blinking cursor:** `@keyframes ecblink` (1.1s step-end). New-feed-row entrance: `@keyframes ecin`.

## State management
- `view`: `'today' | 'timeline' | 'projects' | 'query' | 'activity'`
- `collector: boolean`, `live: boolean` (stream runs only when both true)
- `feed: Event[]` (newest first, capped), `clock: number` (seconds), `kb: number`, `ms: number`
- `flash: number | null` (timeline session index currently highlighted)
- Tweak state (persisted): `accent`, `font`, `density`, `dark`, `liveSpeed`, `scanlines`
- Data fetching: `/api/day` on date/view change; `/api/activity` polled while live; control POSTs.

## Design tokens

### Theme — dark
`--bg #0b0c0e` · `--panel #101214` · `--panel2 #15181b` · `--fg #cfcabf` · `--dim #6a655c` ·
`--faint #46433d` · `--line #23262a` · green `oklch(0.76 0.13 158)` · red `oklch(0.66 0.18 25)`

### Theme — light ("paper")
`--bg #efe9df` · `--panel #f7f2e9` · `--panel2 #efe8db` · `--fg #2b2722` · `--dim #8a8175` ·
`--faint #b4ab9c` · `--line #ddd3c4` · green `oklch(0.55 0.13 158)` · red `oklch(0.55 0.2 25)`

### Accent (terracotta, default `#d2693f`)
Tweak options: `#d2693f` `#cf4f3e` `#3f86d2` `#3fa56b` `#9a6ad6` `#c9a227`.
**Coding's category color is always the current accent** — so changing the accent reskins the
primary data color and the Ripple icon together.

### Category colors (name → color; `Coding` = accent)
- Dark: Meeting `oklch(0.76 0.13 158)` · Comms `oklch(0.74 0.12 248)` · Research `oklch(0.74 0.13 300)` · Distraction `oklch(0.82 0.13 82)`
- Light: Meeting `oklch(0.58 0.12 158)` · Comms `oklch(0.56 0.13 248)` · Research `oklch(0.55 0.14 300)` · Distraction `oklch(0.66 0.13 75)`

### App icon tiles (background / text). Mono initials, original — NOT the real brand logos.
Cursor `#2b2926`/`#ece7dd` (`Cu`) · Google Chrome `#4f74d6`/`#fff` (`Ch`) · Slack `#7c5cc4`/`#fff`
(`Sl`) · Zoom `#2f8fd6`/`#fff` (`Zm`) · Notion `#37342e`/`#efe9df` (`No`) · Terminal `#16181a`/`#7bbf63`
(`Te`). Tile radius `= size × 0.29`, mono bold, `inset 0 0 0 1px rgba(255,255,255,.07)`.

### Typography
- Mono: **JetBrains Mono** (default), IBM Plex Mono, Space Mono. The whole UI is monospace.
- Density (base font / row padding / stack gap): compact `12 / 5 / 9` · regular `13 / 7 / 12` ·
  comfy `14.5 / 10 / 15`. Headline numbers = base × 2.8.

### Radii / misc
Panels `7px`, app tiles `size×0.29`, app-icon squircle `23%`. Panel border `1px solid var(--line)`.
Optional CRT scanline overlay (tweak, off by default).

## Assets
- **App icon ("Ripple"):** concentric terracotta arcs radiating from a bright source dot on a dark
  squircle. Full spec + 4 concepts in `prototype/Echo App Icon.html`. The in-app favicon is an inline
  SVG data-URI in the `<head>` of `Echo — ec Terminal.html`; the chrome mark is the `RippleMark`
  component in `ec-app.jsx`. Both follow the accent. Export to `.icns`/PNG (1024→16) when you ship.
- **App-tile glyphs:** drawn in-app (`AppIcon` in `ec-views.jsx`) — no image files. If you want
  true-to-brand logos later, swap the tile contents; keep the same size/rounding.
- No other external image assets.

## Files
- `prototype/Echo — ec Terminal.html` — entry point; load order + favicon live here.
- `prototype/ec-app.jsx` — app shell, theme/live state, header, `RippleMark`, tweak controls.
- `prototype/ec-views.jsx` — `TodayView` (incl. the embedded ASK box + stacked Projects), `TimelineView`, `ProjectsView`, `ActivityView`, `Panel`, `AppIcon`.
- `prototype/ec-query.jsx` — `QueryView` + the read-only SQL interpreter (`runQuery`); replace with the `/api/query` call in production.
- `prototype/shared.jsx` — `DayStrip`, `HourAxis` timeline helpers.
- `prototype/data.js` — **the mock `window.ECHO`; use it as the exact reference for the JSON shape.**
- `prototype/tweaks-panel.jsx` — the in-design tweak controls (design-tool only; drop in production).
- `prototype/Echo App Icon.html` — app icon concepts + the chosen Ripple spec.

To preview the prototype: open `prototype/Echo — ec Terminal.html` in a browser (needs internet for
the CDN React/Babel + Google Fonts).
