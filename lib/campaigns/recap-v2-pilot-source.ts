/** Short-lived, read-only remote excerpt stream. This route accepts NO cookies,
 * requires a signed capability created only after an authenticated GM decision,
 * and never exposes the Google Drive ID or OAuth token.
 */
import {env} from "cloudflare:workers";
import {Buffer} from "node:buffer";
import type {DriveSettings} from "@/lib/account/recap-google-drive-oauth";
import {getCampaignD1} from "@/lib/campaigns/service";
import {getGmDriveAccessToken} from "@/lib/campaigns/recap-drive-token";
import {M4A_PILOT_MAX_BYTES} from "@/lib/campaigns/recap-m4a-remux";
import {validatePilotM4aPlan} from "@/lib/campaigns/recap-v2-pilot-plan";
import {verifyPilotCapability} from "@/lib/campaigns/recap-v2-pilot-capability";
import type {RecapAIEncryptionSettings} from "@/lib/account/recap-groq-key";
import {excerptRequestedRange} from "@/lib/campaigns/recap-v2-pilot-range";
type Context={params:Promise<{assetId:string}>};
type Source={
  campaignId:string;recapId:string;ownerId:string;remoteFileId:string;
  connectionId:string;byteSize:number;durationMs:number|null;mimeType:string;
  sourceByteSize:number;sourceStart:number;sourceEnd:number;
  prefixBase64:string;
};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const CAMP=/^cmp_[A-Za-z0-9_-]{22}$/u;
const DRIVE=/^[A-Za-z0-9_-]{5,256}$/u;
const headers=()=>new Headers({
  "cache-control":"private, no-store","x-content-type-options":"nosniff",
  "x-robots-tag":"noindex, nofollow","referrer-policy":"no-referrer",
  "accept-ranges":"bytes","content-type":"audio/mp4",
});
function notFound():Response{return new Response(null,{status:404,headers:headers()});}
export async function handlePilotExcerpt(request:Request,context:Context):Promise<Response>{
  const config=env as unknown as RecapAIEncryptionSettings & DriveSettings & {
    TWE_RECAP_V2_PILOT_ENABLED?:string;
  };
  if(config.TWE_RECAP_V2_PILOT_ENABLED!=="true")return notFound();
  const params=await context.params;
  // A real .m4a suffix helps third-party media fetchers recognize the format.
  const assetId=params.assetId.endsWith(".m4a")?
    params.assetId.slice(0,-4):params.assetId;
  const u=new URL(request.url);
  if(!UUID.test(assetId)||u.searchParams.size!==5)return notFound();
  const campaignId=u.searchParams.get("campaignId")??"";
  const recapId=u.searchParams.get("recapId")??"";
  const rawExpires=u.searchParams.get("exp")??"";
  const expires=/^\d{10,11}$/u.test(rawExpires)?Number(rawExpires):NaN;
  if(!CAMP.test(campaignId)||!UUID.test(recapId))return notFound();
  try{
    const db=await getCampaignD1();
    const source=await db.prepare("SELECT a.campaign_id AS campaignId,"+
      "a.recap_id AS recapId,a.storage_owner_user_id AS ownerId,"+
      "a.remote_file_id AS remoteFileId,a.connection_id AS connectionId,"+
      "a.byte_size AS byteSize,a.duration_ms AS durationMs,a.mime_type AS mimeType,"+
      "p.source_byte_size AS sourceByteSize,p.source_start AS sourceStart,"+
      "p.source_end AS sourceEnd,p.prefix_base64 AS prefixBase64 "+
      "FROM campaign_recap_audio_assets a "+
      "JOIN user_recap_storage_connections s ON s.id=a.connection_id "+
      "AND s.user_id=a.storage_owner_user_id "+
      "JOIN campaign_recap_v2_pilots p ON p.audio_asset_id=a.id "+
      "AND p.campaign_id=a.campaign_id AND p.recap_id=a.recap_id "+
      "AND p.requested_by=a.storage_owner_user_id AND p.status='submitting' "+
      "WHERE a.id=? AND a.campaign_id=? AND a.recap_id=? "+
      "AND a.processing_job_id IS NULL AND a.status='ready' "+
      "AND s.status='connected' AND s.provider='google-drive'")
      .bind(assetId,campaignId,recapId).first<Source>();
    if(!source||!DRIVE.test(source.remoteFileId)||source.mimeType!=="audio/mp4"||
      !Number.isSafeInteger(source.byteSize)||source.byteSize<=0||
      source.byteSize!==source.sourceByteSize)return notFound();
    const accepted=await verifyPilotCapability(config,{campaignId,recapId,assetId,
      ownerId:source.ownerId,expires,
      nonce:u.searchParams.get("nonce")??"",
      signature:u.searchParams.get("sig")??"",
    });
    if(!accepted)return notFound();
    const access=await getGmDriveAccessToken(db,config,source.ownerId,source.connectionId);
    // The expensive sample-table scan was already performed in the GM's
    // browser and checkpointed BEFORE Groq was contacted. Source GET/HEAD
    // does not reparse the multi-hour M4A on Workers Free.
    const clip=validatePilotM4aPlan({
      index:0,startMs:0,endMs:120000,
      sourceStart:source.sourceStart,sourceEnd:source.sourceEnd,
      prefixBase64:source.prefixBase64,mimeType:"audio/mp4",
    },source.byteSize,null).clip;
    const prefix=Buffer.from(clip.prefixBase64,"base64");
    const payloadSize=clip.sourceEnd-clip.sourceStart;
    const size=prefix.length+payloadSize;
    if(size<128||size>M4A_PILOT_MAX_BYTES)return notFound();
    const chosen=excerptRequestedRange(request.headers.get("range"),size);
    const responseHeaders=headers();
    responseHeaders.set("content-length",String(chosen.end-chosen.start+1));
    if(chosen.status===206)responseHeaders.set("content-range",
      "bytes "+chosen.start+"-"+chosen.end+"/"+size);
    if(request.method==="HEAD")return new Response(null,{
      status:chosen.status,headers:responseHeaders,
    });
    const start=Math.max(0,chosen.start-prefix.length);
    const end=Math.max(0,Math.min(payloadSize,chosen.end+1-prefix.length));
    const headerEnd=Math.min(prefix.length,chosen.end+1);
    const firstChunk=chosen.start<headerEnd?
      prefix.subarray(chosen.start,headerEnd):new Uint8Array(0);
    if(end<=start)return new Response(firstChunk,{status:chosen.status,headers:responseHeaders});
    const driveStart=clip.sourceStart+start;
    const driveEnd=clip.sourceStart+end-1;
    const remote=await fetch("https://www.googleapis.com/drive/v3/files/"+
      encodeURIComponent(source.remoteFileId)+"?alt=media",{
        method:"GET",redirect:"manual",signal:request.signal,
        headers:{"authorization":"Bearer "+access,"accept-encoding":"identity",
          "range":"bytes="+driveStart+"-"+driveEnd},
      });
    if(remote.status!==206||remote.redirected||!remote.body||
      remote.headers.get("content-range")!==
        "bytes "+driveStart+"-"+driveEnd+"/"+source.byteSize){
      await remote.body?.cancel();
      return new Response(null,{status:502,headers:headers()});
    }
    const reader=remote.body.getReader();
    let prefixDone=firstChunk.length===0;
    const body=new ReadableStream<Uint8Array>({
      async pull(controller){
        if(!prefixDone){prefixDone=true;controller.enqueue(firstChunk);return;}
        const next=await reader.read();
        if(next.done)controller.close();
        else controller.enqueue(next.value);
      },
      async cancel(reason){await reader.cancel(reason);}
    });
    return new Response(body,{status:chosen.status,headers:responseHeaders});
  }catch(error){
    if(error instanceof RangeError)
      return new Response(null,{status:416,headers:headers()});
    // A signed URL could be visible to the remote provider. Never reflect
    // any credentials, Drive identifiers, token or upstream error details.
    return new Response(null,{status:502,headers:headers()});
  }
}
