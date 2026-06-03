/* Echo — ec:// terminal, full interactive prototype.
   Reads window.ECHO (data.js), DayStrip (shared.jsx), useTweaks/TweaksPanel (tweaks-panel.jsx). */
const { useState, useEffect, useRef, useMemo } = React;
const { TodayView, TimelineView, ProjectsView, ActivityView } = window;

/* ---------- themes ---------- */
const THEMES = {
  dark:  { bg: '#0b0c0e', panel: '#101214', panel2: '#15181b', fg: '#cfcabf', dim: '#6a655c', faint: '#46433d', line: '#23262a', green: 'oklch(0.76 0.13 158)', red: 'oklch(0.66 0.18 25)' },
  light: { bg: '#efe9df', panel: '#f7f2e9', panel2: '#efe8db', fg: '#2b2722', dim: '#8a8175', faint: '#b4ab9c', line: '#ddd3c4', green: 'oklch(0.55 0.13 158)', red: 'oklch(0.55 0.2 25)' },
};
function catColors(accent, dark) {
  return dark
    ? { Coding: accent, Meeting: 'oklch(0.76 0.13 158)', Comms: 'oklch(0.74 0.12 248)', Research: 'oklch(0.74 0.13 300)', Distraction: 'oklch(0.82 0.13 82)' }
    : { Coding: accent, Meeting: 'oklch(0.58 0.12 158)', Comms: 'oklch(0.56 0.13 248)', Research: 'oklch(0.55 0.14 300)', Distraction: 'oklch(0.66 0.13 75)' };
}
const bar = (frac, w = 22) => '█'.repeat(Math.max(0, Math.round(frac * w))).padEnd(w, '·');

