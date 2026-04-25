CREATE TABLE rooms (
  code             TEXT PRIMARY KEY,
  created_at       INTEGER NOT NULL,
  last_active_at   INTEGER NOT NULL
);

CREATE TABLE completed_entries (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  room_code            TEXT    NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
  agent_identity_json  TEXT    NOT NULL,
  tool                 TEXT    NOT NULL,
  repo                 TEXT    NOT NULL,
  branch               TEXT,
  intent               TEXT    NOT NULL,
  files_json           TEXT    NOT NULL,
  started_at           INTEGER NOT NULL,
  completed_at         INTEGER NOT NULL,
  completion_reason    TEXT    NOT NULL,
  summary              TEXT
);

CREATE INDEX idx_completed_entries_room_completed_at
  ON completed_entries (room_code, completed_at DESC);
