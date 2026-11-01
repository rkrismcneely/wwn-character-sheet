import {geminiAudioMime} from "./recap-gemini-audio-mime.ts";

const GEMINI_API="https://generativelanguage.googleapis.com";
const FILE_NAME=/^files\/[a-zA-Z0-9_-]{6,240}$/u;
const EXPIRY_MARGIN_MS=15*60*1000;
const MAX_METADATA_BYTES=32_000;

type Job={
  id:string;campaignId:string;recapId:string;audioAssetId:string;requestedBy:string;
};
type Source={byteSize:number;mimeType:string};
type PreviousUpload={
  id:string;fileName:string;fileUri:string;
};
type FileMetadata={
  name?:unknown;uri?:unknown;displayName?:unknown;mimeType?:unknown;
  sizeBytes?:unknown;state?:unknown;expirationTime?:unknown;
};

/**
 * Reuse a prior, GM-approved upload of the *same Drive asset*, rather than
 * transferring the original audio again for every recap detail level.
 *
 * Temporary Gemini Files expire. We check the existing file with the current
 * GM-owned API key (so a replacement key/project cannot reuse another account's
 * file), verify its original upload receipt and source metadata, and leave a
 * 15-minute expiry margin. An expired, inaccessible, processing or mismatched
 * file simply falls back to a fresh Drive-to-Gemini transfer.
 *
 * Only call on the initial pending_upload -> transferring transition. A
 * resumed, partially completed resumable upload must keep its own checkpoint.
 */
export async function reusePreviouslyUploadedGeminiAudio(
  db:D1Database,job:Job,source:Source,apiKey:string,
):Promise<boolean>{
  const previous=await db.prepare(
    "SELECT id,file_name AS fileName,file_uri AS fileUri "+
    "FROM campaign_recap_audio_summary_jobs "+
    "WHERE campaign_id=? AND recap_id=? AND audio_asset_id=? AND requested_by=? "+
    "AND id!=? AND confirmed_at IS NOT NULL "+
    "AND status IN ('ready','failed','needs_attention') "+
    "AND file_name IS NOT NULL AND file_uri IS NOT NULL "+
    "ORDER BY created_at DESC LIMIT 1"
  ).bind(job.campaignId,job.recapId,job.audioAssetId,job.requestedBy,job.id)
    .first<PreviousUpload>();

  if(!previous||!FILE_NAME.test(previous.fileName)||
    previous.fileUri!==GEMINI_API+"/v1beta/"+previous.fileName)
    return false;

  let metadata:FileMetadata;
  try{
    const response=await fetch(GEMINI_API+"/v1beta/"+previous.fileName,{
      method:"GET",redirect:"manual",
      headers:{"x-goog-api-key":apiKey},
      signal:AbortSignal.timeout(12_000),
    });
    // A 404/410 is normal after Gemini's temporary storage expires; a 403
    // can occur if the GM reconnected a key from a different Google project.
    if(!response.ok||response.redirected||
      Number(response.headers.get("content-length")||0)>MAX_METADATA_BYTES)
      return false;
    const text=await response.text();
    if(text.length>MAX_METADATA_BYTES)return false;
    metadata=JSON.parse(text) as FileMetadata;
  }catch{
    // Never trust a stale file reference when Google cannot verify it.
    return false;
  }

  if(!metadata||metadata.name!==previous.fileName||
    metadata.uri!==previous.fileUri||
    metadata.displayName!=="TWE recap "+previous.id||
    metadata.mimeType!==geminiAudioMime(source.mimeType)||
    String(metadata.sizeBytes)!==String(source.byteSize)||
    metadata.state!=="ACTIVE")
    return false;

  if(metadata.expirationTime!==undefined){
    if(typeof metadata.expirationTime!=="string"||
      !(Date.parse(metadata.expirationTime)>Date.now()+EXPIRY_MARGIN_MS))
      return false;
  }

  // This job, owner, recap and exact original Drive asset must still match
  // when the new file reference is committed. The worker later submits one
  // independently approved Gemini interaction for this detail level.
  const changed=await db.prepare(
    "UPDATE campaign_recap_audio_summary_jobs "+
    "SET status='uploaded',file_uri=?,file_name=?,stage_offset=?,updated_at=? "+
    "WHERE id=? AND campaign_id=? AND recap_id=? AND audio_asset_id=? AND requested_by=? "+
    "AND confirmed_at IS NOT NULL AND status='transferring' "+
    "AND stage_url_ciphertext IS NULL AND stage_offset=0 "+
    "AND file_uri IS NULL AND file_name IS NULL"
  ).bind(previous.fileUri,previous.fileName,source.byteSize,new Date().toISOString(),
    job.id,job.campaignId,job.recapId,job.audioAssetId,job.requestedBy).run();
  return changed.meta.changes===1;
}
