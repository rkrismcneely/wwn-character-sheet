import { retireR2Object, recoveryPrefixForObject } from "../r2-recovery.ts";
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

type JournalFileRecord={
 id:string;campaign_id:string;entry_id:string;filename:string;mime_type:string;
 byte_size:number;storage_key:string;created_at:string;
};
/** Atomically remove metadata first; guarded page writes cannot attach it afterward.
 * Storage failures restore the record, and retirement preserves a private recovery copy. */
export async function removeUnusedJournalFile(db:D1Database,bucket:R2Bucket,campaignId:string,fileId:string,cutoff?:string){
 const sql=cutoff?deleteStaleUnreferencedJournalFileSQL:deleteUnreferencedJournalFileSQL;
 const bindings=cutoff?[campaignId,fileId,cutoff,campaignId]:[campaignId,fileId,campaignId,fileId];
 const file=await db.prepare(sql+" RETURNING *").bind(...bindings).first<JournalFileRecord>();
 if(!file)return false;
 try{
  await retireR2Object(bucket,file.storage_key);
 }catch(error){
  await db.prepare("INSERT OR IGNORE INTO campaign_journal_files (id,campaign_id,entry_id,filename,mime_type,byte_size,storage_key,created_at) VALUES (?,?,?,?,?,?,?,?)")
   .bind(file.id,file.campaign_id,file.entry_id,file.filename,file.mime_type,file.byte_size,file.storage_key,file.created_at).run();
  throw error;
 }
 return true;
}

/** Handle an ambiguous object deletion without making a saved link unreadable. */
export async function readableJournalObject(bucket:R2Bucket,key:string){
 const current=await bucket.get(key);
 if(current)return current;
 const backups=await bucket.list({prefix:recoveryPrefixForObject(key),limit:1});
 const backup=backups.objects[0];
 if(!backup)return null;
 const archived=await bucket.get(backup.key);
 if(!archived)return null;
 try{
  await bucket.put(key,archived.body,{httpMetadata:archived.httpMetadata});
  return await bucket.get(key);
 }catch{
  return await bucket.get(backup.key);
 }
}
