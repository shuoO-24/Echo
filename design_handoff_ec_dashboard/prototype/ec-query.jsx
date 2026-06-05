/* Echo — ec:// QUERY view. A small, real, read-only SQL console over window.ECHO.sessions.
   Supports: select <cols|aggregates> from sessions [where ... and ...] [group by col]
             [order by col|alias asc|desc] [limit n]   + meta: help / schema / clear
   Exports window.QueryView. */
const { useState: useStateQ, useRef: useRefQ, useEffect: useEffectQ } = React;

const Q_NUM = new Set(['mins', 'duration', 'kb', 'ms', 'count', 'sessions', 'n', 'keys', 'total', 'avg']);
const Q_COLS = ['app', 'cat', 'project', 'title', 'mins', 'kb', 'ms', 'start', 'end'];

function qColKey(name) {
  const n = String(name).toLowerCase().trim();
  if (n === 'category') return 'cat';
  if (n === 'duration') return 'mins';
  if (n === 'keystrokes') return 'kb';
  return n;
}
function qSplitList(s) {
  const out = []; let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '(') depth++; if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map((x) => x.trim());
}
const qErr = (msg, hint) => ({ type: 'error', msg, hint });
const qIsAgg = (s) => /(sum|count|avg|min|max)\s*\(/i.test(s);

function qBaseRows() {
  return window.ECHO.sessions.map((s) => ({
    app: s.app, cat: s.cat, category: s.cat, project: s.project || '(none)',
    title: s.title, mins: s.mins, duration: s.mins, kb: s.kb, ms: s.ms, start: s.start, end: s.end,
  }));
}
function qFmtCell(col, v) {
  if (v == null) return '';
  if (col === 'start' || col === 'end') return window.ECHO.fmtClock(v);
  return v;
}
function qParseCond(c) {
  const m = /(\w+)\s*(>=|<=|!=|=|>|<|like)\s*('([^']*)'|\d+(?:\.\d+)?)/i.exec(c);
  if (!m) return null;
  const col = qColKey(m[1]); const op = m[2].toLowerCase();
  const isStr = /^'/.test(m[3]); const val = isStr ? m[4] : +m[3];
  return (r) => {
    let cell = r[col]; if (cell == null) cell = '';
    if (typeof val === 'number') {
      const n = +cell;
      return op === '=' ? n === val : op === '!=' ? n !== val : op === '>' ? n > val : op === '<' ? n < val : op === '>=' ? n >= val : op === '<=' ? n <= val : true;
    }
    const s = String(cell).toLowerCase(), v = String(val).toLowerCase();
    return op === '=' ? s === v : op === '!=' ? s !== v : op === 'like' ? s.includes(v.replace(/%/g, '')) : true;
  };
}
function qAgg(fn, arg, grp) {
  if (fn === 'count') return grp.length;
  const vals = grp.map((r) => +r[arg] || 0);
  if (fn === 'sum') return vals.reduce((a, b) => a + b, 0);
  if (fn === 'avg') return Math.round(vals.reduce((a, b) => a + b, 0) / (vals.length || 1));
  if (fn === 'min') return Math.min(...vals);
  if (fn === 'max') return Math.max(...vals);
  return 0;
}

