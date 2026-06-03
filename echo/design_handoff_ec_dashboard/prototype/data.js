/* Echo — shared mock data + palette. Plain JS, attaches to window.ECHO. */
(function () {
  // Harmonious category palette: same L/C, hue-rotated. Terracotta is the brand accent.
  const CAT_COLOR = {
    Coding:      'oklch(0.64 0.14 38)',   // terracotta (accent)
    Meeting:     'oklch(0.64 0.11 158)',  // green
    Comms:       'oklch(0.64 0.11 248)',  // blue
    Research:    'oklch(0.64 0.12 300)',  // violet
    Distraction: 'oklch(0.72 0.12 78)',   // amber
  };
  const CAT_ORDER = ['Coding', 'Meeting', 'Comms', 'Research', 'Distraction'];

  const toMin = (hhmm) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  };

  // A believable ~7h day. mins is the active minutes inside the session window.
  const sessions = [
    { s: '08:28', e: '08:51', app: 'Cursor',        title: 'features_to_redis.py', project: 'tracer', cat: 'Coding',      kb: 1840, ms: 410 },
    { s: '08:51', e: '09:06', app: 'Cursor',        title: 'readme.md',            project: 'echo',   cat: 'Coding',      kb: 920,  ms: 260 },
    { s: '09:06', e: '09:18', app: 'Slack',         title: '#eng-team',            project: null,     cat: 'Comms',       kb: 540,  ms: 180 },
    { s: '09:30', e: '09:58', app: 'Zoom',          title: 'Standup',              project: null,     cat: 'Meeting',     kb: 60,   ms: 90  },
    { s: '10:02', e: '11:14', app: 'Cursor',        title: 'sessionizer.py',       project: 'echo',   cat: 'Coding',      kb: 5210, ms: 1180 },
    { s: '11:14', e: '11:38', app: 'Google Chrome', title: 'DuckDB · Window Functions', project: null, cat: 'Research',   kb: 210,  ms: 640 },
    { s: '11:38', e: '12:20', app: 'Cursor',        title: 'rules.py',             project: 'echo',   cat: 'Coding',      kb: 3120, ms: 720 },
    { s: '13:05', e: '13:23', app: 'Google Chrome', title: 'Hacker News',          project: null,     cat: 'Distraction', kb: 80,   ms: 520 },
    { s: '13:23', e: '14:51', app: 'Cursor',        title: 'collector.py',         project: 'echo',   cat: 'Coding',      kb: 6040, ms: 1360 },
    { s: '14:51', e: '15:10', app: 'Slack',         title: '#design',              project: null,     cat: 'Comms',       kb: 880,  ms: 240 },
    { s: '15:10', e: '15:34', app: 'Zoom',          title: 'Design sync',          project: null,     cat: 'Meeting',     kb: 120,  ms: 110 },
    { s: '15:34', e: '16:39', app: 'Cursor',        title: 'features_to_redis.py', project: 'tracer', cat: 'Coding',      kb: 4470, ms: 980 },
    { s: '16:39', e: '16:54', app: 'Google Chrome', title: 'Redis Streams docs',   project: null,     cat: 'Research',    kb: 190,  ms: 410 },
    { s: '16:54', e: '17:09', app: 'Notion',        title: 'Sprint notes',         project: null,     cat: 'Comms',       kb: 1120, ms: 300 },
  ].map((x) => ({ ...x, start: toMin(x.s), end: toMin(x.e), mins: toMin(x.e) - toMin(x.s) }));

  // App glyph short labels
  const APP_ABBR = {
    'Cursor': 'Cu', 'Google Chrome': 'Ch', 'Slack': 'Sl', 'Zoom': 'Zm', 'Notion': 'No', 'Terminal': 'Te',
  };

  // Derive category totals
  const catTotals = {};
  CAT_ORDER.forEach((c) => (catTotals[c] = 0));
  sessions.forEach((s) => (catTotals[s.cat] += s.mins));
  const total = Object.values(catTotals).reduce((a, b) => a + b, 0);
  const categories = CAT_ORDER
    .filter((c) => catTotals[c] > 0)
    .map((c) => ({ name: c, mins: catTotals[c], color: CAT_COLOR[c], pct: catTotals[c] / total }));

  // Derive projects -> categories -> apps
  const projOrder = ['echo', 'tracer', null];
  const projects = projOrder.map((p) => {
    const subs = sessions.filter((s) => s.project === p);
    const mins = subs.reduce((a, s) => a + s.mins, 0);
    const byApp = {};
    subs.forEach((s) => (byApp[s.app] = (byApp[s.app] || 0) + s.mins));
    const cats = {};
    subs.forEach((s) => (cats[s.cat] = (cats[s.cat] || 0) + s.mins));
    return {
      name: p,
      label: p || '(no project)',
      mins,
      sessions: subs.length,
      apps: Object.entries(byApp).map(([app, m]) => ({ app, mins: m })).sort((a, b) => b.mins - a.mins),
      cats: Object.entries(cats).map(([cat, m]) => ({ cat, mins: m, color: CAT_COLOR[cat] })).sort((a, b) => b.mins - a.mins),
    };
  }).filter((p) => p.mins > 0);

  // Live activity feed (collapsed raw events, newest first)
  const feed = [
    { t: '17:09:48', app: 'Notion',        win: 'Sprint notes',     cat: 'Comms',   kb: 24, ms: 6 },
    { t: '17:09:31', app: 'Notion',        win: 'Sprint notes',     cat: 'Comms',   kb: 51, ms: 3 },
    { t: '17:09:12', app: 'Cursor',        win: 'collector.py',     cat: 'Coding',  kb: 88, ms: 12 },
    { t: '17:08:55', app: 'Cursor',        win: 'collector.py',     cat: 'Coding',  kb: 142, ms: 38 },
    { t: '17:08:39', app: 'Cursor',        win: 'collector.py',     cat: 'Coding',  kb: 96, ms: 21 },
    { t: '17:08:20', app: 'Google Chrome', win: 'Redis Streams docs', cat: 'Research', kb: 4, ms: 64 },
    { t: '17:08:02', app: 'Google Chrome', win: 'Redis Streams docs', cat: 'Research', kb: 0, ms: 41 },
    { t: '17:07:45', app: 'Cursor',        win: 'features_to_redis.py', cat: 'Coding', kb: 120, ms: 30 },
    { t: '17:07:28', app: 'Slack',         win: '#design',          cat: 'Comms',   kb: 33, ms: 9 },
    { t: '17:07:09', app: 'Cursor',        win: 'features_to_redis.py', cat: 'Coding', kb: 165, ms: 44 },
  ];

  const fmtMins = (m) => {
    const h = Math.floor(m / 60), mm = Math.round(m % 60);
    if (h === 0) return mm + 'm';
    return h + 'h ' + String(mm).padStart(2, '0') + 'm';
  };
  const fmtClock = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');

  const dayStart = sessions[0].start;
  const dayEnd = sessions[sessions.length - 1].end;

  window.ECHO = {
    date: '2026-06-03', dateLong: 'Tuesday, June 3',
    CAT_COLOR, CAT_ORDER, APP_ABBR,
    sessions, categories, projects, feed, total,
    dayStart, dayEnd,
    kbTotal: sessions.reduce((a, s) => a + s.kb, 0),
    msTotal: sessions.reduce((a, s) => a + s.ms, 0),
    fmtMins, fmtClock,
    // peak focus stat
    longestFocus: sessions.reduce((a, s) => (s.cat === 'Coding' && s.mins > a.mins ? s : a), sessions[0]),
  };
})();
