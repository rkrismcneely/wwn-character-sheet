import {getSessionActor} from "@/lib/auth-session";
import {getCampaignD1,loadCampaignAccess,CampaignServiceError} from "@/lib/campaigns/service";
import {canManageCampaignContent} from "@/lib/campaigns/authorization";
import {getCampaignSessionRecap} from "@/lib/campaigns/session-recaps";
import {campaignErrorResponse} from "@/lib/campaigns/http";
import {enqueueConfirmedRecapAudio,retrySafeRecapPreparation} from "@/lib/campaigns/recap-only-jobs";
import {safeRecapRetryTarget} from "@/lib/campaigns/recap-only-recovery";
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
    const rows=await info.db.prepare("SELECT id,audio_asset_id AS audioAssetId,status,detail,model,generated_markdown AS generatedMarkdown,"+
      "error_code AS errorCode,created_at AS createdAt,updated_at AS updatedAt,"+
      "file_uri AS fileUri,file_name AS fileName,interaction_id AS interactionId "+
      "FROM campaign_recap_audio_summary_jobs WHERE campaign_id=? AND recap_id=? "+
      "AND requested_by=? AND confirmed_at IS NOT NULL ORDER BY created_at DESC LIMIT 4")
      .bind(info.campaign.id,info.recap.id,info.actor.userId).all<{
        id:string;audioAssetId:string;status:string;detail:string;model:string;generatedMarkdown:string|null;
        errorCode:string|null;createdAt:string;updatedAt:string;
        fileUri:string|null;fileName:string|null;interactionId:string|null;
      }>();
    // Only return a boolean; the Gemini file URI and interaction ID must not
    // be exposed by status polling or used for user-supplied retry targets.
    const safeJobs=rows.results.map(({fileUri,fileName,interactionId,...job})=>({
      ...job,canRetry:!info.recap.isPublished&&Boolean(safeRecapRetryTarget({...job,fileUri,fileName,interactionId})),
    }));
    return Response.json({jobs:safeJobs,recap:{content:info.recap.content,isPublished:info.recap.isPublished,updatedAt:info.recap.updatedAt}},
      {headers:noStore});
  }catch(e){return campaignErrorResponse(e,"Automatic recap status unavailable.");}
}
/** Opt in an existing Drive audio asset. Prevents re-sending the same file twice. */
export async function POST(request:Request,ctx:Context){
  try{
    if(request.headers.get("origin")!==CANONICAL_ORIGIN)
      return Response.json({error:"Open this action from your TWE campaign."},{status:403,headers:noStore});
    const body=await readBoundedJson(request,1024) as {recapId?:unknown;assetId?:unknown;confirmed?:unknown;privacyApproved?:unknown;billingApproved?:unknown};
    const info=await gm(request,ctx,body.recapId);
    if(info.recap.isPublished)
      throw new CampaignServiceError("Create an unpublished recap draft before starting AI processing.",409);
    const asset=await info.db.prepare("SELECT id,byte_size AS byteSize FROM campaign_recap_audio_assets "+
      "WHERE id=? AND recap_id=? AND campaign_id=? AND storage_owner_user_id=? "+
      "AND processing_job_id IS NULL AND status='ready' LIMIT 1")
      .bind(body.assetId,info.recap.id,info.campaign.id,info.actor.userId)
      .first<{id:string;byteSize:number}>();
    if(!asset)throw new CampaignServiceError("Choose a finished recording stored in your own Drive.",404);
    const result=await enqueueConfirmedRecapAudio(info.db,{
      campaignId:info.campaign.id,recapId:info.recap.id,audioAssetId:asset.id,
      byteSize:asset.byteSize,userId:info.actor.userId,
      confirmed:body.confirmed===true,privacyApproved:body.privacyApproved===true,
      billingApproved:body.billingApproved===true,
    });
    return Response.json({queued:true,created:result.created,alreadyQueued:result.alreadyQueued},
      {headers:noStore});

  }catch(e){
    if(e instanceof RequestBodyError)return Response.json({error:e.message},{status:e.status,headers:noStore});
    return campaignErrorResponse(e,"Could not queue this audio recap.");
  }
}

/** Only retry work known to have failed before model submission. The original
 * per-recording GM approval stays bound to this exact job and audio asset.
 * Uncertain Gemini submissions are never submitted twice by this route.
 */
export async function PATCH(request:Request,ctx:Context){
  try{
    if(request.headers.get("origin")!==CANONICAL_ORIGIN)
      return Response.json({error:"Open this action from your TWE campaign."},{status:403,headers:noStore});
    const body=await readBoundedJson(request,1024) as {
      recapId?:unknown;jobId?:unknown;retryApproved?:unknown;
    };
    if(body.retryApproved!==true)throw new CampaignServiceError(
      "Confirm that restarting AI processing may consume your Gemini quota.",422);
    const info=await gm(request,ctx,body.recapId);
    if(info.recap.isPublished)throw new CampaignServiceError("Only private drafts can be resumed.",409);
    const jobId=typeof body.jobId==="string"?body.jobId:"";
    const outcome=await retrySafeRecapPreparation(info.db,{
      jobId,campaignId:info.campaign.id,recapId:info.recap.id,userId:info.actor.userId,
    });
    return Response.json(outcome,{headers:noStore});
  }catch(e){
    if(e instanceof RequestBodyError)return Response.json({error:e.message},{status:e.status,headers:noStore});
    return campaignErrorResponse(e,"Could not safely resume Gemini processing.");
  }
}
