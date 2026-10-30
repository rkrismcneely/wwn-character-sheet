import type { DriveSettings } from "../account/recap-google-drive-oauth.ts";
import { getGmDriveAccessToken } from "./recap-drive-token.ts";
import { getCampaignSessionRecap } from "./session-recaps.ts";
import { CampaignServiceError, loadCampaignAccess } from "./service.ts";
import { audioPlaybackHeaders, validateAudioRangeHeader } from "./recap-drive-playback-range.ts";
import type { CampaignActor } from "./types.ts";

type Asset = {
  id:string; recapId:string|null; remoteFileId:string|null;
  ownerUserId:string;connectionId:string;provider:string;
  connectionStatus:string;status:string;mimeType:string|null;byteSize:number|null;
};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/**
 * Private browser playback. The file remains in the GM's Drive and is fetched
 * only after a fresh campaign-and-recap authorization for every Range request.
 * Players never see an OAuth credential or Drive file ID.
 */
export async function streamAuthorizedRecapAudio(
  db:D1Database, actor:CampaignActor|null, campaignId:string, assetId:string,
  rangeHeader:string|null, settings:DriveSettings, signal?:AbortSignal,
):Promise<Response> {
  if(!actor)throw new CampaignServiceError("Sign in required.",401);
  const {campaign}=await loadCampaignAccess(db,actor,campaignId);
  if(!UUID.test(assetId))throw new CampaignServiceError("Audio recording not found.",404);
  const audio=await db.prepare(
    "SELECT a.id,a.recap_id AS recapId,a.remote_file_id AS remoteFileId,"+
    "a.storage_owner_user_id AS ownerUserId,a.connection_id AS connectionId,"+
    "s.provider,s.status AS connectionStatus,a.status,a.mime_type AS mimeType,a.byte_size AS byteSize "+
    "FROM campaign_recap_audio_assets a JOIN user_recap_storage_connections s "+
    "ON s.id=a.connection_id AND s.user_id=a.storage_owner_user_id "+
    "WHERE a.id=? AND a.campaign_id=?",
  ).bind(assetId,campaign.id).first<Asset>();
  if(!audio || !audio.recapId)throw new CampaignServiceError("Audio recording not found.",404);
  // The player must be permitted to view this *specific* recap.
  await getCampaignSessionRecap(db,actor,campaignId,audio.recapId);
  if(audio.provider!=="google-drive" || audio.status!=="ready" ||
     audio.connectionStatus!=="connected" || !audio.remoteFileId ||
     !/^[a-zA-Z0-9_-]{5,256}$/u.test(audio.remoteFileId) ||
     !audio.mimeType || !Number.isSafeInteger(audio.byteSize) || (audio.byteSize ?? 0) <= 0) {
    throw new CampaignServiceError("Recording unavailable. Ask the GM to reconnect storage.",409);
  }
  const range=validateAudioRangeHeader(rangeHeader,audio.byteSize!);
  // The server uses only the storage owner's sealed credential, regardless
  // of which campaign member is listening.
  const accessToken=await getGmDriveAccessToken(db,settings,audio.ownerUserId,audio.connectionId);
  const upstream=await fetch("https://www.googleapis.com/drive/v3/files/"+
    encodeURIComponent(audio.remoteFileId)+"?alt=media",{
      method:"GET",redirect:"manual",
      headers:{
        authorization:"Bearer "+accessToken,
        ...(range?{range}:{}),
      },
      signal,
    });
  if(upstream.status===416){
    return new Response(null,{status:416,headers:{
      "content-range":"bytes */"+audio.byteSize,
      "cache-control":"private, no-store",
    }});
  }
  if(![200,206].includes(upstream.status) || !upstream.body) {
    return Response.json({error:"This recording cannot be played right now."},{
      status:502,headers:{"cache-control":"private, no-store"},
    });
  }
  if(range && upstream.status!==206){
    await upstream.body.cancel();
    return Response.json({error:"Google Drive did not honor audio seeking."},{
      status:502,headers:{"cache-control":"private, no-store"},
    });
  }
  return new Response(upstream.body,{
    status:upstream.status,
    headers:audioPlaybackHeaders(audio.mimeType,upstream.headers),
  });
}
