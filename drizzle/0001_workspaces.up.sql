CREATE TABLE IF NOT EXISTS workspaces (
  workspace_key TEXT PRIMARY KEY NOT NULL,
  state_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
