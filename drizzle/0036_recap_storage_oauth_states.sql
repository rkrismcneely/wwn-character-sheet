-- Single-use, short-lived, user-bound OAuth state. No tokens in this table.
CREATE TABLE IF NOT EXISTS user_recap_storage_oauth_states (
  state_hash TEXT PRIMARY KEY NOT NULL
    CHECK(length(state_hash) = 64),
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  CHECK(expires_at > created_at AND expires_at - created_at <= 600000)
);
CREATE INDEX IF NOT EXISTS user_recap_storage_oauth_states_owner_idx
  ON user_recap_storage_oauth_states(user_id,expires_at);
