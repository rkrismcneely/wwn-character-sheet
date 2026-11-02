-- Writer selection belongs to the GM; existing users default to Groq GPT-OSS 120B.
-- The scheduler must not enable Groq generation until the writer handoff is implemented.
ALTER TABLE user_recap_auto_preferences ADD COLUMN writer_model TEXT NOT NULL DEFAULT 'groq:openai/gpt-oss-120b' CHECK (writer_model IN ('groq:openai/gpt-oss-120b','groq:openai/gpt-oss-20b','gemini:gemini-3.8-flash'));
