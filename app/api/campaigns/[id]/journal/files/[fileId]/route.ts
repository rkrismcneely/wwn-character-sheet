import { getSessionActor } from "@/lib/auth-session";
import { getCampaignD1 } from "@/lib/campaigns/service";
import { loadCampaignAccess } from "@/lib/campaigns/service";
import { env } from "cloudflare:workers";
import { requireReadableJournalPage } from "@/lib/campaigns/journal";

export async function GET(request:Request,context:{params:Promise<{id:string;fileId:string}>}){
 const actor=await getSessionActor(request);
 if(!actor)return Response.json({error:"Sign in required."},{status:401});
 const {id,fileId}=await context.params;
 const db=await getCampaignD1();
 const access=await loadCampaignAccess(db,actor,id);
 const file=await db.prepare("SELECT entry_id AS entryId, storage_key AS storageKey, mime_type AS mimeType FROM campaign_journal_files WHERE campaign_id=? AND id=?").bind(access.campaign.id,fileId).first<{entryId:string;storageKey:string;mimeType:string}>();
 if(!file)return Response.json({error:"Not found."},{status:404});
 await requireReadableJournalPage(db,actor,id,file.entryId);
 const object=await env.BUCKET.get(file.storageKey);
 if(!object)return Response.json({error:"Not found."},{status:404});
 return new Response(object.body,{headers:{"Content-Type":file.mimeType,"X-Content-Type-Options":"nosniff","Cache-Control":"private, no-store","Content-Security-Policy":"sandbox","X-Frame-Options":"DENY"}});
}
