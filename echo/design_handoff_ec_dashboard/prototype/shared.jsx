/* Echo — shared viz primitives. Attaches helpers to window. */

// SVG donut. segments: [{value, color}]. Renders rotated so it starts at 12 o'clock.
function Donut({ segments, size = 200, thickness = 20, gap = 0.012, track = 'transparent', round = false }) {
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  let offset = 0;
  const gapLen = gap * c;
  const arcs = segments.map((s, i) => {
    const len = (s.value / total) * c;
    const dash = Math.max(0.0001, len - gapLen);
    const el = (
      <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={s.color} strokeWidth={thickness}
        strokeDasharray={`${dash} ${c - dash}`} strokeDashoffset={-offset}
        strokeLinecap={round ? 'round' : 'butt'} />
    );
    offset += len;
    return el;
  });
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
      {track !== 'transparent' && (
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={thickness} />
      )}
      {arcs}
    </svg>
  );
}

// Horizontal day band. Positions each session inside the working window.
// Props: height, radius, track color, fn (s)=>color override, gapToIdle (show idle as track)
function DayStrip({ height = 46, radius = 10, track = '#ececec', colorFor, hourTicks = false, tickColor = 'rgba(0,0,0,0.06)', onHover }) {
  const E = window.ECHO;
  const span = E.dayEnd - E.dayStart;
  const ticks = [];
  if (hourTicks) {
    const startH = Math.ceil(E.dayStart / 60);
    const endH = Math.floor(E.dayEnd / 60);
    for (let h = startH; h <= endH; h++) {
      const left = ((h * 60 - E.dayStart) / span) * 100;
      ticks.push(<div key={h} style={{ position: 'absolute', left: left + '%', top: 0, bottom: 0, width: 1, background: tickColor }} />);
    }
  }
  return (
    <div style={{ position: 'relative', height, borderRadius: radius, background: track, overflow: 'hidden' }}>
      {ticks}
      {E.sessions.map((s, i) => {
        const left = ((s.start - E.dayStart) / span) * 100;
        const w = ((s.end - s.start) / span) * 100;
        const col = colorFor ? colorFor(s) : E.CAT_COLOR[s.cat];
        return (
          <div key={i}
            onMouseEnter={onHover ? () => onHover(s) : undefined}
            style={{ position: 'absolute', left: left + '%', width: w + '%', top: 0, bottom: 0, background: col }}
            title={`${s.s}–${s.e}  ${s.app} · ${s.cat}`} />
        );
      })}
    </div>
  );
}

// Hour labels row aligned to a DayStrip
function HourAxis({ every = 1, color = 'rgba(0,0,0,0.35)', size = 11, mono }) {
  const E = window.ECHO;
  const span = E.dayEnd - E.dayStart;
  const startH = Math.ceil(E.dayStart / 60);
  const endH = Math.floor(E.dayEnd / 60);
  const labels = [];
  for (let h = startH; h <= endH; h += every) {
    const left = ((h * 60 - E.dayStart) / span) * 100;
    labels.push(
      <span key={h} style={{ position: 'absolute', left: left + '%', transform: 'translateX(-50%)', fontSize: size, color, fontFamily: mono }}>
        {String(h).padStart(2, '0')}
      </span>
    );
  }
  return <div style={{ position: 'relative', height: size + 4 }}>{labels}</div>;
}

Object.assign(window, { Donut, DayStrip, HourAxis });