function runQuery(input) {
  const q = (input || '').trim();
  if (!q) return null;
  const lower = q.toLowerCase().replace(/;$/, '');
  if (lower === 'help' || lower === '?') return { type: 'help' };
  if (lower === 'clear' || lower === 'cls') return { type: 'clear' };
  if (['schema', '.schema', 'tables', '.tables', 'describe sessions'].includes(lower)) return { type: 'schema' };

  const m = /^\s*select\s+([\s\S]+?)\s+from\s+(\w+)([\s\S]*)$/i.exec(q.replace(/;$/, ''));
  if (!m) return qErr('Expected a SELECT statement.', 'try: select app, sum(mins) from sessions group by app order by sum(mins) desc');
  const table = m[2].toLowerCase();
  if (!['sessions', 'events', 'echo', 'activity'].includes(table)) return qErr(`unknown table "${m[2]}"`, 'available table: sessions');

  const selList = qSplitList(m[1]);
  const rest = m[3] || '';
  let rows = qBaseRows();

  const wm = /where\s+([\s\S]+?)(?:\s+group\s+by|\s+order\s+by|\s+limit|$)/i.exec(rest);
  if (wm) {
    const conds = wm[1].split(/\s+and\s+/i).map(qParseCond).filter(Boolean);
    if (!conds.length) return qErr('Could not parse WHERE clause.', "try: where project = 'echo'");
    rows = rows.filter((r) => conds.every((c) => c(r)));
  }
  const gm = /group\s+by\s+(\w+)/i.exec(rest);
  const groupCol = gm ? qColKey(gm[1]) : null;
  const om = /order\s+by\s+([\s\S]+?)(?:\s+limit|$)/i.exec(rest);
  const lm = /limit\s+(\d+)/i.exec(rest);
  const limit = lm ? +lm[1] : null;

  let columns, data;
  if (qIsAgg(m[1]) || groupCol) {
    const groups = new Map();
    if (groupCol) rows.forEach((r) => { const k = r[groupCol]; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); });
    else groups.set('*', rows);
    const specs = selList.map((item) => {
      const aliasM = /\s+as\s+(\w+)\s*$/i.exec(item);
      const alias = aliasM ? aliasM[1] : null;
      const expr = item.replace(/\s+as\s+\w+\s*$/i, '').trim();
      const am = /(sum|count|avg|min|max)\s*\(\s*(\*|\w+)\s*\)/i.exec(expr);
      if (am) return { kind: 'agg', fn: am[1].toLowerCase(), arg: qColKey(am[2]), label: alias || expr, num: true };
      return { kind: 'col', col: qColKey(expr), label: alias || expr, num: Q_NUM.has(qColKey(expr)) };
    });
    columns = specs.map((s) => ({ key: s.label, label: s.label, num: s.num }));
    data = [];
    for (const [k, grp] of groups) {
      const o = {};
      specs.forEach((s) => {
        if (s.kind === 'col') o[s.label] = (s.col === groupCol) ? k : qFmtCell(s.col, grp[0][s.col]);
        else o[s.label] = qAgg(s.fn, s.arg, grp);
      });
      data.push(o);
    }
  } else {
    let cols;
    if (selList.length === 1 && selList[0] === '*') cols = Q_COLS.slice();
    else cols = selList.map((c) => qColKey(c.replace(/\s+as\s+\w+\s*$/i, '')));
    const bad = cols.find((c) => !Q_COLS.includes(c));
    if (bad) return qErr(`unknown column "${bad}"`, 'columns: ' + Q_COLS.join(', '));
    columns = cols.map((c) => ({ key: c, label: c, num: Q_NUM.has(c) }));
    data = rows.map((r) => { const o = {}; cols.forEach((c) => { o[c] = qFmtCell(c, r[c]); }); return o; });
  }

  if (om) {
    let token = om[1].trim(); let dir = 1;
    const dm = /\s+(asc|desc)\s*$/i.exec(token);
    if (dm) { dir = /desc/i.test(dm[1]) ? -1 : 1; token = token.slice(0, dm.index).trim(); }
    let col = columns.find((c) => c.label.toLowerCase() === token.toLowerCase());
    if (!col) { const ck = qColKey(token); col = columns.find((c) => c.label.toLowerCase() === ck.toLowerCase()); }
    if (col) {
      const key = col.key, num = col.num;
      data = [...data].sort((a, b) => {
        let x = a[key], y = b[key];
        if (num) { x = parseFloat(String(x).replace(/[^0-9.-]/g, '')) || 0; y = parseFloat(String(y).replace(/[^0-9.-]/g, '')) || 0; return (x - y) * dir; }
        return String(x).localeCompare(String(y)) * dir;
      });
    }
  }
  const totalRows = data.length;
  if (limit != null) data = data.slice(0, limit);
  return { type: 'table', columns, data, meta: `${totalRows} row${totalRows === 1 ? '' : 's'} · ${(1.6 + Math.random() * 7).toFixed(1)}ms` };
}

