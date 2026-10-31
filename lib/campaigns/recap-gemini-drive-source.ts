import { getGmDriveAccessToken } from "./recap-drive-token.ts";
import { parsePcmWavHeader } from "./recap-wav-chunks.ts";
import { CampaignServiceError } from "./service.ts";
import { GEMINI_BACKGROUND_MAX_CLIP_BYTES,GEMINI_BACKGROUND_MAX_CLIP_MS } from "./recap-gemini-background.ts";
import type { DriveSettings } from "../account/recap-google-drive-oauth.ts";

/**
 * Cloud-side source preflight for one GM-owned prepared Gemini clip.
 *
 * No user-facing audio endpoint, untrusted URL, global API key, or R2 copy:
 * the only origin is Drive's fixed REST host, accessed using the uploader GM's
 * own OAuth grant. The returned bytes are short-lived and should be handed
 * directly to a future provider adapter in the same Worker invocation.
 */
export type PreparedGeminiClipIdentity = {
  jobId:string;campaignId:string;recapId:string;requestedBy:string;
  trackIndex:number;chunkIndex:number;
};
export type VerifiedGeminiAudio = {
  bytes:Uint8Array<ArrayBuffer>;
  mimeType:"audio/wav";
  actualDurationMs:number;
  sourceDigest:string;
  startMs:number;endMs:number;
  jobId:string;trackIndex:number;chunkIndex:number;
};
type StoredClip={
  jobId:string;campaignId:string;recapId:string;requestedBy:string;
  jobStatus:string;pausedAt:string|null;connectionStatus:string;
  assetId:string|null;assetStatus:string|null;
  storageOwnerUserId:string|null;connectionId:string|null;storageProvider:string|null;
  remoteFileId:string|null;audioKey:string|null;byteSize:number|null;
  assetByteSize:number|null;assetDurationMs:number|null;
  mimeType:string|null;sourceDigest:string|null;
  startMs:number;endMs:number;chunkStatus:string;
};
type DriveFile={
  id?:unknown;size?:unknown;mimeType?:unknown;trashed?:unknown;
  appProperties?:Record<string,unknown>;
};
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu;
const DRIVE_FILE=/^[A-Za-z0-9_-]{5,256}$/u;
const DIGEST=/^[0-9a-f]{64}$/u;
const BOUND=GEMINI_BACKGROUND_MAX_CLIP_BYTES;
const select=
  "SELECT j.id AS jobId,j.campaign_id AS campaignId,j.recap_id AS recapId,"+
  "j.requested_by AS requestedBy,j.status AS jobStatus,j.paused_at AS pausedAt,"+
  "g.status AS connectionStatus,c.status AS chunkStatus,"+
  "c.drive_asset_id AS assetId,a.status AS assetStatus,"+
  "a.storage_owner_user_id AS storageOwnerUserId,a.connection_id AS connectionId,"+
  "s.provider AS storageProvider,a.remote_file_id AS remoteFileId,"+
  "c.audio_key AS audioKey,c.audio_bytes AS byteSize,a.byte_size AS assetByteSize,"+
  "a.duration_ms AS assetDurationMs,c.audio_mime_type AS mimeType,"+
  "c.source_digest AS sourceDigest,c.start_ms AS startMs,c.end_ms AS endMs "+
  "FROM campaign_recap_processing_chunks c "+
  "JOIN campaign_recap_processing_jobs j ON j.id=c.job_id "+
  "JOIN user_recap_ai_connections g ON g.id=j.provider_connection_id "+
  "AND g.user_id=j.requested_by AND g.provider='gemini' "+
  "LEFT JOIN campaign_recap_audio_assets a ON a.id=c.drive_asset_id "+
  "AND a.processing_job_id=j.id AND a.storage_owner_user_id=j.requested_by "+
  "AND a.campaign_id=j.campaign_id AND a.recap_id=j.recap_id "+
  "LEFT JOIN user_recap_storage_connections s ON s.id=a.connection_id "+
  "AND s.user_id=j.requested_by AND s.provider='google-drive' "+
  "WHERE c.job_id=? AND c.track_index=? AND c.chunk_index=?";

