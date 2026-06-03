SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS raw_events (
    ts TIMESTAMP NOT NULL,
    app TEXT NOT NULL,
    window_title TEXT,
    url_host TEXT,
    repo TEXT,
    branch TEXT,
    idle BOOLEAN DEFAULT FALSE,
    kb_count INTEGER DEFAULT 0,
    mouse_count INTEGER DEFAULT 0,
    typed_text TEXT,
    in_meeting BOOLEAN DEFAULT FALSE,
    source TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    start_ts TIMESTAMP NOT NULL,
    end_ts TIMESTAMP NOT NULL,
    app TEXT NOT NULL,
    primary_title TEXT,
    repo TEXT,
    category TEXT,
    summary TEXT,
    label_source TEXT,
    kb_total INTEGER DEFAULT 0,
    mouse_total INTEGER DEFAULT 0,
    switch_count INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS daily_rollups (
    date DATE NOT NULL,
    category TEXT NOT NULL,
    app TEXT NOT NULL,
    active_minutes DOUBLE NOT NULL,
    session_count INTEGER NOT NULL,
    switch_count INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS label_cache (
    title_norm TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    summary TEXT NOT NULL,
    source TEXT NOT NULL,
    decided_at TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_raw_events_ts ON raw_events(ts);
CREATE INDEX IF NOT EXISTS idx_raw_events_app ON raw_events(app);
CREATE INDEX IF NOT EXISTS idx_sessions_start_ts ON sessions(start_ts);
ALTER TABLE raw_events ADD COLUMN IF NOT EXISTS typed_text TEXT;
"""
