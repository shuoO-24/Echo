/* Echo ec:// terminal dashboard — vanilla JS, design handoff v1 */

const THEMES = {
  dark: {
    bg: "#0b0c0e",
    panel: "#101214",
    panel2: "#15181b",
    fg: "#cfcabf",
    dim: "#6a655c",
    faint: "#46433d",
    line: "#23262a",
    green: "oklch(0.76 0.13 158)",
    red: "oklch(0.66 0.18 25)",
  },
  light: {
    bg: "#efe9df",
    panel: "#f7f2e9",
    panel2: "#efe8db",
    fg: "#2b2722",
    dim: "#8a8175",
    faint: "#b4ab9c",
    line: "#ddd3c4",
    green: "oklch(0.55 0.13 158)",
    red: "oklch(0.55 0.2 25)",
  },
};

const APP_META = {
  Cursor: { a: "Cu", bg: "#2b2926", fg: "#ece7dd" },
  "Google Chrome": { a: "Ch", bg: "#4f74d6", fg: "#ffffff" },
  Slack: { a: "Sl", bg: "#7c5cc4", fg: "#ffffff" },
  Zoom: { a: "Zm", bg: "#2f8fd6", fg: "#ffffff" },
  Notion: { a: "No", bg: "#37342e", fg: "#efe9df" },
  Terminal: { a: "Te", bg: "#16181a", fg: "#7bbf63" },
};

const DENSITY = {
  compact: { fs: 12, pad: 5, gap: 9 },
  regular: { fs: 13, pad: 7, gap: 12 },
  comfy: { fs: 14.5, pad: 10, gap: 15 },
};

const state = {
  view: "today",
  date: new Date().toISOString().slice(0, 10),
  E: null,
  feed: [],
  collector: false,
  live: true,
  flash: null,
  kb: 0,
  ms: 0,
  clock: "",
  dark: false,
  accent: "#d2693f",
  font: "JetBrains Mono",
  density: "regular",
  liveSpeed: 1600,
  pollTimer: null,
  clockTimer: null,
};

function catColors(accent, dark) {
  return dark
    ? {
        Coding: accent,
        Meeting: "oklch(0.76 0.13 158)",
        Comms: "oklch(0.74 0.12 248)",
        Research: "oklch(0.74 0.13 300)",
        Distraction: "oklch(0.82 0.13 82)",
        Uncategorized: "var(--dim)",
      }
    : {
        Coding: accent,
        Meeting: "oklch(0.58 0.12 158)",
        Comms: "oklch(0.56 0.13 248)",
        Research: "oklch(0.55 0.14 300)",
        Distraction: "oklch(0.66 0.13 75)",
        Uncategorized: "var(--dim)",
      };
}

function bar(frac, w = 22) {
  const filled = Math.max(0, Math.round(frac * w));
  return "█".repeat(filled).padEnd(w, "·");
}

function fmtMins(m) {
  const total = Math.round(m);
  const h = Math.floor(total / 60);
  const mm = total % 60;
  if (h === 0) return `${mm}m`;
  return `${h}h ${String(mm).padStart(2, "0")}m`;
}

function fmtClock(mins) {
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

function pacificTimeString() {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date());
}

function timelineHourTicks(dayStart, dayEnd) {
  const startH = Math.floor(dayStart / 60);
  const endH = Math.min(23, Math.ceil(dayEnd / 60));
  const ticks = [];
  for (let h = startH; h <= endH; h += Math.max(1, Math.floor((endH - startH) / 4))) {
    ticks.push(`${String(h).padStart(2, "0")}:00`);
  }
  if (!ticks.length) ticks.push("00:00");
  return ticks;
}