function requireValid(row:StoredClip|null,identity:PreparedGeminiClipIdentity){
  if(!row||row.jobId!==identity.jobId||row.campaignId!==identity.campaignId||
    row.recapId!==identity.recapId||row.requestedBy!==identity.requestedBy||
    !["queued","transcribing"].includes(row.jobStatus)||row.pausedAt!==null||
    row.connectionStatus!=="connected"||!["pending","leased"].includes(row.chunkStatus)||
    !row.assetId||!UUID.test(row.assetId)||row.assetStatus!=="ready"||
    row.storageOwnerUserId!==identity.requestedBy||
    row.storageProvider!=="google-drive"||!row.connectionId||!UUID.test(row.connectionId)||
    !row.remoteFileId||!DRIVE_FILE.test(row.remoteFileId)||
    row.audioKey!=="drive-asset/"+row.assetId||
    row.mimeType!=="audio/wav"||!Number.isSafeInteger(row.byteSize)||
    row.byteSize===null||row.byteSize<128||row.byteSize>BOUND||
    row.assetByteSize!==row.byteSize||row.assetDurationMs===null||
    !Number.isSafeInteger(row.startMs)||!Number.isSafeInteger(row.endMs)||
    row.startMs<0||row.endMs<=row.startMs||
    row.endMs-row.startMs>GEMINI_BACKGROUND_MAX_CLIP_MS||
    !row.sourceDigest||!DIGEST.test(row.sourceDigest)||
    Math.abs(row.assetDurationMs-(row.endMs-row.startMs))>10)
    throw new CampaignServiceError("Gemini audio is not eligible or the GM's storage connection is unavailable.",409);
  return row as StoredClip&{assetId:string;connectionId:string;remoteFileId:string;
    byteSize:number;sourceDigest:string;assetDurationMs:number};
}
export function validateGeminiDriveFile(file:DriveFile,clip:{
  assetId:string;campaignId:string;remoteFileId:string;byteSize:number;
}):void{
  if(file.trashed===true||file.id!==clip.remoteFileId||
    file.size!==String(clip.byteSize)||file.mimeType!=="audio/wav"||
    file.appProperties?.tweAudioAssetId!==clip.assetId||
    file.appProperties?.tweCampaignId!==clip.campaignId)
    throw new CampaignServiceError("The Drive file no longer matches the GM's verified upload.",409);
}
export async function boundedGeminiDownload(response:Response,maxBytes=BOUND):Promise<Uint8Array<ArrayBuffer>>{
  if(response.status!==200||!response.body||response.redirected)
    throw new CampaignServiceError("The private Drive audio download is unavailable.",409);
  const declared=response.headers.get("content-length");
  if(declared&&(!/^\d+$/u.test(declared)||Number(declared)>maxBytes))
    throw new CampaignServiceError("The Drive audio exceeds the safe Gemini clip limit.",413);
  const reader=response.body.getReader();
  const chunks:Uint8Array[]=[];let count=0;
  try{
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      count+=value.byteLength;
      if(count>maxBytes)throw new CampaignServiceError("Drive audio exceeded its size limit.",413);
      chunks.push(value);
    }
  }catch(error){
    await reader.cancel().catch(()=>{});
    throw error;
  }finally{reader.releaseLock();}
  if(count<128)throw new CampaignServiceError("Drive audio has no usable PCM data.",409);
  const data=new Uint8Array(new ArrayBuffer(count));
  let offset=0;
  for(const block of chunks){data.set(block,offset);offset+=block.byteLength;}
  return data;
}
function digestHex(bytes:Uint8Array<ArrayBuffer>):Promise<string>{
  return crypto.subtle.digest("SHA-256",bytes).then(result=>
    Array.from(new Uint8Array(result),b=>b.toString(16).padStart(2,"0")).join(""));
}
/** Pure verified-clip checks; exported separately for offline regression tests. */
export async function verifyGeminiSpeechWav(bytes:Uint8Array<ArrayBuffer>,
  expected:{size:number;digest:string;durationMs:number}):Promise<number>{
  if(bytes.byteLength!==expected.size||expected.size>BOUND||!DIGEST.test(expected.digest))
    throw new CampaignServiceError("The GM's staged audio size has changed.",409);
  const wav=parsePcmWavHeader(bytes.subarray(0,Math.min(bytes.byteLength,256*1024)),bytes.byteLength);
  if(wav.channels!==1||wav.sampleRate!==16000||wav.bitsPerSample!==16||
    wav.blockAlign!==2||wav.dataOffset+wav.dataBytes>bytes.byteLength)
    throw new CampaignServiceError("The staged file is not independently playable mono speech audio.",409);
  const durationMs=Math.round(wav.dataBytes/wav.blockAlign/wav.sampleRate*1000);
  if(durationMs<1000||durationMs>GEMINI_BACKGROUND_MAX_CLIP_MS||
    Math.abs(durationMs-expected.durationMs)>10)
    throw new CampaignServiceError("The staged audio timing no longer matches the recap.",409);
  if(await digestHex(bytes)!==expected.digest)
    throw new CampaignServiceError("The Drive audio checksum does not match the staged clip.",409);
  return durationMs;
}
export async function readVerifiedGmGeminiClip(
  db:D1Database,settings:DriveSettings,identity:PreparedGeminiClipIdentity,
):Promise<VerifiedGeminiAudio>{
  if(!UUID.test(identity.jobId)||!UUID.test(identity.campaignId)||!UUID.test(identity.recapId)||
    !identity.requestedBy||!Number.isSafeInteger(identity.trackIndex)||
    !Number.isSafeInteger(identity.chunkIndex)||identity.trackIndex<0||identity.trackIndex>127||
    identity.chunkIndex<0||identity.chunkIndex>=512)
    throw new CampaignServiceError("Invalid Gemini clip identity.",422);
  const row=requireValid(await db.prepare(select)
    .bind(identity.jobId,identity.trackIndex,identity.chunkIndex).first<StoredClip>(),identity);
  const accessToken=await getGmDriveAccessToken(db,settings,identity.requestedBy,row.connectionId);
  const fileUrl="https://www.googleapis.com/drive/v3/files/"+encodeURIComponent(row.remoteFileId);
  const metadata=await fetch(fileUrl+"?fields=id,size,mimeType,trashed,appProperties",{
    headers:{authorization:"Bearer "+accessToken},
    redirect:"manual",signal:AbortSignal.timeout(12000),
  });
  if(!metadata.ok||metadata.redirected)
    throw new CampaignServiceError("The GM's Drive recording could not be verified.",409);
  const file=await metadata.json() as DriveFile;
  validateGeminiDriveFile(file,{assetId:row.assetId,campaignId:identity.campaignId,
    remoteFileId:row.remoteFileId,byteSize:row.byteSize});
  const response=await fetch(fileUrl+"?alt=media",{
    headers:{authorization:"Bearer "+accessToken},
    redirect:"manual",signal:AbortSignal.timeout(45000),
  });
  const bytes=await boundedGeminiDownload(response);
  const actualDurationMs=await verifyGeminiSpeechWav(bytes,{
    size:row.byteSize,digest:row.sourceDigest,durationMs:row.endMs-row.startMs,
  });
  return {bytes,mimeType:"audio/wav",actualDurationMs,sourceDigest:row.sourceDigest,
    startMs:row.startMs,endMs:row.endMs,
    jobId:identity.jobId,trackIndex:identity.trackIndex,chunkIndex:identity.chunkIndex};
}
