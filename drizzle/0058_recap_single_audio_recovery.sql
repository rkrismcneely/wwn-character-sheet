-- Existing jobs preserve their original Gemini analysis model. A failed
-- single-file audio interaction gets at most one explicitly consented,
-- provider-verified delayed recovery; old jobs remain excluded by 0057 opt-in.
ALTER TABLE campaign_recap_audio_summary_jobs
  ADD COLUMN audio_analysis_model TEXT NOT NULL DEFAULT 'gemini-3.8-flash'
  CHECK(audio_analysis_model IN ('gemini-3.8-flash','gemini-3.6-flash'));
ALTER TABLE campaign_recap_audio_summary_jobs
  ADD COLUMN single_audio_retry_count INTEGER NOT NULL DEFAULT 0
  CHECK(single_audio_retry_count BETWEEN 0 AND 1);
ALTER TABLE campaign_recap_audio_summary_jobs
  ADD COLUMN audio_retry_not_before TEXT;
