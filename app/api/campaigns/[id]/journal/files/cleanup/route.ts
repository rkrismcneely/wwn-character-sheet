import { getSessionActor } from "@/lib/auth-session";
import { getCampaignD1, loadCampaignAccess } from "@/lib/campaigns/service";
import { canManageCampaignContent } from "@/lib/campaigns/authorization";
import { campaignErrorResponse } from "@/lib/campaigns/http";
import { env } from "cloudflare:workers";
import { staleJournalFileCandidatesSQL, removeUnusedJournalFile, journalCleanupCutoff } from "@/lib/campaigns/journal-file-cleanup";

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
  const cutoff=journalCleanupCutoff(Date.now());
  const candidates=await db.prepare(
   staleJournalFileCandidatesSQL
  ).bind(access.campaign.id,cutoff).all<{id:string}>();
  let removed=0,failed=0;
  for(const candidate of candidates.results){
   try{
    if(await removeUnusedJournalFile(db,env.BUCKET,access.campaign.id,candidate.id,cutoff))removed++;
   }catch{failed++;}
  }
  return Response.json({removed,failed});
 }catch(error){return campaignErrorResponse(error,"Unused journal files could not be cleaned.");}
}