/* Echo ripple mark — follows the accent tweak */
function RippleMark({ size = 20, color = '#d2693f' }) {
  return (
    <span style={{ display: 'inline-flex', width: size, height: size, borderRadius: size * 0.29, overflow: 'hidden', background: 'radial-gradient(120% 120% at 30% 78%, #1f1a16, #131110)', flex: '0 0 auto', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)' }}>
      <svg viewBox="0 0 100 100" width={size} height={size}>
        <g fill="none" strokeLinecap="round">
          <circle cx="32" cy="70" r="20" stroke={color} strokeWidth="7" />
          <circle cx="32" cy="70" r="38" stroke={color} strokeWidth="6" opacity="0.6" />
          <circle cx="32" cy="70" r="56" stroke={color} strokeWidth="5" opacity="0.3" />
        </g>
        <circle cx="32" cy="70" r="7" fill="#f0a877" />
      </svg>
    </span>
  );
}

/* ---------- live event generation ---------- */
const POOL = [
  { app: 'Cursor', win: 'collector.py', cat: 'Coding', kbR: [80, 180], msR: [10, 45] },
  { app: 'Cursor', win: 'features_to_redis.py', cat: 'Coding', kbR: [90, 200], msR: [12, 50] },
  { app: 'Cursor', win: 'rules.py', cat: 'Coding', kbR: [60, 160], msR: [8, 40] },
  { app: 'Cursor', win: 'sessionizer.py', cat: 'Coding', kbR: [70, 170], msR: [10, 44] },
  { app: 'Google Chrome', win: 'Redis Streams docs', cat: 'Research', kbR: [0, 12], msR: [30, 90] },
  { app: 'Slack', win: '#design', cat: 'Comms', kbR: [10, 60], msR: [4, 18] },
  { app: 'Terminal', win: 'ec start --foreground', cat: 'Coding', kbR: [4, 30], msR: [2, 10] },
];
const WEIGHTS = [4, 4, 3, 3, 2, 2, 1];
const pickPool = () => {
  const tot = WEIGHTS.reduce((a, b) => a + b, 0);
  let r = Math.random() * tot;
  for (let i = 0; i < POOL.length; i++) { r -= WEIGHTS[i]; if (r <= 0) return POOL[i]; }
  return POOL[0];
};
const rnd = ([a, b]) => Math.round(a + Math.random() * (b - a));
const pad2 = (n) => String(n).padStart(2, '0');
const fmtSec = (s) => `${pad2(Math.floor(s / 3600) % 24)}:${pad2(Math.floor(s / 60) % 60)}:${pad2(s % 60)}`;

/* ============================ APP ============================ */
function App() {
  const E = window.ECHO;
  const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
    accent: '#d2693f',
    font: 'JetBrains Mono',
    density: 'regular',
    dark: true,
    liveSpeed: 1600,
    scanlines: false
  }/*EDITMODE-END*/;
  const [t, setTweak] = window.useTweaks(TWEAK_DEFAULTS);
  const th = t.dark ? THEMES.dark : THEMES.light;
  const CD = catColors(t.accent, t.dark);

  const [view, setView] = useState('today');
  const [collector, setCollector] = useState(true);
  const [live, setLive] = useState(true);
  const [feed, setFeed] = useState(() => E.feed.map((f) => ({ ...f })));
  const [clock, setClock] = useState(17 * 3600 + 9 * 60 + 48);
  const [kb, setKb] = useState(E.kbTotal);
  const [ms, setMs] = useState(E.msTotal);
  const [flash, setFlash] = useState(null); // session flashed on timeline

  const streaming = live && collector;

  useEffect(() => {
    if (!streaming) return;
    const id = setInterval(() => {
      const p = pickPool();
      const dk = rnd(p.kbR), dm = rnd(p.msR);
      setClock((c) => c + rnd([1, 4]));
      setKb((v) => v + dk);
      setMs((v) => v + dm);
      setClock((c) => {
        setFeed((f) => [{ t: fmtSec(c), app: p.app, win: p.win, cat: p.cat, kb: dk, ms: dm, fresh: true }, ...f].slice(0, 48));
        return c;
      });
    }, t.liveSpeed);
    return () => clearInterval(id);
  }, [streaming, t.liveSpeed]);

  const dens = { compact: { fs: 12, pad: 5, gap: 9 }, regular: { fs: 13, pad: 7, gap: 12 }, comfy: { fs: 14.5, pad: 10, gap: 15 } }[t.density];

  const rootStyle = {
    '--bg': th.bg, '--panel': th.panel, '--panel2': th.panel2, '--fg': th.fg, '--dim': th.dim, '--faint': th.faint,
    '--line': th.line, '--accent': t.accent, '--green': th.green, '--red': th.red,
    minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)',
    fontFamily: `"${t.font}", ui-monospace, SFMono-Regular, Menlo, monospace`,
    fontSize: dens.fs, letterSpacing: '0', position: 'relative',
  };

  const cmds = [['today', 'today'], ['timeline', 'timeline'], ['projects', 'projects'], ['activity', 'activity']];

  return (
    <div style={rootStyle}>
      <style>{`
        @keyframes ecblink{0%,49%{opacity:1}50%,100%{opacity:0}}
        @keyframes ecin{from{opacity:0;transform:translateY(-3px)}to{opacity:1;transform:none}}
        .ec-cur{display:inline-block;width:.62em;height:1.05em;background:var(--fg);vertical-align:-2px;animation:ecblink 1.1s step-end infinite}
        .ec-cmd{cursor:pointer;padding:2px 4px;border-radius:4px;color:var(--dim);transition:color .12s}
        .ec-cmd:hover{color:var(--fg)}
        .ec-cmd.on{color:var(--bg);background:var(--accent)}
        .ec-row{transition:background .1s}
        .ec-row:hover{background:var(--panel2)}
        .ec-act{cursor:pointer;transition:color .12s,border-color .12s}
        .ec-act:hover{color:var(--fg);border-color:var(--dim)!important}
        .ec-feed{animation:ecin .18s ease}
        .ec-scan::after{content:"";position:fixed;inset:0;pointer-events:none;z-index:5;background:repeating-linear-gradient(0deg,rgba(0,0,0,.16) 0px,rgba(0,0,0,.16) 1px,transparent 2px,transparent 3px);mix-blend-mode:multiply;opacity:.5}
        ::-webkit-scrollbar{width:9px;height:9px}
        ::-webkit-scrollbar-thumb{background:var(--line);border-radius:5px}
        ::-webkit-scrollbar-track{background:transparent}
        .ec-link{cursor:pointer;color:var(--accent);opacity:.85}
        .ec-link:hover{opacity:1;text-decoration:underline}
      `}</style>

      <div className={t.scanlines ? 'ec-scan' : ''} style={{ maxWidth: 1380, margin: '0 auto', padding: '0 0 40px' }}>
        {/* window chrome */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 22px 0' }}>
          <span style={{ display: 'flex', gap: 7 }}>
            {['#e06c5b', '#e0b14e', '#7bbf63'].map((c, i) => <span key={i} style={{ width: 11, height: 11, borderRadius: 9, background: c }}></span>)}
          </span>
          <span style={{ marginLeft: 12, display: 'flex', alignItems: 'center', gap: 9 }}>
            <RippleMark size={20} color={t.accent} />
            <span style={{ color: 'var(--fg)', fontWeight: 700, letterSpacing: '0.02em' }}>echo</span>
            <span style={{ color: 'var(--dim)' }}>— ec · localhost:7000</span>
          </span>
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14, color: 'var(--dim)' }}>
            <span className="ec-act" style={{ cursor: 'pointer' }} onClick={() => setTweak('dark', !t.dark)} title="toggle theme">{t.dark ? '☾ dark' : '☀ light'}</span>
          </span>
        </div>

        {/* prompt nav */}
        <Header E={E} cmds={cmds} view={view} setView={setView} live={live} collector={collector}
          setCollector={setCollector} kb={kb} ms={ms} clock={clock} th={th} />

        {/* body */}
        <div style={{ padding: '0 22px' }}>
          {view === 'today' && <TodayView E={E} CD={CD} dens={dens} setView={setView} feed={feed} live={live} setLive={setLive} streaming={streaming} />}
          {view === 'timeline' && <TimelineView E={E} CD={CD} dens={dens} flash={flash} setFlash={setFlash} />}
          {view === 'projects' && <ProjectsView E={E} CD={CD} dens={dens} />}
          {view === 'activity' && <ActivityView E={E} CD={CD} dens={dens} feed={feed} live={live} setLive={setLive} collector={collector} setCollector={setCollector} kb={kb} ms={ms} streaming={streaming} liveSpeed={t.liveSpeed} />}
        </div>
      </div>

      {/* TWEAKS */}
      <window.TweaksPanel>
        <window.TweakSection label="Terminal" />
        <window.TweakColor label="Accent" value={t.accent} options={['#d2693f', '#cf4f3e', '#3f86d2', '#3fa56b', '#9a6ad6', '#c9a227']} onChange={(v) => setTweak('accent', v)} />
        <window.TweakSelect label="Typeface" value={t.font} options={['JetBrains Mono', 'IBM Plex Mono', 'Space Mono']} onChange={(v) => setTweak('font', v)} />
        <window.TweakRadio label="Density" value={t.density} options={['compact', 'regular', 'comfy']} onChange={(v) => setTweak('density', v)} />
        <window.TweakToggle label="Dark mode" value={t.dark} onChange={(v) => setTweak('dark', v)} />
        <window.TweakToggle label="CRT scanlines" value={t.scanlines} onChange={(v) => setTweak('scanlines', v)} />
        <window.TweakSection label="Live feed" />
        <window.TweakSlider label="Stream interval" value={t.liveSpeed} min={500} max={4000} step={100} unit="ms" onChange={(v) => setTweak('liveSpeed', v)} />
      </window.TweaksPanel>
    </div>
  );
}

