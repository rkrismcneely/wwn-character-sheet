import {getSessionActor} from "@/lib/auth-session";
import {getCampaignD1,loadCampaignAccess,CampaignServiceError} from "@/lib/campaigns/service";
import {canManageCampaignContent} from "@/lib/campaigns/authorization";
import {getCampaignSessionRecap} from "@/lib/campaigns/session-recaps";
import {campaignErrorResponse} from "@/lib/campaigns/http";
import {enqueueConfirmedRecapAudio,retrySafeRecapPreparation} from "@/lib/campaigns/recap-only-jobs";
import {safeRecapRetryTarget} from "@/lib/campaigns/recap-only-recovery";
import {validateBrowserM4aPlan} from "@/lib/campaigns/recap-m4a-browser-preflight";
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
      "error_code AS errorCode,stage_error_code AS stageErrorCode,"+
      "stage_offset AS stageBytes,"+
      "(SELECT byte_size FROM campaign_recap_audio_assets a WHERE a.id=audio_asset_id) AS totalBytes,"+
      "created_at AS createdAt,updated_at AS updatedAt,"+
      "file_uri AS fileUri,file_name AS fileName,interaction_id AS interactionId "+
      "FROM campaign_recap_audio_summary_jobs WHERE campaign_id=? AND recap_id=? "+
      "AND requested_by=? AND confirmed_at IS NOT NULL ORDER BY created_at DESC LIMIT 16")
      .bind(info.campaign.id,info.recap.id,info.actor.userId).all<{
        id:string;audioAssetId:string;status:string;detail:string;model:string;generatedMarkdown:string|null;
        errorCode:string|null;stageErrorCode:string|null;stageBytes:number;totalBytes:number|null;
        createdAt:string;updatedAt:string;
        fileUri:string|null;fileName:string|null;interactionId:string|null;
      }>();
    // Segment progress is private to the originating GM and returned only as
    // counts/byte progress, never Gemini interaction IDs, filenames or content.
    const migrated=Boolean(await info.db.prepare("SELECT name FROM sqlite_master "+
      "WHERE type='table' AND name='campaign_recap_audio_summary_segments'").first());
    const totals=migrated?await info.db.prepare("SELECT job_id AS jobId,COUNT(*) AS total,"+
      "SUM(CASE WHEN status='ready' THEN 1 ELSE 0 END) AS completed,"+
      "SUM(stage_offset) AS transferred,"+
      "SUM(source_end-source_start) AS bytes "+
      "FROM campaign_recap_audio_summary_segments WHERE job_id IN "+
      "(SELECT id FROM campaign_recap_audio_summary_jobs WHERE campaign_id=? "+
      "AND recap_id=? AND requested_by=? AND confirmed_at IS NOT NULL) GROUP BY job_id")
      .bind(info.campaign.id,info.recap.id,info.actor.userId)
      .all<{jobId:string;total:number;completed:number;transferred:number;bytes:number}>()
      :{results:[] as {jobId:string;total:number;completed:number;transferred:number;bytes:number}[]};
    const byJob=new Map(totals.results.map(row=>[row.jobId,row]));
    // Only return a boolean; the Gemini file URI and interaction ID must not
    // be exposed by status polling or used for user-supplied retry targets.
    const safeJobs=rows.results.map(({fileUri,fileName,interactionId,...job})=>{
      const sections=byJob.get(job.id);
      return {...job,segmentCount:sections?.total??0,segmentsReady:sections?.completed??0,
        stageBytes:sections?.total?Math.min(sections.transferred,sections.bytes):job.stageBytes,
        totalBytes:sections?.total?sections.bytes:job.totalBytes,
        canRetry:Boolean(safeRecapRetryTarget({...job,fileUri,fileName,interactionId}))};
    });
    return Response.json({jobs:safeJobs,recap:{content:info.recap.content,isPublished:info.recap.isPublished,updatedAt:info.recap.updatedAt}},
      {headers:noStore});
  }catch(e){return campaignErrorResponse(e,"Automatic recap status unavailable.");}
}
/** Opt in an existing Drive audio asset. Prevents re-sending the same file twice. */
export async function POST(request:Request,ctx:Context){
  try{
    if(request.headers.get("origin")!==CANONICAL_ORIGIN)
      return Response.json({error:"Open this action from your TWE campaign."},{status:403,headers:noStore});
    const body=await readBoundedJson(request,8192) as {recapId?:unknown;assetId?:unknown;confirmed?:unknown;privacyApproved?:unknown;billingApproved?:unknown;detail?:unknown;requestId?:unknown;durationMs?:unknown;m4aPlan?:unknown};
    const info=await gm(request,ctx,body.recapId);
    const asset=await info.db.prepare("SELECT id,byte_size AS byteSize,mime_type AS mimeType FROM campaign_recap_audio_assets "+
      "WHERE id=? AND recap_id=? AND campaign_id=? AND storage_owner_user_id=? "+
      "AND processing_job_id IS NULL AND status='ready' LIMIT 1")
      .bind(body.assetId,info.recap.id,info.campaign.id,info.actor.userId)
      .first<{id:string;byteSize:number;mimeType:string}>();
    if(!asset)throw new CampaignServiceError("Choose a finished recording stored in your own Drive.",404);
    const m4aPlan=body.m4aPlan===undefined?null:(asset.mimeType==="audio/mp4"?
      validateBrowserM4aPlan(body.m4aPlan,asset.byteSize,body.durationMs):
      (()=>{throw new CampaignServiceError("Only M4A recordings can use native audio sections.",422);})());
    // The browser's metadata-loaded audio player supplies duration for the
    // existing Drive file; no extra upload or approval is required. A separate
    // server-side MP3/WAV probe handles clients with unavailable metadata.
    if(typeof body.durationMs==="number"&&Number.isSafeInteger(body.durationMs)&&
      body.durationMs>0&&body.durationMs<=8*60*60*1000){
      await info.db.prepare("UPDATE campaign_recap_audio_assets SET duration_ms=COALESCE(duration_ms,?) "+
        "WHERE id=? AND recap_id=? AND campaign_id=? AND storage_owner_user_id=? "+
        "AND status='ready'").bind(body.durationMs,asset.id,info.recap.id,info.campaign.id,info.actor.userId).run();
    }
    const result=await enqueueConfirmedRecapAudio(info.db,{
      campaignId:info.campaign.id,recapId:info.recap.id,audioAssetId:asset.id,
      byteSize:asset.byteSize,userId:info.actor.userId,
      confirmed:body.confirmed===true,privacyApproved:body.privacyApproved===true,
      billingApproved:body.billingApproved===true,
      detail:body.detail,requestId:body.requestId,
    });
    if(result.created&&m4aPlan){
      // The original GM confirmation created this job. Child rows and the
      // segmented mode switch are a single D1 batch, with no Gemini request.
      const parent=await info.db.prepare("SELECT id FROM campaign_recap_audio_summary_jobs "+
        "WHERE requested_by=? AND campaign_id=? AND recap_id=? AND audio_asset_id=? "+
        "AND request_id=? AND confirmed_at IS NOT NULL AND status='pending_upload'")
        .bind(info.actor.userId,info.campaign.id,info.recap.id,asset.id,body.requestId)
        .first<{id:string}>();
      if(!parent)throw new CampaignServiceError("The recap job changed before audio preparation.",409);
      const timestamp=new Date().toISOString();
      try{
        const writes=m4aPlan.map(part=>info.db.prepare(
          "INSERT INTO campaign_recap_audio_summary_segments "+
          "(id,job_id,segment_index,start_ms,end_ms,source_start,source_end,prefix_base64,mime_type,"+
          "status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
          .bind(crypto.randomUUID(),parent.id,part.index,part.startMs,part.endMs,
            part.sourceStart,part.sourceEnd,"","audio/mp4",
            "pending_upload",timestamp,timestamp));
        writes.push(info.db.prepare("UPDATE campaign_recap_audio_summary_jobs "+
          "SET processing_mode='segmented',updated_at=? WHERE id=? AND status='pending_upload' "+
          "AND processing_mode='single'").bind(timestamp,parent.id));
        const results=await info.db.batch(writes);
        if(results.at(-1)?.meta.changes!==1)
          throw new Error("M4A split checkpoint not saved.");
      }catch{
        // Fail closed. Never let a queued long source accidentally fall back
        // to a single over-limit Gemini interaction after a partial write.
        await info.db.prepare("UPDATE campaign_recap_audio_summary_jobs "+
          "SET status='needs_attention',error_code='long_audio_metadata_invalid',updated_at=? "+
          "WHERE id=? AND status='pending_upload'").bind(new Date().toISOString(),parent.id).run();
        throw new CampaignServiceError("Could not save M4A section checkpoints. No Gemini request was submitted.",503);
      }
    }
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
