import {decryptDropboxRefreshToken,requireDropbox,type DropboxSettings} from "../account/recap-dropbox-oauth.ts";
import {CampaignServiceError} from "./service.ts";

export async function getGmDropboxAccessToken(db:D1Database,settings:DropboxSettings,
  userId:string,connectionId:string):Promise<string>{
  requireDropbox(settings);
  if(!/^[0-9a-f-]{36}$/iu.test(connectionId))
    throw new CampaignServiceError("Choose a valid Dropbox account.",422);
  const row=await db.prepare("SELECT credential_ciphertext AS ciphertext,"+
    "credential_nonce AS nonce,credential_version AS version,status "+
    "FROM user_recap_storage_connections "+
    "WHERE id=? AND user_id=? AND provider='dropbox'")
    .bind(connectionId,userId).first<{ciphertext:string|null;nonce:string|null;version:number|null;status:string}>();
  if(!row||row.status!=="connected"||!row.ciphertext||!row.nonce||row.version!==1)
    throw new CampaignServiceError("Reconnect Dropbox in Account settings.",409);
  let refresh:string;
  try{refresh=await decryptDropboxRefreshToken(settings,userId,connectionId,{
    ciphertext:row.ciphertext,nonce:row.nonce,version:row.version});}
  catch{throw new CampaignServiceError("Dropbox credentials cannot be read. Reconnect the account.",409);}
  let response:Response;
  try{
    response=await fetch("https://api.dropboxapi.com/oauth2/token",{
      method:"POST",redirect:"manual",
      headers:{"content-type":"application/x-www-form-urlencoded"},
      body:new URLSearchParams({grant_type:"refresh_token",refresh_token:refresh,
        client_id:settings.DROPBOX_APP_KEY!,client_secret:settings.DROPBOX_APP_SECRET!}),
      signal:AbortSignal.timeout(15000)});
  }catch{throw new CampaignServiceError("Dropbox is temporarily unavailable.",503);}
  if(!response.ok){
    if(response.status===400||response.status===401){
      await db.prepare("UPDATE user_recap_storage_connections SET status='reconnect_required',updated_at=? "+
        "WHERE id=? AND user_id=? AND provider='dropbox'")
        .bind(new Date().toISOString(),connectionId,userId).run();
      throw new CampaignServiceError("Dropbox authorization expired. Reconnect it in Account settings.",409);
    }
    throw new CampaignServiceError("Dropbox could not refresh the storage connection.",503);
  }
  const body=await response.json() as {access_token?:unknown;token_type?:unknown};
  if(typeof body.access_token!=="string"||!body.access_token||
    !["bearer","Bearer"].includes(String(body.token_type)))
    throw new CampaignServiceError("Dropbox did not provide a valid access token.",503);
  return body.access_token;
}
