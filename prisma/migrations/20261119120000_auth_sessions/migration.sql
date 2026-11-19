CREATE TABLE IF NOT EXISTS auth_sessions (
  token TEXT PRIMARY KEY,
  id_user TEXT NOT NULL,
  role TEXT NOT NULL,
  id_school TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_expiry ON auth_sessions (expires_at);
