CREATE TABLE campaign_prepared_encounters (id text PRIMARY KEY NOT NULL,campaign_id text NOT NULL REFERENCES campaigns(id) ON DELETE cascade,name text NOT NULL,entries_json text NOT NULL,created_at text NOT NULL,updated_at text NOT NULL);
CREATE INDEX campaign_prepared_encounters_campaign_idx ON campaign_prepared_encounters(campaign_id,updated_at);
