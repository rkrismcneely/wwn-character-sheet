import {getSessionActor} from "@/lib/auth-session";
import {getCampaignD1,loadCampaignAccess,CampaignServiceError} from "@/lib/campaigns/service";
import {canManageCampaignContent} from "@/lib/campaigns/authorization";
import {getCampaignSessionRecap} from "@/lib/campaigns/session-recaps";
import {campaignErrorResponse} from "@/lib/campaigns/http";
import {enqueueConsentedRecapAudio} from "@/lib/campaigns/recap-only-jobs";
import {CANONICAL_ORIGIN} from "@/lib/auth-constants";
import {readBoundedJson,RequestBodyError} from "@/lib/http-json";

type Context={params:Promise<{id:string}>};
const noStore={"cache-control":"private, no-store"};
async function gm(request:Request,ctx:Context,recapId:unknown){
  const actor=await getSessionActor(request);
  if(!actor)throw new CampaignServiceError("Sign in required.",401);
  const {id}=await ctx.params;
  const db=await getCampaignD1();
  const access=await loadCampaignAccess(db,actor,id);
  if(!canManageCampaignContent(actor,access.campaign,access.membership))
    throw new CampaignServiceError("Only campaign GMs can review automatic recaps.",403);
  const recap=await getCampaignSessionRecap(db,actor,id,recapId);
  return {actor,db,campaign:access.campaign,recap};
}
export async function GET(request:Request,ctx:Context){
  try{
    const info=await gm(request,ctx,new URL(request.url).searchParams.get("recapId"));
    const rows=await info.db.prepare("SELECT id,status,detail,model,generated_markdown AS generatedMarkdown,"+
      "error_code AS errorCode,created_at AS createdAt,updated_at AS updatedAt "+
      "FROM campaign_recap_audio_summary_jobs WHERE campaign_id=? AND recap_id=? "+
      "AND requested_by=? ORDER BY created_at DESC LIMIT 4")
      .bind(info.campaign.id,info.recap.id,info.actor.userId).all<{
        id:string;status:string;detail:string;model:string;generatedMarkdown:string|null;
        errorCode:string|null;createdAt:string;updatedAt:string;
      }>();
    return Response.json({jobs:rows.results,recap:{content:info.recap.content,isPublished:info.recap.isPublished}},
      {headers:noStore});
  }catch(e){return campaignErrorResponse(e,"Automatic recap status unavailable.");}
}
/** Opt in an existing Drive audio asset. Prevents re-sending the same file twice. */
export async function POST(request:Request,ctx:Context){
  try{
    if(request.headers.get("origin")!==CANONICAL_ORIGIN)
      return Response.json({error:"Open this action from your TWE campaign."},{status:403,headers:noStore});
    const body=await readBoundedJson(request,1024) as {recapId?:unknown;assetId?:unknown};
    const info=await gm(request,ctx,body.recapId);
    if(info.recap.isPublished)
      throw new CampaignServiceError("Create an unpublished recap draft before starting AI processing.",409);
    const asset=await info.db.prepare("SELECT id,byte_size AS byteSize FROM campaign_recap_audio_assets "+
      "WHERE id=? AND recap_id=? AND campaign_id=? AND storage_owner_user_id=? "+
      "AND processing_job_id IS NULL AND status='ready' LIMIT 1")
      .bind(body.assetId,info.recap.id,info.campaign.id,info.actor.userId)
      .first<{id:string;byteSize:number}>();
    if(!asset)throw new CampaignServiceError("Choose a finished recording stored in your own Drive.",404);
    const created=await enqueueConsentedRecapAudio(info.db,{
      campaignId:info.campaign.id,recapId:info.recap.id,audioAssetId:asset.id,
      byteSize:asset.byteSize,userId:info.actor.userId,
    });
    if(!created){
      const existing=await info.db.prepare("SELECT id FROM campaign_recap_audio_summary_jobs WHERE audio_asset_id=?")
        .bind(asset.id).first<{id:string}>();
      if(!existing)throw new CampaignServiceError("Enable automatic recaps in Account before starting.",409);
    }
    return Response.json({queued:true},{headers:noStore});
  }catch(e){
    if(e instanceof RequestBodyError)return Response.json({error:e.message},{status:e.status,headers:noStore});
    return campaignErrorResponse(e,"Could not queue this audio recap.");
  }
}
