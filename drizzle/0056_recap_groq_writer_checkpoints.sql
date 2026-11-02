-- One completed, immutable Groq scene-compression output per job and source section.
-- A final recap is generated only after every part has been checkpointed.
CREATE TABLE IF NOT EXISTS campaign_recap_groq_writer_parts (
 job_id TEXT NOT NULL REFERENCES campaign_recap_audio_summary_jobs(id) ON DELETE CASCADE,
 part_index INTEGER NOT NULL CHECK(part_index>=0),
 notes TEXT NOT NULL CHECK(length(notes)>0 AND length(notes)<=4000),
 created_at TEXT NOT NULL,
 PRIMARY KEY(job_id,part_index)
);
