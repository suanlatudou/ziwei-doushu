PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS ai_clients (
  client_id TEXT PRIMARY KEY,
  daily_date TEXT NOT NULL DEFAULT '',
  daily_used INTEGER NOT NULL DEFAULT 0 CHECK (daily_used >= 0),
  credits INTEGER NOT NULL DEFAULT 0 CHECK (credits >= 0),
  vip_until TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ai_cache (
  cache_key TEXT PRIMARY KEY,
  mode TEXT NOT NULL CHECK (mode IN ('chart', 'compatibility')),
  response_text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_cache_expires_at
  ON ai_cache(expires_at);

CREATE TABLE IF NOT EXISTS ai_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('chart', 'compatibility')),
  cache_hit INTEGER NOT NULL DEFAULT 0 CHECK (cache_hit IN (0, 1)),
  charged_kind TEXT NOT NULL CHECK (charged_kind IN ('none', 'free', 'credit', 'vip')),
  units INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_client_created_at
  ON ai_usage(client_id, created_at DESC);
