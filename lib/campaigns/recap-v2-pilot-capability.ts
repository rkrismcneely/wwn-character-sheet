/** Very short-lived bearer capability for one GM-approved *excerpt*.
 * Never pass the Drive OAuth token, full recording or a user session to Groq.
 * A capability is not a shareable public Drive link; treat it as a secret.
 */
import type {RecapAIEncryptionSettings} from "../account/recap-groq-key.ts";

export const V2_PILOT_SOURCE_TTL_SECONDS=10*60;
const MAX_VERIFY_WINDOW_SECONDS=15*60;
const SIGNING_CONTEXT="twe:recap:v2:groq-pilot-excerpt:v1";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const CAMP=/^cmp_[A-Za-z0-9_-]{22}$/u;
const KEY=/^[A-Za-z0-9_-]{43}$/u;
const NONCE=/^[0-9a-f-]{36}$/iu;
const SIGNATURE=/^[A-Za-z0-9_-]{43}$/u;
export type PilotCapabilityIdentity={
 campaignId:string;recapId:string;assetId:string;ownerId:string;
};
export type PilotCapability=PilotCapabilityIdentity&{
 expires:number;nonce:string;signature:string;
};
function decode(s:string):Uint8Array<ArrayBuffer>{
 const raw=atob(s.replaceAll("-","+").replaceAll("_","/"));
 const bytes=new Uint8Array(raw.length);
 for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
 return bytes;
}
function encode(bytes:Uint8Array):string{
 let raw="";
 for(const value of bytes)raw+=String.fromCharCode(value);
 return btoa(raw).replaceAll("+","-").replaceAll("/","_").replace(/=+$/u,"");
}
function validateIdentity(v:PilotCapabilityIdentity):boolean{
 return CAMP.test(v.campaignId)&&UUID.test(v.recapId)&&UUID.test(v.assetId)&&
  typeof v.ownerId==="string"&&v.ownerId.length>=1&&v.ownerId.length<=256&&
  !/[\x00-\x1f]/u.test(v.ownerId);
}
function message(value:PilotCapabilityIdentity&{expires:number;nonce:string}):Uint8Array<ArrayBuffer>{
 return new Uint8Array(new TextEncoder().encode([SIGNING_CONTEXT,value.campaignId,value.recapId,
  value.assetId,value.ownerId,String(value.expires),value.nonce].join("\n")));
}
async function hmacKey(settings:RecapAIEncryptionSettings):Promise<CryptoKey>{
 const key=settings.RECAP_STORAGE_ENCRYPTION_KEY??"";
 if(!KEY.test(key))throw Error("Private excerpt access is not configured.");
 return crypto.subtle.importKey("raw",decode(key),{name:"HMAC",hash:"SHA-256"},false,["sign","verify"]);
}
export async function mintPilotCapability(settings:RecapAIEncryptionSettings,
 identity:PilotCapabilityIdentity,nowMs=Date.now()):Promise<PilotCapability>{
 if(!validateIdentity(identity)||!Number.isFinite(nowMs))throw Error("Invalid pilot excerpt owner.");
 const expires=Math.floor(nowMs/1000)+V2_PILOT_SOURCE_TTL_SECONDS;
 const nonce=crypto.randomUUID();
 const unsigned={...identity,expires,nonce};
 const bytes=new Uint8Array(await crypto.subtle.sign("HMAC",await hmacKey(settings),
  message(unsigned)));
 return {...unsigned,signature:encode(bytes)};
}
export async function verifyPilotCapability(settings:RecapAIEncryptionSettings,
 value:PilotCapability,nowMs=Date.now()):Promise<boolean>{
 if(!validateIdentity(value)||!Number.isFinite(nowMs)||
  !Number.isSafeInteger(value.expires)||!NONCE.test(value.nonce)||
  !SIGNATURE.test(value.signature))return false;
 const now=Math.floor(nowMs/1000);
 if(value.expires<now||value.expires>now+MAX_VERIFY_WINDOW_SECONDS)return false;
 try{return await crypto.subtle.verify("HMAC",await hmacKey(settings),
   decode(value.signature),message(value));}catch{return false;}
}
