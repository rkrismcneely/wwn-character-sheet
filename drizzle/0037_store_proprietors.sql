ALTER TABLE campaign_stores ADD COLUMN proprietor_name TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE campaign_stores ADD COLUMN proprietor_description TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE campaign_stores ADD COLUMN proprietor_npc_id TEXT;