const Q_EXAMPLES = [
  "select cat, sum(mins) as mins, count(*) as sessions from sessions group by cat order by mins desc",
  "select app, sum(mins) as mins from sessions group by app order by mins desc",
  "select * from sessions where project = 'echo'",
  "select project, sum(mins) as mins from sessions group by project order by mins desc",
  "select app, sum(kb) as keys from sessions group by app order by keys desc limit 3",
];

/* ----- result renderers ----- */
function QTable({ res, dens }) {
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: dens.fs, minWidth: '60%' }}>
          <thead>
            <tr>
              {res.columns.map((c, i) => (
                <th key={i} style={{ textAlign: c.num ? 'right' : 'left', color: 'var(--accent)', fontWeight: 500, padding: '5px 18px 7px 0', borderBottom: '1px solid var(--line)', whiteSpace: 'nowrap' }}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {res.data.map((row, ri) => (
              <tr key={ri} className="ec-row">
                {res.columns.map((c, ci) => (
                  <td key={ci} style={{ textAlign: c.num ? 'right' : 'left', padding: '5px 18px 5px 0', borderBottom: '1px solid var(--line)', color: c.num ? 'var(--fg)' : 'var(--fg)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {c.num ? Number(row[c.key]).toLocaleString() : String(row[c.key])}
                  </td>
                ))}
              </tr>
            ))}
            {res.data.length === 0 && (
              <tr><td colSpan={res.columns.length} style={{ padding: '8px 0', color: 'var(--dim)' }}>(no rows)</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div style={{ color: 'var(--dim)', marginTop: 7 }}>{res.meta}</div>
    </div>
  );
}
function QText({ lines }) {
  return (
    <div style={{ marginTop: 6, borderLeft: '2px solid var(--line)', paddingLeft: 14 }}>
      {lines.map((l, i) => (
        <div key={i} style={{ display: 'flex', gap: 14, padding: '1.5px 0', color: l.dim ? 'var(--dim)' : 'var(--fg)' }}>
          <span style={{ color: l.key ? 'var(--accent)' : (l.dim ? 'var(--dim)' : 'var(--fg)'), minWidth: l.k ? 96 : 0 }}>{l.k || ''}</span>
          <span style={{ color: l.dim ? 'var(--dim)' : 'var(--fg)' }}>{l.t}</span>
          {l.d && <span style={{ color: 'var(--dim)' }}>{l.d}</span>}
        </div>
      ))}
    </div>
  );
}
function renderRes(res, dens) {
  if (!res) return null;
  if (res.type === 'table') return <QTable res={res} dens={dens} />;
  if (res.type === 'error') return (
    <div style={{ marginTop: 6, color: 'var(--red)' }}>✗ {res.msg}{res.hint && <div style={{ color: 'var(--dim)', marginTop: 3 }}>↳ {res.hint}</div>}</div>
  );
  if (res.type === 'help') return <QText lines={[
    { k: 'select …', t: 'from sessions', d: 'run a read-only query' },
    { k: 'schema', t: 'show columns & types' },
    { k: 'clear', t: 'clear the scrollback' },
    { k: 'help', t: 'this message' },
    { t: '' },
    { dim: true, t: 'columns: ' + Q_COLS.join(', ') },
    { dim: true, t: 'supports: where (= != > < like, chained with and), group by, order by, limit' },
  ]} />;
  if (res.type === 'schema') return <QText lines={[
    { k: 'sessions', t: '', d: 'read-only · echo.duckdb' },
    { k: 'app', t: 'text', d: 'foreground application' },
    { k: 'title', t: 'text', d: 'window title' },
    { k: 'project', t: 'text', d: 'inferred project · nullable' },
    { k: 'cat', t: 'text', d: 'activity category' },
    { k: 'mins', t: 'integer', d: 'active minutes' },
    { k: 'kb', t: 'integer', d: 'keystrokes' },
    { k: 'ms', t: 'integer', d: 'mouse events' },
    { k: 'start', t: 'integer', d: 'minutes from midnight' },
    { k: 'end', t: 'integer', d: 'minutes from midnight' },
  ]} />;
  return null;
}

function QueryView({ dens, compact }) {
  const [entries, setEntries] = useStateQ(() => {
    const seed = "select cat, sum(mins) as mins, count(*) as sessions from sessions group by cat order by mins desc";
    return [{ cmd: seed, res: runQuery(seed) }];
  });
  const [input, setInput] = useStateQ('');
  const [hist, setHist] = useStateQ([]);
  const [hi, setHi] = useStateQ(-1);
  const scrollRef = useRefQ(null);
  const inputRef = useRefQ(null);

  useEffectQ(() => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight; }, [entries]);

  const submit = (raw) => {
    const cmd = (raw == null ? input : raw).trim();
    if (!cmd) return;
    const res = runQuery(cmd);
    if (res && res.type === 'clear') { setEntries([]); }
    else setEntries((e) => [...e, { cmd, res }]);
    setHist((h) => [...h, cmd]); setHi(-1); setInput('');
    if (inputRef.current) inputRef.current.focus();
  };
  const onKey = (e) => {
    if (e.key === 'Enter') { submit(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHist((h) => { const ni = hi < 0 ? h.length - 1 : Math.max(0, hi - 1); if (h[ni] != null) { setHi(ni); setInput(h[ni]); } return h; }); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setHist((h) => { if (hi < 0) return h; const ni = hi + 1; if (ni >= h.length) { setHi(-1); setInput(''); } else { setHi(ni); setInput(h[ni]); } return h; }); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 7, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 15px', borderBottom: '1px solid var(--line)' }}>
          <span style={{ color: 'var(--accent)', letterSpacing: '0.12em' }}>▸ QUERY</span>
          <span style={{ color: 'var(--dim)' }}>read-only · echo.duckdb</span>
        </div>

        {/* scrollback */}
        <div ref={scrollRef} style={{ padding: 15, maxHeight: compact ? 210 : '52vh', overflowY: 'auto' }}>
          {entries.map((en, i) => (
            <div key={i} style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', gap: 9, alignItems: 'baseline', color: 'var(--fg)' }}>
                <span style={{ color: 'var(--green)' }}>$</span>
                <span style={{ wordBreak: 'break-word' }}>{en.cmd}</span>
              </div>
              {renderRes(en.res, dens)}
            </div>
          ))}
        </div>

        {/* input line */}
        <div style={{ display: 'flex', gap: 9, alignItems: 'center', padding: '12px 15px', borderTop: '1px solid var(--line)' }}>
          <span style={{ color: 'var(--green)' }}>$</span>
          <input ref={inputRef} value={input} autoFocus={!compact} spellCheck={false}
            onChange={(e) => setInput(e.target.value)} onKeyDown={onKey}
            placeholder="select app, sum(mins) from sessions group by app order by sum(mins) desc"
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--fg)', font: 'inherit', caretColor: 'var(--accent)', padding: 0 }} />
          <span style={{ color: 'var(--dim)', fontSize: dens.fs - 1 }}>↵ run · ↑↓ history</span>
        </div>
      </div>

      {/* example chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <span style={{ color: 'var(--faint)', marginRight: 2 }}>try</span>
        {(compact ? Q_EXAMPLES.slice(0, 3) : Q_EXAMPLES).map((q, i) => (
          <span key={i} onClick={() => submit(q)} className="ec-act"
            style={{ cursor: 'pointer', color: 'var(--dim)', border: '1px solid var(--line)', borderRadius: 5, padding: '4px 9px', fontSize: dens.fs - 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 260 }}
            title={q}>{q.replace(/^select\s+/i, '').replace(/\s+/g, ' ')}</span>
        ))}
        <span onClick={() => submit('help')} className="ec-act" style={{ cursor: 'pointer', color: 'var(--accent)', borderRadius: 5, padding: '4px 9px', fontSize: dens.fs - 1 }}>help</span>
      </div>
    </div>
  );
}
Object.assign(window, { QueryView });
