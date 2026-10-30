import { env } from "cloudflare:workers";
import { getSessionActor } from "@/lib/auth-session";
import { canManageCampaignContent } from "@/lib/campaigns/authorization";
import { campaignErrorResponse } from "@/lib/campaigns/http";
import { getCampaignSessionRecap } from "@/lib/campaigns/session-recaps";
import { CampaignServiceError, getCampaignD1, loadCampaignAccess, requireActiveCampaign } from "@/lib/campaigns/service";
import { normalizeCaptionAssignments, recapTranscriptObjectKey, validateRecapCaptionCues,
  type SavedRecapTranscript, type StoredCaptionCue } from "@/lib/campaigns/recap-full-transcript";
import { readBoundedJson, RequestBodyError } from "@/lib/http-json";

type Context = { params: Promise<{ id: string }> };
async function scope(request: Request, context: Context, recapId: unknown) {
  const actor=await getSessionActor(request);
  if(!actor)throw new CampaignServiceError("Sign in is required.",401);
  const { id }=await context.params;
  const db=await getCampaignD1();
  const access=await loadCampaignAccess(db,actor,id);
  const recap=await getCampaignSessionRecap(db,actor,id,recapId);
  const gm=canManageCampaignContent(actor,access.campaign,access.membership);
  return {db,campaign:access.campaign,gm,recap,key:recapTranscriptObjectKey(access.campaign.id,recap.id)};
}
async function stored(key:string):Promise<SavedRecapTranscript|null> {
  const object=await env.BUCKET.get(key);
  if(!object)return null;
  const data=await object.json<SavedRecapTranscript>();
  if(data.version!==1 || !Array.isArray(data.cues))throw new Error("Unsupported transcript version.");
  return data;
}
function respond(error:unknown) {
  if(error instanceof RequestBodyError)return Response.json({error:error.message},{status:error.status});
  return campaignErrorResponse(error,"Transcript unavailable.");
}
const privateHeaders={"cache-control":"private, no-store"};
export async function GET(request:Request,context:Context) {
  try{
    const recapId=new URL(request.url).searchParams.get("recapId");
    const {gm,key}=await scope(request,context,recapId);
    const item=await stored(key);
    if(!item || (!item.published&&!gm))return Response.json({exists:false,cues:[]},{headers:privateHeaders});
    return Response.json({exists:true,published:item.published,updatedAt:item.updatedAt,cues:item.cues},
      {headers:privateHeaders});
  }catch(error){return respond(error);}
}
export async function PUT(request:Request,context:Context) {
  try{
    const body=await readBoundedJson(request,2_500_000) as {recapId?:unknown;cues?:unknown;assignments?:unknown};
    const {db,campaign,gm,key}=await scope(request,context,body?.recapId);
    if(!gm)throw new CampaignServiceError("Only GMs can import transcripts.",403);
    requireActiveCampaign(campaign);
    const cues=validateRecapCaptionCues(body?.cues);
    const labels=[...new Set(cues.map(cue=>cue.rawSpeaker))];
    const selections=normalizeCaptionAssignments(body?.assignments,labels);
    const rows=await db.prepare("SELECT id,display_name AS displayName,role,character_name AS characterName "+
      "FROM campaign_recap_speakers WHERE campaign_id=?").bind(campaign.id)
      .all<{id:string;displayName:string;role:"gm"|"player"|"guest";characterName:string|null}>();
    const known=new Map(rows.results.map(row=>[row.id,row]));
    const mapped=new Map<string,{speakerName:string;role:"gm"|"player"|"guest";characterName:string|null}>();
    for(const label of labels) {
      const id=selections[label];
      const association=id===null?null:known.get(id);
      if(id!==null && !association)throw new CampaignServiceError("A selected speaker is no longer in this campaign.",409);
      mapped.set(label,association?{speakerName:association.displayName,role:association.role,
        characterName:association.characterName}:{speakerName:label,role:"guest",characterName:null});
    }
    const now=new Date().toISOString();
    const record:SavedRecapTranscript={version:1,published:false,updatedAt:now,
      cues:cues.map((cue):StoredCaptionCue=>({...cue,...mapped.get(cue.rawSpeaker)!}))};
    const serialized=JSON.stringify(record);
    if(new TextEncoder().encode(serialized).byteLength>2_000_000)
      throw new CampaignServiceError("Transcript exceeds the private storage object limit (2 MB).",422);
    await env.BUCKET.put(key,serialized,{httpMetadata:{contentType:"application/json"}});
    return Response.json({saved:true,published:false,count:cues.length,updatedAt:now},{headers:privateHeaders});
  }catch(error){return respond(error);}
}
export async function PATCH(request:Request,context:Context) {
  try{
    const body=await readBoundedJson(request,4096) as {recapId?:unknown;published?:unknown;updatedAt?:unknown;reviewed?:unknown};
    const {campaign,gm,key}=await scope(request,context,body?.recapId);
    if(!gm)throw new CampaignServiceError("Only GMs can publish transcripts.",403);
    requireActiveCampaign(campaign);
    if(typeof body.published!=="boolean" || (body.published && body.reviewed!==true))
      throw new CampaignServiceError("Review and explicitly confirm before publishing.",422);
    const item=await stored(key);
    if(!item)throw new CampaignServiceError("Import a transcript before publishing.",404);
    if(body.updatedAt!==item.updatedAt)
      throw new CampaignServiceError("Transcript has changed. Reload it before publishing.",409);
    item.published=body.published;
    item.updatedAt=new Date().toISOString();
    await env.BUCKET.put(key,JSON.stringify(item),{httpMetadata:{contentType:"application/json"}});
    return Response.json({saved:true,published:item.published,updatedAt:item.updatedAt},{headers:privateHeaders});
  }catch(error){return respond(error);}
}
