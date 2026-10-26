CREATE TABLE campaign_availability (
 campaign_id text NOT NULL REFERENCES campaigns(id) ON DELETE cascade,
 user_id text NOT NULL REFERENCES user(id) ON DELETE cascade,
 session_date text NOT NULL,
 status text NOT NULL CHECK(status IN ('yes','maybe','no')),
 updated_at text NOT NULL,
 PRIMARY KEY (campaign_id,user_id,session_date)
);
--> statement-breakpoint
CREATE INDEX campaign_availability_by_date_idx ON campaign_availability(campaign_id,session_date);
