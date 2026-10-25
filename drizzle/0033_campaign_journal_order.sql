ALTER TABLE campaign_journal_entries ADD COLUMN sort_order INTEGER;
CREATE INDEX campaign_journal_sibling_order_idx ON campaign_journal_entries (campaign_id,parent_id,sort_order);
