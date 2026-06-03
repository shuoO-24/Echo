/* Echo — ec:// views: today / timeline / projects / activity. Exports to window. */
const { useState: useStateV, useRef: useRefV, useEffect: useEffectV } = React;

function Panel({ title, right, children, style, bodyStyle }) {
  return (
    <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 7, display: 'flex', flexDirection: 'column', minHeight: 0, ...style }}>
      {title && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 15px', borderBottom: '1px solid var(--line)' }}>
          <span style={{ color: 'var(--accent)', letterSpacing: '0.12em' }}>▸ {title}</span>
          {right && <span style={{ color: 'var(--dim)' }}>{right}</span>}
        </div>
      )}
      <div style={{ padding: 15, flex: 1, minHeight: 0, ...bodyStyle }}>{children}</div>
    </div>
  );
}
const bar2 = (frac, w = 22) => '█'.repeat(Math.max(0, Math.round(frac * w))).padEnd(w, '·');

/* original app glyph tiles — mono initials, not the real brand logos */
const APP_META = {
  'Cursor':        { a: 'Cu', bg: '#2b2926', fg: '#ece7dd' },
  'Google Chrome': { a: 'Ch', bg: '#4f74d6', fg: '#ffffff' },
  'Slack':         { a: 'Sl', bg: '#7c5cc4', fg: '#ffffff' },
  'Zoom':          { a: 'Zm', bg: '#2f8fd6', fg: '#ffffff' },
  'Notion':        { a: 'No', bg: '#37342e', fg: '#efe9df' },
  'Terminal':      { a: 'Te', bg: '#16181a', fg: '#7bbf63' },
};
function AppIcon({ app, size = 18 }) {
  const m = APP_META[app] || { a: (app || '?').slice(0, 2), bg: '#5a564e', fg: '#fff' };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: size, height: size, borderRadius: size * 0.29, background: m.bg, color: m.fg, fontSize: size * 0.5, fontWeight: 700, lineHeight: 1, letterSpacing: '-0.5px', flex: '0 0 auto', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.07)' }}>{m.a}</span>
  );
}

function AsciiStrip({ E, CD, cols = 58, size = 17 }) {
  const span = E.dayEnd - E.dayStart;
  const cells = [];
  for (let i = 0; i < cols; i++) {
    const time = E.dayStart + (i / cols) * span;
    const s = E.sessions.find((x) => time >= x.start && time < x.end);
    cells.push(s ? CD[s.cat] : null);
  }
  return (
    <div style={{ display: 'flex', letterSpacing: '-1px', lineHeight: 1, fontSize: size }}>
      {cells.map((c, i) => <span key={i} style={{ color: c || 'var(--line)' }}>▇</span>)}
    </div>
  );
}

