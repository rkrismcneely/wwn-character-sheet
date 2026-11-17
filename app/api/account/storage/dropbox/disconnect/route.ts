import {env} from "cloudflare:workers";
import {getSessionActor} from "@/lib/auth-session";
import {getCampaignD1} from "@/lib/campaigns/service";
import {CANONICAL_ORIGIN} from "@/lib/auth-constants";
import {readBoundedJson,RequestBodyError} from "@/lib/http-json";
import {decryptDropboxRefreshToken,type DropboxSettings} from "@/lib/account/recap-dropbox-oauth";
export async function POST(request:Request):Promise<Response>{
  const actor=await getSessionActor(request);
  if(!actor)return Response.json({error:"Sign in required."},{status:401});
  if(request.headers.get("origin")!==CANONICAL_ORIGIN)
    return Response.json({error:"Invalid request origin."},{status:403});
  let body:{connectionId?:unknown};
  try{body=await readBoundedJson(request,1024) as typeof body;}
  catch(e){return Response.json({error:e instanceof RequestBodyError?e.message:"Invalid request."},
    {status:e instanceof RequestBodyError?e.status:422});}
  if(typeof body.connectionId!=="string"||!/^[0-9a-f-]{36}$/iu.test(body.connectionId))
    return Response.json({error:"Invalid Dropbox connection."},{status:422});
  const db=await getCampaignD1();
  const row=await db.prepare("SELECT credential_ciphertext AS ciphertext,credential_nonce AS nonce,"+
    "credential_version AS version FROM user_recap_storage_connections "+
    "WHERE id=? AND user_id=? AND provider='dropbox'")
    .bind(body.connectionId,actor.userId)
    .first<{ciphertext:string|null;nonce:string|null;version:number|null}>();
  if(!row)return Response.json({error:"Connection not found."},{status:404});
  const now=new Date().toISOString();
  await db.prepare("UPDATE user_recap_storage_connections SET status='disconnected',"+
    "credential_ciphertext=NULL,credential_nonce=NULL,credential_version=NULL,updated_at=? "+
    "WHERE id=? AND user_id=? AND provider='dropbox'")
    .bind(now,body.connectionId,actor.userId).run();
  if(row.ciphertext&&row.nonce&&row.version===1){
    try{
      const token=await decryptDropboxRefreshToken(env as unknown as DropboxSettings,
        actor.userId,body.connectionId,{ciphertext:row.ciphertext,nonce:row.nonce,version:row.version});
      // Dropbox revoke takes an ACCESS token. Refresh first; a failed revocation
      // must never undo the authoritative local disconnect.
      const cfg=env as unknown as DropboxSettings;
      const refreshed=await fetch("https://api.dropboxapi.com/oauth2/token",{
        method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},
        body:new URLSearchParams({grant_type:"refresh_token",refresh_token:token,
          client_id:cfg.DROPBOX_APP_KEY??"",client_secret:cfg.DROPBOX_APP_SECRET??""}),
        signal:AbortSignal.timeout(10000),redirect:"manual"});
      if(refreshed.ok){
        const result=await refreshed.json() as {access_token?:unknown};
        if(typeof result.access_token==="string")await fetch("https://api.dropboxapi.com/2/auth/token/revoke",{
          method:"POST",headers:{authorization:"Bearer "+result.access_token},
          signal:AbortSignal.timeout(10000),redirect:"manual"});
      }
    }catch{/* User's local credential has already been erased. */}
  }
  return Response.json({disconnected:true},{headers:{"cache-control":"private, no-store"}});
}