/** Shared SQL conditions protect attachments referenced by any page in a campaign. */
export const staleJournalFileCandidatesSQL =
 "SELECT f.id FROM campaign_journal_files f WHERE f.campaign_id=? AND f.created_at<? AND NOT EXISTS (SELECT 1 FROM campaign_journal_entries e WHERE e.campaign_id=f.campaign_id AND instr(e.content,f.id)>0) ORDER BY f.created_at LIMIT 25";

export const staleUnreferencedJournalFileSQL =
 "SELECT f.storage_key AS storageKey FROM campaign_journal_files f WHERE f.campaign_id=? AND f.id=? AND f.created_at<? AND NOT EXISTS (SELECT 1 FROM campaign_journal_entries e WHERE e.campaign_id=f.campaign_id AND instr(e.content,f.id)>0)";

export const deleteStaleUnreferencedJournalFileSQL =
 "DELETE FROM campaign_journal_files WHERE campaign_id=? AND id=? AND created_at<? AND NOT EXISTS (SELECT 1 FROM campaign_journal_entries e WHERE e.campaign_id=? AND instr(e.content,campaign_journal_files.id)>0)";

export const deleteUnreferencedJournalFileSQL =
 "DELETE FROM campaign_journal_files WHERE campaign_id=? AND id=? AND NOT EXISTS (SELECT 1 FROM campaign_journal_entries e WHERE e.campaign_id=? AND instr(e.content,?)>0)";

export function journalCleanupCutoff(now:number):string{
 return new Date(now-24*60*60*1000).toISOString();
}
