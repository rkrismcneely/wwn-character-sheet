import { CANONICAL_ORIGIN } from "../auth-constants.ts";
import { hashOpaqueToken, randomBase64URL } from "../security/opaque-tokens.ts";
import { CampaignServiceError } from "../campaigns/service.ts";

export type DropboxSettings = {
  DROPBOX_APP_KEY?:string;
  DROPBOX_APP_SECRET?:string;
  RECAP_STORAGE_ENCRYPTION_KEY?:string;
};
const scopes=["files.content.read","files.content.write","files.metadata.read","account_info.read"] as const;
export const DROPBOX_CALLBACK=CANONICAL_ORIGIN+"/api/account/storage/dropbox/callback";
const COOKIE="twe_dropbox_oauth";
const encoder=new TextEncoder();
function url64(data:Uint8Array):string{
  let raw="";for(const byte of data)raw+=String.fromCharCode(byte);
  return btoa(raw).replaceAll("+","-").replaceAll("/","_").replace(/=+$/u,"");
}
function fromUrl64(str:string):Uint8Array<ArrayBuffer>{
  if(!/^[A-Za-z0-9_-]+$/u.test(str))throw Error("Invalid encrypted credential.");
  const raw=atob(str.replaceAll("-","+").replaceAll("_","/"));
  const out=new Uint8Array(new ArrayBuffer(raw.length));
  for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);
  return out;
}
export function dropboxConfigured(s:DropboxSettings):boolean{
  return Boolean(s.DROPBOX_APP_KEY?.trim()&&s.DROPBOX_APP_SECRET?.trim()&&
    /^[A-Za-z0-9_-]{43}$/u.test(s.RECAP_STORAGE_ENCRYPTION_KEY??""));
}
export function requireDropbox(s:DropboxSettings){
  if(!dropboxConfigured(s))throw new CampaignServiceError(
    "Dropbox storage is not configured by the site owner yet.",409);
}
async function key(s:DropboxSettings):Promise<CryptoKey>{
  requireDropbox(s);
  return crypto.subtle.importKey("raw",fromUrl64(s.RECAP_STORAGE_ENCRYPTION_KEY!),
    "AES-GCM",false,["encrypt","decrypt"]);
}
const aad=(user:string,id:string)=>encoder.encode("twe-recap-storage:v1:dropbox:"+user+":"+id);
export async function encryptDropboxRefreshToken(s:DropboxSettings,user:string,id:string,token:string){
  if(!token||token.length>8192)throw Error("Invalid Dropbox refresh credential.");
  const nonce=crypto.getRandomValues(new Uint8Array(12));
  const raw=await crypto.subtle.encrypt({name:"AES-GCM",iv:nonce,additionalData:aad(user,id)},
    await key(s),encoder.encode(token));
  return {ciphertext:url64(new Uint8Array(raw)),nonce:url64(nonce),version:1};
}
export async function decryptDropboxRefreshToken(s:DropboxSettings,user:string,id:string,
  row:{ciphertext:string;nonce:string;version:number}):Promise<string>{
  if(row.version!==1||!(/^[A-Za-z0-9_-]{16}$/u).test(row.nonce))
    throw Error("Invalid Dropbox credential envelope.");
  const raw=await crypto.subtle.decrypt({name:"AES-GCM",iv:fromUrl64(row.nonce),
    additionalData:aad(user,id)},await key(s),fromUrl64(row.ciphertext));
  return new TextDecoder().decode(raw);
}
export function newDropboxState(){return randomBase64URL(32);}
export function dropboxCookie(state:string,clear=false){
  return COOKIE+"="+(clear?"":state)+"; Path=/api/account/storage/dropbox; HttpOnly; Secure; SameSite=Lax; "+
    (clear?"Max-Age=0":"Max-Age=600");
}
export function hasDropboxCookie(request:Request,state:string){
  const cookie=request.headers.get("cookie")?.split(";").map(x=>x.trim())
    .find(x=>x.startsWith(COOKIE+"="))?.slice(COOKIE.length+1);
  return Boolean(cookie&&cookie===state&&/^[A-Za-z0-9_-]{40,128}$/u.test(cookie));
}
export async function createDropboxState(db:D1Database,user:string,state:string,now=Date.now()){
  await db.prepare("DELETE FROM user_recap_storage_oauth_states WHERE user_id=? AND expires_at<=?")
    .bind(user,now).run();
  const pending=await db.prepare("SELECT COUNT(*) AS total FROM user_recap_storage_oauth_states WHERE user_id=?")
    .bind(user).first<{total:number}>();
  if(Number(pending?.total??0)>=5)throw new CampaignServiceError("Too many pending storage connections.",409);
  await db.prepare("INSERT INTO user_recap_storage_oauth_states (state_hash,user_id,expires_at,created_at) VALUES (?,?,?,?)")
    .bind(await hashOpaqueToken(state),user,now+600000,now).run();
}
export async function consumeDropboxState(db:D1Database,user:string,state:string,now=Date.now()){
  if(!/^[A-Za-z0-9_-]{40,128}$/u.test(state))return false;
  const found=await db.prepare("DELETE FROM user_recap_storage_oauth_states "+
    "WHERE state_hash=? AND user_id=? AND expires_at>? RETURNING user_id AS userId")
    .bind(await hashOpaqueToken(state),user,now).first<{userId:string}>();
  return found?.userId===user;
}
export function dropboxAuthorizationUrl(s:DropboxSettings,state:string){
  requireDropbox(s);
  const url=new URL("https://www.dropbox.com/oauth2/authorize");
  url.search=new URLSearchParams({client_id:s.DROPBOX_APP_KEY!,response_type:"code",
    redirect_uri:DROPBOX_CALLBACK,token_access_type:"offline",scope:scopes.join(" "),state}).toString();
  return url.toString();
}
type TokenReply={access_token?:unknown;refresh_token?:unknown;scope?:unknown;token_type?:unknown};
export async function exchangeDropboxCode(s:DropboxSettings,code:string){
  requireDropbox(s);
  if(!code||code.length>2048)throw Error("Invalid Dropbox authorization.");
  const resp=await fetch("https://api.dropboxapi.com/oauth2/token",{
    method:"POST",redirect:"manual",
    headers:{"content-type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({code,grant_type:"authorization_code",
      redirect_uri:DROPBOX_CALLBACK,client_id:s.DROPBOX_APP_KEY!,
      client_secret:s.DROPBOX_APP_SECRET!}),signal:AbortSignal.timeout(15000),
  });
  if(!resp.ok)throw Error("Dropbox token exchange rejected.");
  const token=await resp.json() as TokenReply;
  if(typeof token.access_token!=="string"||typeof token.refresh_token!=="string"||
      !token.access_token||!token.refresh_token||token.token_type!=="bearer"&&token.token_type!=="Bearer")
    throw Error("Dropbox did not grant offline access.");
  const granted=typeof token.scope==="string"?token.scope.split(/\s+/u):[];
  if(!scopes.every(scope=>granted.includes(scope)))
    throw Error("Dropbox did not grant required scopes.");
  return {accessToken:token.access_token,refreshToken:token.refresh_token,scope:granted.join(" ")};
}
export async function dropboxAccountName(accessToken:string){
  const resp=await fetch("https://api.dropboxapi.com/2/users/get_current_account",{
    method:"POST",headers:{authorization:"Bearer "+accessToken},
    signal:AbortSignal.timeout(15000),redirect:"manual",
  });
  if(!resp.ok)throw Error("Dropbox account lookup failed.");
  const data=await resp.json() as {email?:unknown;name?:{display_name?:unknown}};
  const display=typeof data.email==="string"?data.email:data.name?.display_name;
  return typeof display==="string"&&display.trim()?display.slice(0,160):"Dropbox";
}
