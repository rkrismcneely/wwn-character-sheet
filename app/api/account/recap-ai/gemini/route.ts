import { env } from "cloudflare:workers";
import { getSessionActor } from "@/lib/auth-session";
import { getCampaignD1 } from "@/lib/campaigns/service";
import { readBoundedJson,RequestBodyError } from "@/lib/http-json";
import { recapAIEncryptionReady,encryptGeminiUserKey,decryptGeminiUserKey,
  fingerprintGeminiKey,validateGeminiUserKey,
  type RecapAIEncryptionSettings,type EncryptedProviderKey } from "@/lib/account/recap-gemini-key";

const config=()=>env as unknown as RecapAIEncryptionSettings;
const noCache={"cache-control":"private, no-store"};
type Connection={id:string;status:"connected"|"disconnected"|"needs_attention";
  connectedAt:string|null;updatedAt:string;keyFingerprint:string|null};
type SecretRow=Connection&{ciphertext:string|null;nonce:string|null;version:number|null};
const bad=(message:string,status:number)=>Response.json({error:message},{status,headers:noCache});
const originOk=(request:Request)=>request.headers.get("origin")===new URL(request.url).origin&&
  request.headers.get("sec-fetch-site")!=="cross-site";
async function account(request:Request){
  const actor=await getSessionActor(request);
  if(!actor)return null;
  return {id:actor.userId,db:await getCampaignD1()};
}
async function stored(db:D1Database,userId:string):Promise<SecretRow|null>{
  return db.prepare("SELECT id,status,connected_at AS connectedAt,updated_at AS updatedAt,"+
    "key_fingerprint AS keyFingerprint,key_ciphertext AS ciphertext,key_nonce AS nonce,"+
    "key_version AS version FROM user_recap_ai_connections WHERE user_id=? AND provider='gemini'")
    .bind(userId).first<SecretRow>();
}
function statusOf(item:Connection|null){
  return item?{id:item.id,status:item.status,connectedAt:item.connectedAt,
    updatedAt:item.updatedAt,keyFingerprint:item.keyFingerprint}:null;
}
export async function GET(request:Request){
  try{
    const who=await account(request);
    if(!who)return bad("Sign in required.",401);
    const row=await stored(who.db,who.id);
    return Response.json({configured:recapAIEncryptionReady(config()),connection:statusOf(row)},{headers:noCache});
  }catch{
    // JSON, not a generic HTML 500, even when a prerequisite migration is missing.
    return bad("Gemini account status is temporarily unavailable. Check the recap database migration.",503);
  }
}
export async function PUT(request:Request){
  if(!originOk(request))return bad("Start this action from your TWE Account page.",403);
  const who=await account(request);
  if(!who)return bad("Sign in required.",401);
  if(!recapAIEncryptionReady(config()))return bad("Encrypted AI connections are not configured by TWE.",409);
  try{
    const data=await readBoundedJson(request,1024) as {apiKey?:unknown;consent?:unknown};
    if(data?.consent!==true)return bad("Confirm connecting your personal Google AI Studio project.",422);
    const plaintext=validateGeminiUserKey(data?.apiKey);
    const existing=await stored(who.db,who.id);
    const id=existing?.id??crypto.randomUUID();
    const encrypted=await encryptGeminiUserKey(config(),who.id,id,plaintext);
    const fingerprint=await fingerprintGeminiKey(plaintext);
    const now=new Date().toISOString();
    await who.db.prepare("INSERT INTO user_recap_ai_connections "+
      "(id,user_id,provider,status,key_ciphertext,key_nonce,key_version,key_fingerprint,connected_at,updated_at,created_at) "+
      "VALUES (?,?,'gemini','connected',?,?,?,?,?,?,?) "+
      "ON CONFLICT(user_id,provider) DO UPDATE SET status='connected',"+
      "key_ciphertext=excluded.key_ciphertext,key_nonce=excluded.key_nonce,"+
      "key_version=excluded.key_version,key_fingerprint=excluded.key_fingerprint,"+
      "connected_at=excluded.connected_at,updated_at=excluded.updated_at")
      .bind(id,who.id,encrypted.ciphertext,encrypted.nonce,encrypted.version,
        fingerprint,now,now,now).run();
    return Response.json({saved:true,connection:{id,status:"connected",
      connectedAt:now,updatedAt:now,keyFingerprint:fingerprint},verified:false},{headers:noCache});
  }catch(e){
    if(e instanceof RequestBodyError)return bad(e.message,e.status);
    return bad(e instanceof Error&&/Enter a valid/.test(e.message)?e.message:
      "Could not store the encrypted Gemini connection.",422);
  }
}
export async function DELETE(request:Request){
  if(!originOk(request))return bad("Start this action from your TWE Account page.",403);
  const who=await account(request);
  if(!who)return bad("Sign in required.",401);
  await who.db.prepare("UPDATE user_recap_ai_connections SET status='disconnected',"+
    "key_ciphertext=NULL,key_nonce=NULL,key_version=NULL,key_fingerprint=NULL,"+
    "updated_at=? WHERE user_id=? AND provider='gemini'")
    .bind(new Date().toISOString(),who.id).run();
  return Response.json({disconnected:true,
    notice:"TWE no longer stores this credential. Also revoke your key in Google AI Studio."},
  {headers:noCache});
}
/** Credential verification is a read-only models GET, not paid transcription. */
export async function POST(request:Request){
  if(!originOk(request))return bad("Start this action from your TWE Account page.",403);
  const who=await account(request);
  if(!who)return bad("Sign in required.",401);
  if(!recapAIEncryptionReady(config()))return bad("Encrypted AI connections are not configured.",409);
  const row=await stored(who.db,who.id);
  if(!row||row.status==="disconnected"||!row.ciphertext||!row.nonce||row.version!==1)
    return bad("Connect your own Gemini account first.",409);
  let plain:string;
  try{plain=await decryptGeminiUserKey(config(),who.id,row.id,
    {ciphertext:row.ciphertext,nonce:row.nonce,version:1});}
  catch{return bad("Stored credential could not be decrypted. Reconnect the account.",409);}
  try{
    const response=await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1",{
      method:"GET",redirect:"error",signal:AbortSignal.timeout(10000),
      headers:{"x-goog-api-key":plain},
    });
    if(!response.ok){
      if(response.status===429)return bad("Google rate limit reached; retry verification later.",429);
      await who.db.prepare("UPDATE user_recap_ai_connections SET status='needs_attention',"+
        "updated_at=? WHERE id=? AND user_id=? AND key_fingerprint=?")
        .bind(new Date().toISOString(),row.id,who.id,row.keyFingerprint).run();
      if(response.status===400||response.status===401)
        return bad("Google rejected this credential. Copy the API key string from AI Studio (not its key ID).",403);
      if(response.status===403)
        return bad("Google denied this key access to the Gemini API. Check its project and Gemini API permissions in AI Studio.",403);
      return bad("Google couldn't verify Gemini access (HTTP "+response.status+"). Try again or check the selected project.",503);
    }
    const modelList=await response.json() as {models?:unknown};
    if(!Array.isArray(modelList.models)||!modelList.models.length)
      return bad("Google did not return an accessible Gemini model for this key.",403);
    await who.db.prepare("UPDATE user_recap_ai_connections SET status='connected',"+
      "updated_at=? WHERE id=? AND user_id=? AND key_fingerprint=?")
      .bind(new Date().toISOString(),row.id,who.id,row.keyFingerprint).run();
    return Response.json({verified:true,notice:"Gemini model access verified without using transcription quota."},
      {headers:noCache});
  }catch{return bad("Google connection verification is unavailable. No transcription was started.",503);}
}
