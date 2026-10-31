-- GM-owned AI provider credentials: independent of site-owner keys and Google sign-in.
-- No plaintext API keys or recordings are stored in D1.
CREATE TABLE IF NOT EXISTS user_recap_ai_connections (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK(provider IN ('gemini')),
  status TEXT NOT NULL CHECK(status IN ('connected','disconnected','needs_attention')),
  key_ciphertext TEXT,
  key_nonce TEXT,
  key_version INTEGER,
  key_fingerprint TEXT,
  connected_at TEXT,
  updated_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(user_id,provider),
  CHECK(
    (status='disconnected' AND key_ciphertext IS NULL AND key_nonce IS NULL)
    OR
    (status!='disconnected' AND key_ciphertext IS NOT NULL AND key_nonce IS NOT NULL
      AND key_version=1)
  )
);
CREATE INDEX IF NOT EXISTS user_recap_ai_connections_owner_idx
  ON user_recap_ai_connections(user_id,provider,status);
