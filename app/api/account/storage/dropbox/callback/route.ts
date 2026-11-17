import {env} from "cloudflare:workers";
import {getSessionActor} from "@/lib/auth-session";
import {CANONICAL_ORIGIN} from "@/lib/auth-constants";
import {getCampaignD1} from "@/lib/campaigns/service";
import {consumeDropboxState,dropboxAccountName,dropboxConfigured,dropboxCookie,
  encryptDropboxRefreshToken,exchangeDropboxCode,hasDropboxCookie,
  type DropboxSettings} from "@/lib/account/recap-dropbox-oauth";

type Outcome="connected"|"cancelled"|"error";
type Reason="invalid_origin"|"session_missing"|"oauth_denied"|"callback_incomplete"|
  "state_cookie_missing"|"state_expired"|"server_config"|"token_exchange"|
  "missing_scope"|"secure_storage_error"|"database_error"|"unexpected";
export async function GET(request:Request):Promise<Response>{
  const end=(outcome:Outcome,reason?:Reason)=>{
    const url=new URL(CANONICAL_ORIGIN+"/account");
    url.searchParams.set("dropbox",outcome);
    if(reason)url.searchParams.set("dropbox_error",reason);
    url.hash="#recap-setup";
    return new Response(null,{status:303,headers:{location:url.toString(),
      "set-cookie":dropboxCookie("",true),"cache-control":"private, no-store",
      "referrer-policy":"no-referrer"}});
  };
  let stage:"state"|"config"|"token"|"encrypt"|"database"="state";
  try{
    if(new URL(request.url).origin!==CANONICAL_ORIGIN)return end("error","invalid_origin");
    const actor=await getSessionActor(request);
    if(!actor)return end("error","session_missing");
    const params=new URL(request.url).searchParams;
    if(params.get("error")==="access_denied")return end("cancelled");
    if(params.has("error"))return end("error","oauth_denied");
    const state=params.get("state"),code=params.get("code");
    if(!state||!code)return end("error","callback_incomplete");
    if(!hasDropboxCookie(request,state))return end("error","state_cookie_missing");
    const db=await getCampaignD1();
    if(!await consumeDropboxState(db,actor.userId,state))return end("error","state_expired");
    stage="config";
    const cfg=env as unknown as DropboxSettings;
    if(!dropboxConfigured(cfg))return end("error","server_config");
    stage="token";
    const token=await exchangeDropboxCode(cfg,code);
    const label=await dropboxAccountName(token.accessToken);
    stage="encrypt";
    const connectionId=crypto.randomUUID();
    const encrypted=await encryptDropboxRefreshToken(cfg,actor.userId,connectionId,token.refreshToken);
    stage="database";
    const now=new Date().toISOString();
    await db.prepare("INSERT INTO user_recap_storage_connections "+
      "(id,user_id,provider,display_name,granted_scopes,status,credential_ciphertext,credential_nonce,credential_version,connected_at,created_at,updated_at) "+
      "VALUES (?,?,'dropbox',?,?,'connected',?,?,?,?,?,?)")
      .bind(connectionId,actor.userId,label,token.scope,encrypted.ciphertext,
        encrypted.nonce,encrypted.version,now,now,now).run();
    return end("connected");
  }catch{
    if(stage==="state"||stage==="database")return end("error","database_error");
    if(stage==="config")return end("error","server_config");
    if(stage==="encrypt")return end("error","secure_storage_error");
    if(stage==="token")return end("error","token_exchange");
    return end("error","unexpected");
  }
}