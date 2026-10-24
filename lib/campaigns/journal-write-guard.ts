/** Couple attachment existence to the page write, so cleanup cannot win a race. */
export function journalAttachmentWriteGuard(content:string,publicCampaignId:string,campaignId:string){
 const ids=new Set<string>();
 const pattern=/\/api\/campaigns\/(cmp_[A-Za-z0-9_-]{22})\/journal\/files\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/giu;
 for(const match of content.matchAll(pattern))if(match[1]===publicCampaignId)ids.add(match[2]);
 if(!ids.size)return {sql:"",bindings:[] as (string|number)[]};
 return {
  sql:" AND (SELECT count(*) FROM campaign_journal_files WHERE campaign_id=? AND id IN (SELECT value FROM json_each(?)))=?",
  bindings:[campaignId,JSON.stringify([...ids]),ids.size] as (string|number)[],
 };
}
