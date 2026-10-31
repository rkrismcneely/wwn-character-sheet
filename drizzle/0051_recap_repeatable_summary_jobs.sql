-- Preserve all previous GM-approved results while allowing additional recap versions.
-- Rebuild the small jobs table to remove the original UNIQUE(audio_asset_id)
-- constraint. Never discard original jobs, model output, or encrypted staging state.
PRAGMA defer_foreign_keys=ON;
CREATE TABLE campaign_recap_audio_summary_jobs_next (
  id TEXT PRIMARY KEY NOT NULL,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  recap_id TEXT NOT NULL REFERENCES campaign_session_recaps(id) ON DELETE CASCADE,
  audio_asset_id TEXT NOT NULL REFERENCES campaign_recap_audio_assets(id) ON DELETE CASCADE,
  requested_by TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending_upload'
    CHECK(status IN ('pending_upload','transferring','uploaded','submitting','submitted','ready','failed','needs_attention')),
  detail TEXT NOT NULL CHECK(detail IN ('brief','standard','detailed')),
  model TEXT NOT NULL,
  file_uri TEXT,
  file_name TEXT,
  interaction_id TEXT,
  generated_markdown TEXT,
  error_code TEXT,
  claimed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  confirmed_at TEXT,
  stage_url_ciphertext TEXT,
  stage_url_nonce TEXT,
  stage_url_version INTEGER,
  stage_offset INTEGER NOT NULL DEFAULT 0,
  stage_error_code TEXT,
  request_id TEXT
);
INSERT INTO campaign_recap_audio_summary_jobs_next
(id,campaign_id,recap_id,audio_asset_id,requested_by,status,detail,model,
 file_uri,file_name,interaction_id,generated_markdown,error_code,claimed_at,
 created_at,updated_at,confirmed_at,stage_url_ciphertext,stage_url_nonce,
 stage_url_version,stage_offset,stage_error_code)
SELECT id,campaign_id,recap_id,audio_asset_id,requested_by,status,detail,model,
 file_uri,file_name,interaction_id,generated_markdown,error_code,claimed_at,
 created_at,updated_at,confirmed_at,stage_url_ciphertext,stage_url_nonce,
 stage_url_version,stage_offset,stage_error_code
FROM campaign_recap_audio_summary_jobs;
DROP TABLE campaign_recap_audio_summary_jobs;
ALTER TABLE campaign_recap_audio_summary_jobs_next RENAME TO campaign_recap_audio_summary_jobs;
CREATE INDEX campaign_recap_audio_summary_jobs_schedule_idx
  ON campaign_recap_audio_summary_jobs(status,updated_at,created_at);
CREATE INDEX campaign_recap_audio_summary_jobs_owner_idx
  ON campaign_recap_audio_summary_jobs(requested_by,recap_id,created_at DESC);
CREATE INDEX campaign_recap_audio_summary_confirmed_idx
  ON campaign_recap_audio_summary_jobs(confirmed_at,status,updated_at);
CREATE UNIQUE INDEX campaign_recap_summary_one_active_audio_idx
  ON campaign_recap_audio_summary_jobs(audio_asset_id)
  WHERE status IN ('pending_upload','transferring','uploaded','submitting','submitted');
CREATE UNIQUE INDEX campaign_recap_summary_request_dedupe_idx
  ON campaign_recap_audio_summary_jobs(requested_by,request_id) WHERE request_id IS NOT NULL;
