import { campaignErrorResponse } from "@/lib/campaigns/http";
import { getSessionActor } from "@/lib/auth-session";
import { getCampaignD1 } from "@/lib/campaigns/service";
import { loadCampaignAccess } from "@/lib/campaigns/service";
import { env } from "cloudflare:workers";
import { listJournal } from "@/lib/campaigns/journal";
import { canReadJournalAttachment } from "@/lib/campaigns/journal-files";
import { canManageCampaignContent } from "@/lib/campaigns/authorization";
import { removeUnusedJournalFile, readableJournalObject } from "@/lib/campaigns/journal-file-cleanup";

export async function GET(request:Request,context:{params:Promise<{id:string;fileId:string}>}){
 try{
 const actor=await getSessionActor(request);
 if(!actor)return Response.json({error:"Sign in required."},{status:401});
 const {id,fileId}=await context.params;
 const db=await getCampaignD1();
 const access=await loadCampaignAccess(db,actor,id);
 const file=await db.prepare("SELECT entry_id AS entryId, storage_key AS storageKey, mime_type AS mimeType FROM campaign_journal_files WHERE campaign_id=? AND id=?").bind(access.campaign.id,fileId).first<{entryId:string;storageKey:string;mimeType:string}>();
 if(!file)return Response.json({error:"Not found."},{status:404});
 // Non-GMs may retrieve only files linked in the redacted, visible page.
 // This prevents guessing an attachment ID from exposing assets in GM-only sections.
 const visible=await listJournal(db,actor,id);
 const allowed=canReadJournalAttachment(visible.entries,visible.canEdit,file.entryId,id,fileId);
 if(!allowed)return Response.json({error:"Not found."},{status:404});
 const object=await readableJournalObject(env.BUCKET,file.storageKey);
 if(!object)return Response.json({error:"Not found."},{status:404});
 return new Response(object.body,{headers:{"Content-Type":file.mimeType,"X-Content-Type-Options":"nosniff","Cache-Control":"private, no-store","Content-Security-Policy":"sandbox","X-Frame-Options":"DENY"}});
 }catch(error){return campaignErrorResponse(error,"Journal file operation failed.");}
}

/** Remove abandoned uploads, but never remove a file referenced by its saved page. */
export async function DELETE(request:Request,context:{params:Promise<{id:string;fileId:string}>}){
 try{
 const actor=await getSessionActor(request);
 if(!actor)return Response.json({error:"Sign in required."},{status:401});
 const {id,fileId}=await context.params;
 if(!/^[0-9a-f-]{36}$/iu.test(fileId))return Response.json({error:"Not found."},{status:404});
 const db=await getCampaignD1();
 const access=await loadCampaignAccess(db,actor,id);
 if(!canManageCampaignContent(actor,access.campaign,access.membership))
  return Response.json({error:"Forbidden."},{status:403});
 const file=await db.prepare(
  "SELECT f.storage_key AS storageKey FROM campaign_journal_files f WHERE f.campaign_id=? AND f.id=?"
 ).bind(access.campaign.id,fileId).first<{storageKey:string}>();
 if(!file)return Response.json({error:"Not found."},{status:404});
 // An attachment can be linked from more than its original page.
 const referenced=await db.prepare(
  "SELECT 1 AS found FROM campaign_journal_entries WHERE campaign_id=? AND instr(content,?)>0 LIMIT 1"
 ).bind(access.campaign.id,fileId).first();
 if(referenced)return Response.json({error:"File is referenced by a saved page."},{status:409});
 const removed=await removeUnusedJournalFile(db,env.BUCKET,access.campaign.id,fileId);
 if(!removed)return Response.json({error:"File is referenced by a saved page."},{status:409});
 return new Response(null,{status:204});
 }catch(error){return campaignErrorResponse(error,"Journal file operation failed.");}
}
