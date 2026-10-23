import { getSessionActor } from "@/lib/auth-session";
import { getCampaignD1 } from "@/lib/campaigns/service";
import { loadCampaignAccess } from "@/lib/campaigns/service";
import { env } from "cloudflare:workers";
import { listJournal } from "@/lib/campaigns/journal";
import { hasJournalAttachmentReference } from "@/lib/campaigns/journal-files";
import { canManageCampaignContent } from "@/lib/campaigns/authorization";

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

/** Remove abandoned uploads, but never remove a file referenced by its saved page. */
export async function DELETE(request:Request,context:{params:Promise<{id:string;fileId:string}>}){
 const actor=await getSessionActor(request);
 if(!actor)return Response.json({error:"Sign in required."},{status:401});
 const {id,fileId}=await context.params;
 if(!/^[0-9a-f-]{36}$/iu.test(fileId))return Response.json({error:"Not found."},{status:404});
 const db=await getCampaignD1();
 const access=await loadCampaignAccess(db,actor,id);
 if(!canManageCampaignContent(actor,access.campaign,access.membership))
  return Response.json({error:"Forbidden."},{status:403});
 const file=await db.prepare("SELECT f.storage_key AS storageKey, e.content AS content FROM campaign_journal_files f JOIN campaign_journal_entries e ON e.id=f.entry_id AND e.campaign_id=f.campaign_id WHERE f.campaign_id=? AND f.id=?").bind(access.campaign.id,fileId).first<{storageKey:string;content:string}>();
 if(!file)return Response.json({error:"Not found."},{status:404});
 // A literal reference anywhere in saved content is sufficient to prevent deletion.
 // The deletion endpoint is meant for uploads never attached to a page.
 if(file.content.includes(fileId))return Response.json({error:"File is still referenced by this page."},{status:409});
 await db.prepare("DELETE FROM campaign_journal_files WHERE campaign_id=? AND id=?").bind(access.campaign.id,fileId).run();
 await env.BUCKET.delete(file.storageKey);
 return new Response(null,{status:204});
}
