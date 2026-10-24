CREATE TABLE campaign_journal_files (
 id text PRIMARY KEY NOT NULL,
 campaign_id text NOT NULL REFERENCES campaigns(id) ON DELETE cascade,
 entry_id text NOT NULL REFERENCES campaign_journal_entries(id) ON DELETE cascade,
 filename text NOT NULL,
 mime_type text NOT NULL,
 byte_size integer NOT NULL,
 storage_key text NOT NULL UNIQUE,
 created_at text NOT NULL
);
--> statement-breakpoint
CREATE INDEX campaign_journal_files_entry_idx ON campaign_journal_files(campaign_id,entry_id);
