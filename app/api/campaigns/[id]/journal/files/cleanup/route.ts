import { getSessionActor } from "@/lib/auth-session";
import { getCampaignD1, loadCampaignAccess } from "@/lib/campaigns/service";
import { canManageCampaignContent } from "@/lib/campaigns/authorization";
import { campaignErrorResponse } from "@/lib/campaigns/http";
import { env } from "cloudflare:workers";

/** Opportunistic cleanup for uploads orphaned by closed tabs or interrupted imports. */
export async function POST(request:Request,context:{params:Promise<{id:string}>}):Promise<Response>{
 try{
  const actor=await getSessionActor(request);
  if(!actor)return Response.json({error:"Sign in required."},{status:401});
  const {id}=await context.params;
  const db=await getCampaignD1();
  const access=await loadCampaignAccess(db,actor,id);
  if(!canManageCampaignContent(actor,access.campaign,access.membership))
   return Response.json({error:"Forbidden."},{status:403});
  // Grace period prevents deleting a file while a still-open editor is preparing to save it.
  const cutoff=new Date(Date.now()-24*60*60*1000).toISOString();
  const candidates=await db.prepare(
   "SELECT f.id FROM campaign_journal_files f WHERE f.campaign_id=? AND f.created_at<? AND NOT EXISTS (SELECT 1 FROM campaign_journal_entries e WHERE e.campaign_id=f.campaign_id AND instr(e.content,f.id)>0) ORDER BY f.created_at LIMIT 25"
  ).bind(access.campaign.id,cutoff).all<{id:string}>();
  let removed=0,failed=0;
  for(const candidate of candidates.results){
   // Recheck references at deletion time, including references from other pages.
   const deleted=await db.prepare(
    "DELETE FROM campaign_journal_files WHERE campaign_id=? AND id=? AND created_at<? AND NOT EXISTS (SELECT 1 FROM campaign_journal_entries e WHERE e.campaign_id=? AND instr(e.content,campaign_journal_files.id)>0) RETURNING storage_key AS storageKey"
   ).bind(access.campaign.id,candidate.id,cutoff,access.campaign.id).first<{storageKey:string}>();
   if(!deleted)continue;
   try{await env.BUCKET.delete(deleted.storageKey);removed++;}catch{failed++;}
  }
  return Response.json({removed,failed});
 }catch(error){return campaignErrorResponse(error,"Unused journal files could not be cleaned.");}
}
