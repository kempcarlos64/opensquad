PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS organic_video_projects (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  brief_json TEXT NOT NULL,
  final_script_json TEXT,
  selected_avatar_id TEXT,
  selected_voice_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS organic_video_projects_status_idx ON organic_video_projects(status);
CREATE INDEX IF NOT EXISTS organic_video_projects_created_at_idx ON organic_video_projects(created_at);

CREATE TABLE IF NOT EXISTS script_candidates (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL REFERENCES organic_video_projects(id) ON DELETE CASCADE,
  agent_type TEXT NOT NULL,
  version INTEGER NOT NULL,
  prompt_version TEXT NOT NULL,
  model TEXT NOT NULL,
  latency_ms INTEGER NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost REAL NOT NULL DEFAULT 0,
  output_json TEXT,
  score REAL,
  error_message TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE UNIQUE INDEX IF NOT EXISTS script_candidates_project_agent_version_uq
  ON script_candidates(project_id, agent_type, version);
CREATE INDEX IF NOT EXISTS script_candidates_project_idx ON script_candidates(project_id);

CREATE TABLE IF NOT EXISTS convergence_runs (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL REFERENCES organic_video_projects(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  decision TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  model TEXT NOT NULL,
  latency_ms INTEGER NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost REAL NOT NULL DEFAULT 0,
  output_json TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE UNIQUE INDEX IF NOT EXISTS convergence_runs_project_version_uq
  ON convergence_runs(project_id, version);
CREATE INDEX IF NOT EXISTS convergence_runs_project_idx ON convergence_runs(project_id);

CREATE TABLE IF NOT EXISTS video_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL REFERENCES organic_video_projects(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'heygen',
  provider_video_id TEXT,
  idempotency_key TEXT NOT NULL,
  plan_hash TEXT NOT NULL,
  status TEXT NOT NULL,
  request_json TEXT,
  response_json TEXT,
  source_video_url TEXT,
  stored_source_path TEXT,
  final_video_path TEXT,
  srt_path TEXT,
  timeline_json TEXT,
  estimated_cost REAL NOT NULL DEFAULT 0,
  actual_cost REAL,
  poll_attempt INTEGER NOT NULL DEFAULT 0,
  next_poll_at INTEGER,
  error_message TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE UNIQUE INDEX IF NOT EXISTS video_jobs_idempotency_key_uq ON video_jobs(idempotency_key);
CREATE INDEX IF NOT EXISTS video_jobs_project_idx ON video_jobs(project_id);
CREATE INDEX IF NOT EXISTS video_jobs_provider_video_idx ON video_jobs(provider_video_id);
CREATE INDEX IF NOT EXISTS video_jobs_status_poll_idx ON video_jobs(status, next_poll_at);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT REFERENCES organic_video_projects(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_key TEXT,
  payload_json TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE UNIQUE INDEX IF NOT EXISTS audit_events_event_key_uq ON audit_events(event_key);
CREATE INDEX IF NOT EXISTS audit_events_project_created_idx ON audit_events(project_id, created_at);

CREATE TABLE IF NOT EXISTS trend_items (
  id TEXT PRIMARY KEY NOT NULL,
  platform TEXT NOT NULL,
  external_id TEXT,
  source_url TEXT NOT NULL,
  creator_handle TEXT,
  published_at INTEGER,
  views INTEGER,
  baseline_views REAL,
  performance_ratio REAL,
  velocity_score REAL,
  metadata_json TEXT,
  snapshot_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE UNIQUE INDEX IF NOT EXISTS trend_items_snapshot_uq
  ON trend_items(platform, external_id, snapshot_at);
CREATE INDEX IF NOT EXISTS trend_items_performance_idx ON trend_items(performance_ratio);