/* ---------- header ---------- */
function Header({ E, cmds, view, setView, live, collector, setCollector, kb, ms, clock, th }) {
  return (
    <div style={{ padding: '16px 22px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--dim)' }}>~/echo</span>
        <span style={{ color: 'var(--green)' }}>$</span>
        <span style={{ color: 'var(--fg)' }}>ec</span>
        {cmds.map(([id, label]) => (
          <span key={id} className={'ec-cmd' + (view === id ? ' on' : '')} onClick={() => setView(id)}>{label}</span>
        ))}
        {view === 'activity' && live && collector && <span style={{ color: 'var(--accent)' }}>--live</span>}
        <span className="ec-cur"></span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, color: 'var(--dim)' }}>
        <span className="ec-act" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, color: collector ? 'var(--fg)' : 'var(--red)' }} onClick={() => setCollector((c) => !c)} title="start/stop collector">
          <span style={{ width: 8, height: 8, borderRadius: 9, background: collector ? th.green : th.red }}></span>
          {collector ? 'collector running' : 'collector stopped'}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ cursor: 'pointer' }}>‹</span><span style={{ color: 'var(--fg)' }}>{E.date}</span><span style={{ cursor: 'pointer' }}>›</span>
        </span>
        <span>kb {kb.toLocaleString()} · ms {ms.toLocaleString()}</span>
        <span style={{ color: 'var(--fg)' }}>{fmtSec(clock)}</span>
      </div>
    </div>
  );
}
window.App = App;