function esc(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function appIconFallbackEl(app, size) {
  const m = APP_META[app] || { a: (app || "?").slice(0, 2), bg: "#5a564e", fg: "#fff" };
  const r = size * 0.29;
  const el = document.createElement("span");
  el.className = "ec-app-icon ec-app-icon-fallback";
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.style.borderRadius = `${r}px`;
  el.style.background = m.bg;
  el.style.color = m.fg;
  el.style.fontSize = `${size * 0.5}px`;
  el.textContent = m.a;
  return el;
}

window.ecOnIconError = function (img) {
  img.onerror = null;
  const app = img.dataset.app || "";
  const size = Number(img.dataset.size) || 18;
  img.replaceWith(appIconFallbackEl(app, size));
};

function appIcon(app, size = 18) {
  const px = Math.max(16, Math.min(128, Math.round(size * 2)));
  const src = `/api/icon?app=${encodeURIComponent(app || "")}&size=${px}`;
  const r = size * 0.29;
  const safeApp = esc(app || "");
  return `<img class="ec-app-icon" data-app="${safeApp}" data-size="${size}" src="${src}" width="${size}" height="${size}" alt="" loading="lazy" style="border-radius:${r}px;object-fit:contain;flex:0 0 auto;display:block" onerror="ecOnIconError(this)" />`;
}

function rippleMark(size = 20, color = "#d2693f") {
  const r = size * 0.29;
  return `<span class="ec-ripple" style="width:${size}px;height:${size}px;border-radius:${r}px"><svg viewBox="0 0 100 100" width="${size}" height="${size}"><g fill="none" stroke-linecap="round"><circle cx="32" cy="70" r="20" stroke="${color}" stroke-width="7"/><circle cx="32" cy="70" r="38" stroke="${color}" stroke-width="6" opacity="0.6"/><circle cx="32" cy="70" r="56" stroke="${color}" stroke-width="5" opacity="0.3"/></g><circle cx="32" cy="70" r="7" fill="#f0a877"/></svg></span>`;
}

async function fetchJson(path, options) {
  const res = await fetch(path, options);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

function attachEchoHelpers(E) {
  E.fmtMins = fmtMins;
  E.fmtClock = fmtClock;
  return E;
}

function asciiStrip(E, CD, cols = 58) {
  const span = E.dayEnd - E.dayStart || 1;
  let html = "";
  for (let i = 0; i < cols; i++) {
    const time = E.dayStart + (i / cols) * span;
    const s = E.sessions.find((x) => time >= x.start && time < x.end);
    const color = s ? CD[s.cat] : "var(--line)";
    html += `<span style="color:${color}">▇</span>`;
  }
  return html;
}

function panel(title, right, body, extra = "") {
  return `<div class="ec-panel" ${extra}>
    <div class="ec-panel-head"><span class="ec-panel-title">▸ ${esc(title)}</span><span class="ec-panel-right">${right || ""}</span></div>
    <div class="ec-panel-body">${body}</div></div>`;
}

function renderToday(E, CD, dens) {
  const tz = E.timezone || "PT";
  const codingPct = E.categories.find((c) => c.name === "Coding");
  const pctCoding = codingPct ? Math.round(codingPct.pct * 100) : 0;
  const headline = `
    <div style="display:flex;align-items:baseline;gap:16px;flex-wrap:wrap;padding:6px 2px 2px">
      <span style="font-size:${dens.fs * 2.8}px;letter-spacing:-0.03em;white-space:nowrap">${fmtMins(E.total)}</span>
      <span style="color:var(--dim)">tracked ·</span>
      <span style="font-size:${dens.fs * 2.8}px;letter-spacing:-0.03em;white-space:nowrap">${E.sessions.length}</span>
      <span style="color:var(--dim)">sessions ·</span>
      <span style="color:var(--accent);font-size:${dens.fs * 1.4}px">${pctCoding}% coding</span>
      <span style="color:var(--dim);margin-left:auto;font-size:${dens.fs}px">longest focus ${fmtMins(E.longestFocus.mins)} · ${esc(E.longestFocus.title || "—")}</span>
    </div>`;

  const catRows = E.categories
    .map(
      (c) => `<div style="display:flex;align-items:center;gap:14px">
      <span style="width:100px">${esc(c.name.toLowerCase())}</span>
      <span style="color:${CD[c.name]};letter-spacing:-1px;flex:1;white-space:nowrap;overflow:hidden">${bar(c.pct, 24)}</span>
      <span style="width:52px;text-align:right">${c.mins}m</span>
      <span style="width:46px;text-align:right;color:var(--dim)">${Math.round(c.pct * 100)}%</span></div>`
    )
    .join("");

  const activityPanel = panel(
    "ACTIVITY",
    "minutes / share",
    `<div style="display:flex;flex-direction:column;gap:${dens.gap}px">${catRows}</div>
     <div style="margin-top:22px;color:var(--dim);margin-bottom:9px">day · ${fmtClock(E.dayStart)}–${fmtClock(E.dayEnd)} ${tz}</div>
     <div style="display:flex;letter-spacing:-1px;line-height:1;font-size:17px">${asciiStrip(E, CD)}</div>
     <div style="display:flex;justify-content:space-between;color:var(--faint);margin-top:7px;font-size:${dens.fs - 1}px">
       ${timelineHourTicks(E.dayStart, E.dayEnd).map((h) => `<span>${h}</span>`).join("")}
     </div>`
  );

  const streaming = state.live && state.collector;
  const liveRows = state.feed
    .slice(0, 7)
    .map(
      (f, i) => `<div class="ec-row" style="display:flex;align-items:center;gap:10px;padding:${dens.pad}px 4px ${dens.pad}px 8px;border-bottom:1px solid var(--line);border-left:3px solid ${CD[f.cat] || "var(--dim)"}">
      <span style="color:var(--dim);width:64px">${esc(f.t)}</span>${appIcon(f.app, 18)}
      <span style="width:92px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(f.app)}</span>
      <span style="color:var(--dim);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(f.win)}</span></div>`
    )
    .join("");

  const livePanel = panel(
    "LIVE",
    `<span class="ec-link" data-view="activity">ec activity ▸</span>`,
    `<div>${liveRows || '<span style="color:var(--dim)">no events yet</span>'}
     <div style="display:flex;align-items:center;gap:9px;padding-top:10px;color:var(--dim)">
       <span style="color:${streaming ? "var(--green)" : "var(--dim)"}">${streaming ? "● live" : "◌ paused"}</span><span class="ec-cur"></span></div></div>`
  );

  const projCols = E.projects
    .map((p) => {
      const barCats = p.cats
        .map((c) => `<div style="width:${(c.mins / p.mins) * 100}%;background:${CD[c.cat]}"></div>`)
        .join("");
      const apps = p.apps
        .map(
          (a, ai) => `<div style="display:flex;justify-content:space-between;align-items:center;color:var(--dim);padding:3px 0">
          <span style="display:inline-flex;align-items:center;gap:8px"><span style="color:var(--faint)">${ai === p.apps.length - 1 ? "└─" : "├─"}</span>${appIcon(a.app, 17)}<span style="color:var(--fg)">${esc(a.app)}</span></span>
          <span>${fmtMins(a.mins)}</span></div>`
        )
        .join("");
      return `<div><div style="display:flex;justify-content:space-between;margin-bottom:9px">
        <span style="color:${p.name ? "var(--accent)" : "var(--dim)"}">${p.name ? "◆ " + esc(p.name) : "◇ (no project)"}</span>
        <span>${fmtMins(p.mins)} <span style="color:var(--dim)">· ${p.sessions}s</span></span></div>
        <div style="display:flex;height:6px;gap:2px;margin-bottom:10px">${barCats}</div>${apps}</div>`;
    })
    .join("");

  const projectsPanel = panel(
    "PROJECTS",
    "project ▸ category ▸ app",
    `<div class="ec-projects-grid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:28px">${projCols || '<span style="color:var(--dim)">no projects</span>'}</div>`
  );

  return `${headline}<div class="ec-grid-today" style="display:grid;grid-template-columns:1.55fr 1fr;gap:16px">${activityPanel}${livePanel}</div>${projectsPanel}`;
}

function renderTimeline(E, CD, dens) {
  const tz = E.timezone || "PT";
  const span = E.dayEnd - E.dayStart || 1;
  const band = E.sessions
    .map((s, i) => {
      const left = ((s.start - E.dayStart) / span) * 100;
      const width = ((s.end - s.start) / span) * 100;
      const outline = state.flash === i ? "2px solid var(--fg)" : "none";
      return `<div data-flash="${i}" style="position:absolute;left:${left}%;width:${width}%;top:0;bottom:0;background:${CD[s.cat]};outline:${outline};outline-offset:-2px;z-index:${state.flash === i ? 2 : 1}"></div>`;
    })
    .join("");

  const timelinePanel = panel(
    "TIMELINE",
    `${fmtClock(E.dayStart)}–${fmtClock(E.dayEnd)} ${tz} · ${E.sessions.length} sessions`,
    `<div style="position:relative;height:30px;border-radius:5px;background:var(--panel2);overflow:hidden">${band}</div>
     <div style="display:flex;justify-content:space-between;color:var(--faint);margin-top:7px">
       ${timelineHourTicks(E.dayStart, E.dayEnd).map((h) => `<span>${h}</span>`).join("")}
     </div>`
  );

  const groups = E.projects
    .map((p) => {
      const subs = E.sessions.filter((s) => s.project === p.name);
      const byCat = {};
      subs.forEach((s) => {
        (byCat[s.cat] = byCat[s.cat] || []).push(s);
      });
      const catBlocks = Object.entries(byCat)
        .map(([cat, list]) => {
          const catMins = list.reduce((a, s) => a + s.mins, 0);
          const rows = list
            .map((s, idx) => {
              const i = E.sessions.indexOf(s);
              return `<div class="ec-row ec-sess-row" data-flash="${i}" style="display:flex;align-items:baseline;gap:14px;padding:${dens.pad}px 10px;border-left:2px solid ${state.flash === i ? "var(--fg)" : CD[cat]};margin-left:6px">
                <span style="color:var(--dim);width:116px">${s.s} → ${s.e}</span>
                <span style="display:inline-flex;align-items:center;gap:8px;width:132px">${appIcon(s.app, 18)}${esc(s.app)}</span>
                <span style="color:var(--dim);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(s.title)}</span>
                <span style="width:54px;text-align:right">${fmtMins(s.mins)}</span></div>`;
            })
            .join("");
          return `<div style="padding:10px 0 4px"><div style="color:${CD[cat]};padding-left:4px;margin-bottom:6px">▸ ${esc(cat.toLowerCase())} <span style="color:var(--dim)">· ${fmtMins(catMins)}</span></div>${rows}</div>`;
        })
        .join("");
      return `<div><div style="display:flex;justify-content:space-between;align-items:baseline;padding:4px 2px 10px;border-bottom:1px solid var(--line)">
        <span style="color:${p.name ? "var(--accent)" : "var(--dim)"};font-size:${dens.fs * 1.25}px">${p.name ? "◆ " + esc(p.name) : "◇ (no project)"}</span>
        <span style="color:var(--dim)">${fmtMins(p.mins)} · ${p.sessions} sessions</span></div>${catBlocks}</div>`;
    })
    .join("");

  return `${timelinePanel}${groups}`;
}

function renderProjects(E, CD, dens) {
  return E.projects
    .map((p) => {
      const cats = p.cats
        .map(
          (c) => `<div style="display:flex;align-items:center;gap:12px;margin-bottom:${dens.gap}px">
          <span style="width:92px">${esc(c.cat.toLowerCase())}</span>
          <span style="color:${CD[c.cat]};letter-spacing:-1px;flex:1;white-space:nowrap;overflow:hidden">${bar(c.mins / p.mins, 20)}</span>
          <span style="width:52px;text-align:right">${fmtMins(c.mins)}</span></div>`
        )
        .join("");
      const apps = p.apps
        .map(
          (a) => `<div style="display:flex;align-items:center;gap:12px;margin-bottom:${dens.gap}px">
          <span style="display:inline-flex;align-items:center;gap:8px;width:130px">${appIcon(a.app, 18)}${esc(a.app)}</span>
          <span style="color:var(--fg);letter-spacing:-1px;flex:1;white-space:nowrap;overflow:hidden;opacity:0.55">${bar(a.mins / p.mins, 20)}</span>
          <span style="width:52px;text-align:right">${fmtMins(a.mins)}</span></div>`
        )
        .join("");
      return panel(
        p.name || "(no project)",
        `${fmtMins(p.mins)} · ${p.sessions} sessions`,
        `<div style="display:grid;grid-template-columns:1fr 1fr;gap:32px">
          <div><div style="color:var(--dim);margin-bottom:12px">categories</div>${cats}</div>
          <div><div style="color:var(--dim);margin-bottom:12px">apps</div>${apps}</div></div>`
      );
    })
    .join('<div style="height:16px"></div>');
}

function renderActivity(E, CD, dens) {
  const streaming = state.live && state.collector;
  const now = state.feed[0];
  const rows = state.feed
    .map(
      (f, i) => `<div class="ec-row${i === 0 && f.fresh ? " ec-feed" : ""}" style="display:flex;align-items:center;gap:12px;padding:${dens.pad + 1}px 15px;border-bottom:1px solid var(--line);border-left:3px solid ${CD[f.cat] || "var(--dim)"}">
      <span style="color:var(--dim);width:70px">${esc(f.t)}</span>${appIcon(f.app, 20)}
      <span style="width:128px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(f.app)}</span>
      <span style="color:var(--dim);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(f.win)}</span>
      <span style="width:60px;text-align:right;color:var(--dim)">${f.kb}kb</span>
      <span style="width:56px;text-align:right;color:var(--dim)">${f.ms}ms</span></div>`
    )
    .join("");

  const footer = streaming
    ? `<span style="color:var(--green)">$</span> <span>watching…</span><span class="ec-cur"></span>`
    : `<span style="color:var(--green)">$</span> <span>${state.collector ? "paused" : "collector stopped — "}${!state.collector ? '<span class="ec-link" data-action="start-collector">ec start</span>' : ""}</span><span class="ec-cur"></span>`;

  return `<div style="display:flex;align-items:center;gap:18px;flex-wrap:wrap;padding:4px 2px">
    <span class="ec-act" data-action="toggle-live" style="display:flex;align-items:center;gap:8px;border:1px solid var(--line);border-radius:5px;padding:6px 12px">
      <span style="color:${streaming ? "var(--green)" : "var(--dim)"}">${streaming ? "●" : "◌"}</span>${state.live ? "live: on" : "live: off"}
    </span>
    <span style="color:var(--dim)">polling every ${(state.liveSpeed / 1000).toFixed(1)}s</span>
    ${now ? `<span style="color:var(--dim)">now ▸ <span style="color:var(--fg)">${esc(now.app)}</span> · <span style="color:${CD[now.cat]}">${esc((now.cat || "").toLowerCase())}</span> · ${esc(now.win)}</span>` : ""}
    <span style="margin-left:auto;color:var(--dim)">kb ${state.kb.toLocaleString()} · ms ${state.ms.toLocaleString()}</span>
  </div>
  <div class="ec-panel"><div class="ec-panel-head"><span class="ec-panel-title">▸ ACTIVITY — RAW EVENTS</span><span class="ec-panel-right">collapsed · tail -f echo.duckdb</span></div>
  <div class="ec-panel-body flush"><div style="max-height:58vh;overflow-y:auto">${rows || '<div style="padding:15px;color:var(--dim)">no events</div>'}</div>
  <div style="display:flex;align-items:center;gap:9px;padding:11px 15px;border-top:1px solid var(--line);color:var(--dim)">${footer}</div></div></div>`;
}

function render() {
  const th = state.dark ? THEMES.dark : THEMES.light;
  const CD = catColors(state.accent, state.dark);
  const dens = DENSITY[state.density] || DENSITY.regular;
  const E = state.E;
  const root = document.getElementById("app");
  if (!root) return;

  const cmds = [
    ["today", "today"],
    ["timeline", "timeline"],
    ["projects", "projects"],
    ["activity", "activity"],
  ];

  let body = '<div style="padding:40px 22px;color:var(--dim)">loading…</div>';
  if (E) {
    if (state.view === "today") body = renderToday(E, CD, dens);
    else if (state.view === "timeline") body = renderTimeline(E, CD, dens);
    else if (state.view === "projects") body = renderProjects(E, CD, dens);
    else body = renderActivity(E, CD, dens);
  }

  root.innerHTML = `
  <div id="ec-root" style="--bg:${th.bg};--panel:${th.panel};--panel2:${th.panel2};--fg:${th.fg};--dim:${th.dim};--faint:${th.faint};--line:${th.line};--accent:${state.accent};--green:${th.green};--red:${th.red};min-height:100vh;background:var(--bg);color:var(--fg);font-family:'${state.font}',ui-monospace,Menlo,monospace;font-size:${dens.fs}px">
    <div style="max-width:1380px;margin:0 auto;padding:0 0 40px">
      <div style="display:flex;align-items:center;gap:10px;padding:14px 22px 0">
        <span style="display:flex;gap:7">${["#e06c5b", "#e0b14e", "#7bbf63"].map((c) => `<span style="width:11px;height:11px;border-radius:9px;background:${c}"></span>`).join("")}</span>
        <span style="margin-left:12px;display:flex;align-items:center;gap:9px">${rippleMark(20, state.accent)}<span style="font-weight:700;letter-spacing:0.02em">echo</span><span style="color:var(--dim)">— ec · localhost:7000</span></span>
        <span style="margin-left:auto;color:var(--dim)"><span class="ec-act" data-action="toggle-theme">${state.dark ? "☾ dark" : "☀ light"}</span></span>
      </div>
      <div style="padding:16px 22px 14px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="color:var(--dim)">~/echo</span><span style="color:var(--green)">$</span><span>ec</span>
          ${cmds.map(([id, label]) => `<span class="ec-cmd${state.view === id ? " on" : ""}" data-view="${id}">${label}</span>`).join("")}
          ${state.view === "activity" && state.live && state.collector ? '<span style="color:var(--accent)">--live</span>' : ""}
          <span class="ec-cur"></span>
        </div>
        <div style="display:flex;align-items:center;gap:18px;color:var(--dim)">
          <span class="ec-act" data-action="toggle-collector" style="display:flex;align-items:center;gap:7;color:${state.collector ? "var(--fg)" : "var(--red)"}">
            <span style="width:8px;height:8px;border-radius:9px;background:${state.collector ? "var(--green)" : "var(--red)"}"></span>${state.collector ? "collector running" : "collector stopped"}
          </span>
          <span style="display:flex;gap:8px"><span class="ec-act" data-action="date-prev">‹</span><span style="color:var(--fg)">${state.date}</span><span class="ec-act" data-action="date-next">›</span></span>
          <span>kb ${state.kb.toLocaleString()} · ms ${state.ms.toLocaleString()}</span>
          <span style="color:var(--fg)">${state.clock || "—"}</span>
          <span style="color:var(--faint);font-size:0.9em">${state.E?.timezone || "PT"}</span>
          <span class="ec-act" data-action="rebuild" style="border:1px solid var(--line);padding:4px 8px;border-radius:4px">rebuild</span>
        </div>
      </div>
      <div style="padding:0 22px;display:flex;flex-direction:column;gap:16px">${body}</div>
    </div>
  </div>`;

  root.querySelectorAll("[data-view]").forEach((el) => {
    el.addEventListener("click", () => {
      state.view = el.getAttribute("data-view");
      render();
      schedulePoll();
    });
  });
  root.querySelectorAll("[data-action]").forEach((el) => {
    el.addEventListener("click", () => onAction(el.getAttribute("data-action")));
  });
  root.querySelectorAll("[data-flash]").forEach((el) => {
    const idx = Number(el.getAttribute("data-flash"));
    el.addEventListener("mouseenter", () => {
      state.flash = idx;
      render();
    });
    el.addEventListener("mouseleave", () => {
      state.flash = null;
      render();
    });
  });
  root.querySelectorAll(".ec-sess-row").forEach((el) => {
    const idx = Number(el.getAttribute("data-flash"));
    el.addEventListener("mouseenter", () => {
      state.flash = idx;
      render();
    });
    el.addEventListener("mouseleave", () => {
      state.flash = null;
      render();
    });
  });
}

async function onAction(action) {
  try {
    if (action === "toggle-theme") {
      state.dark = !state.dark;
      render();
      return;
    }
    if (action === "toggle-collector") {
      const path = state.collector ? "/api/collector/stop" : "/api/collector/start";
      await fetchJson(path, { method: "POST", body: "{}" });
      await refreshCollector();
      schedulePoll();
      render();
      return;
    }
    if (action === "start-collector") {
      await fetchJson("/api/collector/start", { method: "POST", body: "{}" });
      await refreshCollector();
      schedulePoll();
      render();
      return;
    }
    if (action === "toggle-live") {
      state.live = !state.live;
      schedulePoll();
      render();
      return;
    }
    if (action === "date-prev") {
      shiftDate(-1);
      return;
    }
    if (action === "date-next") {
      shiftDate(1);
      return;
    }
    if (action === "rebuild") {
      await fetchJson("/api/sessions/rebuild", { method: "POST", body: "{}" });
      await loadDay();
      return;
    }
  } catch (err) {
    alert(err.message || String(err));
  }
}

function shiftDate(delta) {
  const d = new Date(state.date + "T12:00:00");
  d.setDate(d.getDate() + delta);
  state.date = d.toISOString().slice(0, 10);
  loadDay();
}

async function refreshCollector() {
  const st = await fetchJson("/api/collector/status");
  state.collector = !!st.running;
}

async function loadDay() {
  const E = attachEchoHelpers(await fetchJson(`/api/day?date=${encodeURIComponent(state.date)}`));
  state.E = E;
  state.kb = E.totals.kb;
  state.ms = E.totals.ms;
  await loadFeed(false);
  render();
}

async function loadFeed(appendOnly) {
  const newest = state.feed[0];
  const after = appendOnly && newest && newest._ts ? `&after=${encodeURIComponent(newest._ts)}` : "";
  const rows = await fetchJson(`/api/activity?date=${encodeURIComponent(state.date)}&limit=48${after}`);
  if (appendOnly && rows.length) {
    const merged = [...rows.map((r) => ({ ...r, fresh: true })), ...state.feed];
    const seen = new Set();
    state.feed = merged.filter((r) => {
      const key = (r._ts || "") + r.t + r.app + r.win;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 48);
  } else {
    state.feed = rows.slice(0, 48);
  }
  if (state.feed[0] && state.feed[0].t) state.clock = state.feed[0].t;
}

function updateHeaderClock() {
  state.clock = pacificTimeString();
}

function schedulePoll() {
  if (state.pollTimer) clearInterval(state.pollTimer);
  if (state.live && state.collector) {
    state.pollTimer = setInterval(async () => {
      try {
        await loadFeed(true);
        if (state.view === "activity" || state.view === "today") render();
      } catch (_) {
        /* retry */
      }
    }, state.liveSpeed);
  }
}

function tickClock() {
  updateHeaderClock();
}

async function init() {
  try {
    await refreshCollector();
    await loadDay();
    updateHeaderClock();
    schedulePoll();
    if (state.clockTimer) clearInterval(state.clockTimer);
    state.clockTimer = setInterval(() => {
      updateHeaderClock();
      const nav = document.querySelector("#ec-root > div > div:nth-child(2)");
      if (nav) {
        const spans = nav.querySelectorAll("span");
        const clockSpan = spans[spans.length - 2];
        if (clockSpan && clockSpan.textContent.match(/^\d{2}:/)) clockSpan.textContent = state.clock;
      }
    }, 1000);
  } catch (err) {
    document.getElementById("app").innerHTML = `<pre style="padding:24px;color:#c00">${esc(err.message)}</pre>`;
  }
}

init();
