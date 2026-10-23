import { getSessionActor } from "@/lib/auth-session";
import { getCampaignD1 } from "@/lib/campaigns/service";
import { loadCampaignAccess } from "@/lib/campaigns/service";
import { env } from "cloudflare:workers";
import { listJournal } from "@/lib/campaigns/journal";
import { hasJournalAttachmentReference } from "@/lib/campaigns/journal-files";

export async function GET(request:Request,context:{params:Promise<{id:string;fileId:string}>}){
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
 const page=visible.entries.find(entry=>entry.id===file.entryId&&entry.kind==="page");
 if(!page)return Response.json({error:"Not found."},{status:404});
 if(!visible.canEdit){
  if(!hasJournalAttachmentReference(page.content,id,fileId))return Response.json({error:"Not found."},{status:404});
 }
 const object=await env.BUCKET.get(file.storageKey);
 if(!object)return Response.json({error:"Not found."},{status:404});
 return new Response(object.body,{headers:{"Content-Type":file.mimeType,"X-Content-Type-Options":"nosniff","Cache-Control":"private, no-store","Content-Security-Policy":"sandbox","X-Frame-Options":"DENY"}});
}
