-- Separate table avoids rebuilding the legacy Gemini-only provider CHECK constraint.
-- Audio and plaintext credentials are never stored here.
CREATE TABLE IF NOT EXISTS user_recap_groq_connections (
 id TEXT PRIMARY KEY NOT NULL,
 user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
 status TEXT NOT NULL CHECK(status IN ('connected','disconnected','needs_attention')),
 key_ciphertext TEXT,
 key_nonce TEXT,
 key_version INTEGER,
 key_fingerprint TEXT,
 connected_at TEXT,
 updated_at TEXT NOT NULL,
 created_at TEXT NOT NULL,
 UNIQUE(user_id),
 CHECK ((status='disconnected' AND key_ciphertext IS NULL AND key_nonce IS NULL) OR
 (status!='disconnected' AND key_ciphertext IS NOT NULL AND key_nonce IS NOT NULL AND key_version=1))
);
CREATE INDEX IF NOT EXISTS user_recap_groq_connections_owner_idx ON user_recap_groq_connections(user_id,status);
