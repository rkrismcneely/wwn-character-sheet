import { getSessionActor } from "@/lib/auth-session";
import { getCampaignD1, loadCampaignAccess } from "@/lib/campaigns/service";
import { canManageCampaignContent } from "@/lib/campaigns/authorization";
import { campaignErrorResponse } from "@/lib/campaigns/http";
import { importJournalNotes } from "@/lib/campaigns/journal";
import { inventoryObsidianVault } from "@/lib/campaigns/journal-import";
import { readBoundedJson, RequestBodyError } from "@/lib/http-json";

type Context={params:Promise<{id:string}>};
export async function POST(request:Request,context:Context):Promise<Response>{
 try{
  const actor=await getSessionActor(request);
  if(!actor)return Response.json({error:"Sign in is required."},{status:401});
  const {id}=await context.params;
  const access=await loadCampaignAccess(await getCampaignD1(),actor,id);
  if(!canManageCampaignContent(actor,access.campaign,access.membership))
   return Response.json({error:"Only GMs can preview journal imports."},{status:403});
  const body=await readBoundedJson(request,1024*1024) as {entries?:unknown;confirm?:boolean;source?:unknown}|null;
  if(!Array.isArray(body?.entries)||body.entries.length>1000)
   return Response.json({error:"Provide an array of up to 1000 vault notes."},{status:422});
  for(const entry of body.entries){
   if(!entry||typeof entry!=="object"||typeof entry.path!=="string"||typeof entry.content!=="string")
    return Response.json({error:"Invalid vault note."},{status:422});
  }
  const source=body.source??"obsidian";
  if(source!=="obsidian"&&source!=="legendkeeper")return Response.json({error:"Unsupported import source."},{status:422});
  const preview=inventoryObsidianVault(body.entries);
  if(body?.confirm===true){
   const result=await importJournalNotes(await getCampaignD1(),actor,id,preview.notes,true,source);
   return Response.json({preview,result,imported:true});
  }
  return Response.json({preview,imported:false});
 }catch(error){
  if(error instanceof RequestBodyError)return Response.json({error:error.message},{status:error.status});
  return campaignErrorResponse(error,"The journal import could not be previewed.");
 }
}
