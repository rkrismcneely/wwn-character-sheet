import {env} from "cloudflare:workers";
import {getSessionActor} from "@/lib/auth-session";
import {CANONICAL_ORIGIN} from "@/lib/auth-constants";
import {decryptGeminiUserKey,type RecapAIEncryptionSettings} from "@/lib/account/recap-gemini-key";
import {canManageCampaignContent} from "@/lib/campaigns/authorization";
import {CampaignServiceError,getCampaignD1,loadCampaignAccess,requireActiveCampaign}
  from "@/lib/campaigns/service";
import {getCampaignSessionRecap} from "@/lib/campaigns/session-recaps";
import {campaignErrorResponse} from "@/lib/campaigns/http";
import {summarizeRecapGeminiFailure} from "@/lib/campaigns/recap-gemini-failure-diagnosis";
import {readBoundedJson,RequestBodyError} from "@/lib/http-json";

type Context={params:Promise<{id:string}>};
const noStore={"cache-control":"private, no-store"};
const ID=/^[a-zA-Z0-9_-]{6,240}$/u;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const API="https://generativelanguage.googleapis.com/v1beta/interactions/";

export async function POST(request:Request,ctx:Context){
  try{
    if(request.headers.get("origin")!==CANONICAL_ORIGIN||
      request.headers.get("sec-fetch-site")==="cross-site")
      throw new CampaignServiceError("Open the recap in TWE to check this failure.",403);
    const body=await readBoundedJson(request,500) as {recapId?:unknown;jobId?:unknown};
    if(typeof body.jobId!=="string"||!UUID.test(body.jobId))
      throw new CampaignServiceError("Invalid recap job.",422);
    const actor=await getSessionActor(request);
    if(!actor)throw new CampaignServiceError("Sign in required.",401);
    const {id}=await ctx.params;
    const db=await getCampaignD1();
    const access=await loadCampaignAccess(db,actor,id);
    if(!canManageCampaignContent(actor,access.campaign,access.membership))
      throw new CampaignServiceError("Only the campaign GM can inspect a recap.",403);
    requireActiveCampaign(access.campaign);
    const recap=await getCampaignSessionRecap(db,actor,id,body.recapId);
    const job=await db.prepare("SELECT interaction_id AS interactionId,status,error_code AS errorCode "+
      "FROM campaign_recap_audio_summary_jobs WHERE id=? AND campaign_id=? AND recap_id=? "+
      "AND requested_by=? AND confirmed_at IS NOT NULL")
      .bind(body.jobId,access.campaign.id,recap.id,actor.userId)
      .first<{interactionId:string|null;status:string;errorCode:string|null}>();
    if(!job||job.status!=="needs_attention"||job.errorCode!=="interaction_failed"||
      !job.interactionId||!ID.test(job.interactionId))
      throw new CampaignServiceError("No completed failed Gemini interaction is available for this job.",409);
    const connection=await db.prepare("SELECT id,key_ciphertext AS ciphertext,key_nonce AS nonce,"+
      "key_version AS version FROM user_recap_ai_connections WHERE user_id=? "+
      "AND provider='gemini' AND status='connected' AND key_ciphertext IS NOT NULL")
      .bind(actor.userId)
      .first<{id:string;ciphertext:string;nonce:string;version:number}>();
    if(!connection||connection.version!==1)
      throw new CampaignServiceError("Reconnect your Gemini key to check this failure.",409);
    const key=await decryptGeminiUserKey(env as unknown as RecapAIEncryptionSettings,actor.userId,connection.id,{
      ciphertext:connection.ciphertext,nonce:connection.nonce,version:1,
    });
    // Read-only: retrieving the same interaction does not create another
    // generation request, upload audio, or consume a fresh recap job.
    let provider:Response;
    try{
      provider=await fetch(API+encodeURIComponent(job.interactionId),{
        method:"GET",redirect:"manual",
        headers:{"x-goog-api-key":key,"Api-Revision":"2026-05-20"},
        signal:AbortSignal.timeout(12000),
      });
    }catch{
      return Response.json({error:"Gemini was unreachable. Your recap was not resubmitted."},
        {status:503,headers:noStore});
    }
    if(provider.status===404||provider.status===410)
      return Response.json({error:"Gemini no longer retains this interaction. Free-tier results may expire after one day. No new request was submitted."},
        {status:410,headers:noStore});
    if(!provider.ok||provider.redirected)
      return Response.json({error:"Gemini could not provide the saved failure details. Check your project's API access and try checking again."},
        {status:502,headers:noStore});
    if(Number(provider.headers.get("content-length")||0)>400_000)
      return Response.json({error:"Gemini's stored diagnostic is too large to inspect safely."},
        {status:502,headers:noStore});
    const raw=await provider.text();
    if(raw.length>400_000)
      return Response.json({error:"Gemini's stored diagnostic is too large to inspect safely."},
        {status:502,headers:noStore});
    let detail:unknown;
    try{detail=JSON.parse(raw);}catch{
      return Response.json({error:"Gemini returned an unreadable diagnostic."},{status:502,headers:noStore});
    }
    const status=(detail as {status?:unknown}|null)?.status;
    if(status!=="failed")
      return Response.json({error:"The Gemini interaction no longer reports a failed state. No new request was submitted."},
        {status:409,headers:noStore});
    return Response.json({diagnosis:summarizeRecapGeminiFailure(detail),resubmitted:false},
      {headers:noStore});
  }catch(e){
    if(e instanceof RequestBodyError)
      return Response.json({error:e.message},{status:e.status,headers:noStore});
    return campaignErrorResponse(e,"Could not safely check Gemini's failure details.");
  }
}
