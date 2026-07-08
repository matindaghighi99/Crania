CREATE TABLE scientists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  photo_url TEXT NOT NULL,
  profile_url TEXT NOT NULL,
  search_key TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_scientists_search_key ON scientists (search_key);

CREATE TABLE login_attempts (
  ip TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  first_attempt_at INTEGER NOT NULL
);