/* ---------------- TODAY ---------------- */
function TodayView({ E, CD, dens, setView, feed, live, setLive, streaming }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap', padding: '6px 2px 2px' }}>
        <span style={{ fontSize: dens.fs * 2.8, letterSpacing: '-0.03em', whiteSpace: 'nowrap' }}>{E.fmtMins(E.total)}</span>
        <span style={{ color: 'var(--dim)' }}>tracked ·</span>
        <span style={{ fontSize: dens.fs * 2.8, letterSpacing: '-0.03em', whiteSpace: 'nowrap' }}>{E.sessions.length}</span>
        <span style={{ color: 'var(--dim)' }}>sessions ·</span>
        <span style={{ color: 'var(--accent)', fontSize: dens.fs * 1.4 }}>{Math.round(E.categories[0].pct * 100)}% coding</span>
        <span style={{ color: 'var(--dim)', marginLeft: 'auto', fontSize: dens.fs }}>longest focus {E.fmtMins(E.longestFocus.mins)} · {E.longestFocus.title}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.55fr 1fr', gap: 16 }}>
        <Panel title="ACTIVITY" right="minutes / share">
          <div style={{ display: 'flex', flexDirection: 'column', gap: dens.gap }}>
            {E.categories.map((c) => (
              <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span style={{ width: 100, color: 'var(--fg)' }}>{c.name.toLowerCase()}</span>
                <span style={{ color: CD[c.name], letterSpacing: '-1px', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden' }}>{bar2(c.pct, 24)}</span>
                <span style={{ width: 52, textAlign: 'right' }}>{c.mins}m</span>
                <span style={{ width: 46, textAlign: 'right', color: 'var(--dim)' }}>{Math.round(c.pct * 100)}%</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 22, color: 'var(--dim)', marginBottom: 9 }}>day · {E.fmtClock(E.dayStart)}–{E.fmtClock(E.dayEnd)}</div>
          <AsciiStrip E={E} CD={CD} />
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--faint)', marginTop: 7, fontSize: dens.fs - 1 }}>
            {['08', '10', '12', '14', '16'].map((h) => <span key={h}>{h}:00</span>)}
          </div>
        </Panel>

        <Panel title="LIVE" right={<span className="ec-link" onClick={() => setView('activity')}>ec activity ▸</span>}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {feed.slice(0, 7).map((f, i) => (
              <div key={i} className="ec-row" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: `${dens.pad}px 4px ${dens.pad}px 8px`, borderBottom: '1px solid var(--line)', borderLeft: `3px solid ${CD[f.cat]}` }}>
                <span style={{ color: 'var(--dim)', width: 64 }}>{f.t}</span>
                <AppIcon app={f.app} size={18} />
                <span style={{ width: 92, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.app}</span>
                <span style={{ color: 'var(--dim)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.win}</span>
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, paddingTop: 10, color: 'var(--dim)' }}>
              <span style={{ color: streaming ? 'var(--green)' : 'var(--dim)' }}>{streaming ? '● live' : '◌ paused'}</span>
              <span className="ec-cur"></span>
            </div>
          </div>
        </Panel>
      </div>

      <Panel title="PROJECTS" right="project ▸ category ▸ app">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 28 }}>
          {E.projects.map((p, i) => (
            <div key={i}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 9 }}>
                <span style={{ color: p.name ? 'var(--accent)' : 'var(--dim)' }}>{p.name ? '◆ ' + p.name : '◇ (no project)'}</span>
                <span>{E.fmtMins(p.mins)} <span style={{ color: 'var(--dim)' }}>· {p.sessions}s</span></span>
              </div>
              <div style={{ display: 'flex', height: 6, gap: 2, marginBottom: 10 }}>
                {p.cats.map((c, ci) => <div key={ci} style={{ width: (c.mins / p.mins) * 100 + '%', background: CD[c.cat] }}></div>)}
              </div>
              {p.apps.map((a, ai) => (
                <div key={ai} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--dim)', padding: '3px 0' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><span style={{ color: 'var(--faint)' }}>{ai === p.apps.length - 1 ? '└─' : '├─'}</span> <AppIcon app={a.app} size={17} /> <span style={{ color: 'var(--fg)' }}>{a.app}</span></span>
                  <span>{E.fmtMins(a.mins)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

/* ---------------- TIMELINE ---------------- */
function TimelineView({ E, CD, dens, flash, setFlash }) {
  const span = E.dayEnd - E.dayStart;
  // group sessions by project then category, preserve chronological inside
  const groups = E.projects.map((p) => {
    const subs = E.sessions.map((s, idx) => ({ ...s, idx })).filter((s) => s.project === p.name);
    const byCat = {};
    subs.forEach((s) => { (byCat[s.cat] = byCat[s.cat] || []).push(s); });
    return { p, byCat };
  });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Panel title="TIMELINE" right={`${E.fmtClock(E.dayStart)}–${E.fmtClock(E.dayEnd)} · ${E.sessions.length} sessions`}>
        <div style={{ position: 'relative', height: 30, borderRadius: 5, background: 'var(--panel2)', overflow: 'hidden' }}>
          {E.sessions.map((s, i) => (
            <div key={i} onMouseEnter={() => setFlash(i)} onMouseLeave={() => setFlash(null)}
              style={{ position: 'absolute', left: ((s.start - E.dayStart) / span) * 100 + '%', width: ((s.end - s.start) / span) * 100 + '%', top: 0, bottom: 0, background: CD[s.cat], outline: flash === i ? '2px solid var(--fg)' : 'none', outlineOffset: -2, zIndex: flash === i ? 2 : 1 }} />
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--faint)', marginTop: 7 }}>
          {['08:00', '10:00', '12:00', '14:00', '16:00'].map((h) => <span key={h}>{h}</span>)}
        </div>
      </Panel>

      {groups.map(({ p, byCat }, gi) => (
        <div key={gi}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '4px 2px 10px', borderBottom: '1px solid var(--line)' }}>
            <span style={{ color: p.name ? 'var(--accent)' : 'var(--dim)', fontSize: dens.fs * 1.25 }}>{p.name ? '◆ ' + p.name : '◇ (no project)'}</span>
            <span style={{ color: 'var(--dim)' }}>{E.fmtMins(p.mins)} · {p.sessions} sessions</span>
          </div>
          {Object.entries(byCat).map(([cat, subs]) => (
            <div key={cat} style={{ padding: '10px 0 4px' }}>
              <div style={{ color: CD[cat], paddingLeft: 4, marginBottom: 6 }}>▸ {cat.toLowerCase()} <span style={{ color: 'var(--dim)' }}>· {E.fmtMins(subs.reduce((a, s) => a + s.mins, 0))}</span></div>
              {subs.map((s) => (
                <div key={s.idx} className="ec-row" onMouseEnter={() => setFlash(s.idx)} onMouseLeave={() => setFlash(null)}
                  style={{ display: 'flex', alignItems: 'baseline', gap: 14, padding: `${dens.pad}px 10px`, borderLeft: `2px solid ${flash === s.idx ? 'var(--fg)' : CD[cat]}`, marginLeft: 6, cursor: 'default' }}>
                  <span style={{ color: 'var(--dim)', width: 116 }}>{s.s} → {s.e}</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, width: 132 }}><AppIcon app={s.app} size={18} />{s.app}</span>
                  <span style={{ color: 'var(--dim)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</span>
                  <span style={{ color: 'var(--fg)', width: 54, textAlign: 'right' }}>{E.fmtMins(s.mins)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ---------------- PROJECTS ---------------- */
function ProjectsView({ E, CD, dens }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {E.projects.map((p, i) => (
        <Panel key={i} title={p.name || '(no project)'} right={`${E.fmtMins(p.mins)} · ${p.sessions} sessions`}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
            <div>
              <div style={{ color: 'var(--dim)', marginBottom: 12 }}>categories</div>
              {p.cats.map((c, ci) => (
                <div key={ci} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: dens.gap }}>
                  <span style={{ width: 92 }}>{c.cat.toLowerCase()}</span>
                  <span style={{ color: CD[c.cat], letterSpacing: '-1px', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden' }}>{bar2(c.mins / p.mins, 20)}</span>
                  <span style={{ width: 52, textAlign: 'right' }}>{E.fmtMins(c.mins)}</span>
                </div>
              ))}
            </div>
            <div>
              <div style={{ color: 'var(--dim)', marginBottom: 12 }}>apps</div>
              {p.apps.map((a, ai) => (
                <div key={ai} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: dens.gap }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, width: 130 }}><AppIcon app={a.app} size={18} />{a.app}</span>
                  <span style={{ color: 'var(--fg)', letterSpacing: '-1px', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', opacity: 0.55 }}>{bar2(a.mins / p.mins, 20)}</span>
                  <span style={{ width: 52, textAlign: 'right' }}>{E.fmtMins(a.mins)}</span>
                </div>
              ))}
            </div>
          </div>
        </Panel>
      ))}
    </div>
  );
}

/* ---------------- ACTIVITY (live) ---------------- */
function ActivityView({ E, CD, dens, feed, live, setLive, collector, setCollector, kb, ms, streaming, liveSpeed }) {
  const now = feed[0];
  const bodyRef = useRefV(null);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap', padding: '4px 2px' }}>
        <span className="ec-act" onClick={() => setLive((v) => !v)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--line)', borderRadius: 5, padding: '6px 12px', color: 'var(--fg)' }}>
          <span style={{ color: streaming ? 'var(--green)' : 'var(--dim)' }}>{streaming ? '●' : '◌'}</span>{live ? 'live: on' : 'live: off'}
        </span>
        <span style={{ color: 'var(--dim)' }}>polling every {(liveSpeed / 1000).toFixed(1)}s</span>
        {now && <span style={{ color: 'var(--dim)' }}>now ▸ <span style={{ color: 'var(--fg)' }}>{now.app}</span> · <span style={{ color: CD[now.cat] }}>{now.cat.toLowerCase()}</span> · {now.win}</span>}
        <span style={{ marginLeft: 'auto', color: 'var(--dim)' }}>kb {kb.toLocaleString()} · ms {ms.toLocaleString()}</span>
      </div>
      <Panel title="ACTIVITY — RAW EVENTS" right="collapsed · tail -f echo.duckdb" bodyStyle={{ padding: 0 }}>
        <div ref={bodyRef} style={{ maxHeight: '58vh', overflowY: 'auto' }}>
          {feed.map((f, i) => (
            <div key={f.t + f.win + i} className={'ec-row' + (i === 0 && f.fresh ? ' ec-feed' : '')} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: `${dens.pad + 1}px 15px ${dens.pad + 1}px 12px`, borderBottom: '1px solid var(--line)', borderLeft: `3px solid ${CD[f.cat]}` }}>
              <span style={{ color: 'var(--dim)', width: 70 }}>{f.t}</span>
              <AppIcon app={f.app} size={20} />
              <span style={{ width: 128, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.app}</span>
              <span style={{ color: 'var(--dim)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.win}</span>
              <span style={{ width: 60, textAlign: 'right', color: 'var(--dim)' }}>{f.kb}kb</span>
              <span style={{ width: 56, textAlign: 'right', color: 'var(--dim)' }}>{f.ms}ms</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '11px 15px', borderTop: '1px solid var(--line)', color: 'var(--dim)' }}>
          <span style={{ color: 'var(--green)' }}>$</span>
          {streaming ? <span>watching…</span> : <span>{collector ? 'paused' : 'collector stopped — '}{!collector && <span className="ec-link" onClick={() => setCollector(true)}>ec start</span>}</span>}
          <span className="ec-cur"></span>
        </div>
      </Panel>
    </div>
  );
}

Object.assign(window, { TodayView, TimelineView, ProjectsView, ActivityView });
