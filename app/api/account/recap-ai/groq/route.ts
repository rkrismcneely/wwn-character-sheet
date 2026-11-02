import {env} from "cloudflare:workers";
import {getSessionActor} from "@/lib/auth-session";
import {getCampaignD1} from "@/lib/campaigns/service";
import {CANONICAL_ORIGIN} from "@/lib/auth-constants";
import {readBoundedJson,RequestBodyError} from "@/lib/http-json";
import {recapAIEncryptionReady,encryptGroqUserKey,decryptGroqUserKey,
 fingerprintGroqKey,validateGroqUserKey,type RecapAIEncryptionSettings}
 from "@/lib/account/recap-groq-key";

const noStore={"cache-control":"private, no-store"};
const bad=(error:string,status:number)=>Response.json({error},{status,headers:noStore});
const config=()=>env as unknown as RecapAIEncryptionSettings;
const sameOrigin=(request:Request)=>request.headers.get("origin")===CANONICAL_ORIGIN&&
 request.headers.get("sec-fetch-site")!=="cross-site";
type RecordRow={id:string;status:string;connectedAt:string|null;updatedAt:string;keyFingerprint:string|null;
 ciphertext:string|null;nonce:string|null;version:number|null};
async function owner(request:Request){
 const actor=await getSessionActor(request);
 if(!actor)return null;
 return {userId:actor.userId,db:await getCampaignD1()};
}
async function stored(db:D1Database,userId:string){
 return db.prepare("SELECT id,status,connected_at AS connectedAt,updated_at AS updatedAt,"+
 "key_fingerprint AS keyFingerprint,key_ciphertext AS ciphertext,key_nonce AS nonce,"+
 "key_version AS version FROM user_recap_groq_connections WHERE user_id=?")
 .bind(userId).first<RecordRow>();
}
const safe=(row:RecordRow|null)=>row?{id:row.id,status:row.status,connectedAt:row.connectedAt,
 updatedAt:row.updatedAt,keyFingerprint:row.keyFingerprint}:null;
export async function GET(request:Request){
 try{
  const who=await owner(request);
  if(!who)return bad("Sign in required.",401);
  return Response.json({configured:recapAIEncryptionReady(config()),connection:safe(await stored(who.db,who.userId))},{headers:noStore});
 }catch{return bad("Groq connection status unavailable. Check database migration 0054.",503);}
}
export async function PUT(request:Request){
 if(!sameOrigin(request))return bad("Open Account to connect Groq.",403);
 const who=await owner(request);
 if(!who)return bad("Sign in required.",401);
 if(!recapAIEncryptionReady(config()))return bad("Encrypted AI connections are not configured.",409);
 try{
  const body=await readBoundedJson(request,1024) as {apiKey?:unknown;consent?:unknown};
  if(body.consent!==true)return bad("Approve storing your Groq API key.",422);
  const key=validateGroqUserKey(body.apiKey);
  const previous=await stored(who.db,who.userId);
  const id=previous?.id??crypto.randomUUID();
  const encrypted=await encryptGroqUserKey(config(),who.userId,id,key);
  const fingerprint=await fingerprintGroqKey(key);
  const now=new Date().toISOString();
  await who.db.prepare("INSERT INTO user_recap_groq_connections "+
  "(id,user_id,status,key_ciphertext,key_nonce,key_version,key_fingerprint,connected_at,updated_at,created_at) "+
  "VALUES (?,?,'connected',?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET "+
  "status='connected',key_ciphertext=excluded.key_ciphertext,key_nonce=excluded.key_nonce,"+
  "key_version=excluded.key_version,key_fingerprint=excluded.key_fingerprint,"+
  "connected_at=excluded.connected_at,updated_at=excluded.updated_at")
  .bind(id,who.userId,encrypted.ciphertext,encrypted.nonce,1,fingerprint,now,now,now).run();
  return Response.json({saved:true},{headers:noStore});
 }catch(e){
  if(e instanceof RequestBodyError)return bad(e.message,e.status);
  return bad(e instanceof Error&&e.message.startsWith("Enter a valid")?e.message:"Could not save Groq key.",422);
 }
}
export async function DELETE(request:Request){
 if(!sameOrigin(request))return bad("Open Account to disconnect Groq.",403);
 const who=await owner(request);
 if(!who)return bad("Sign in required.",401);
 try{
  await who.db.prepare("UPDATE user_recap_groq_connections SET status='disconnected',"+
  "key_ciphertext=NULL,key_nonce=NULL,key_version=NULL,key_fingerprint=NULL,updated_at=? WHERE user_id=?")
  .bind(new Date().toISOString(),who.userId).run();
  return Response.json({disconnected:true},{headers:noStore});
 }catch{return bad("Could not disconnect Groq.",503);}
}
/** Read-only provider verification. No model generation or quota spend is requested. */
export async function POST(request:Request){
 if(!sameOrigin(request))return bad("Open Account to test Groq.",403);
 const who=await owner(request);
 if(!who)return bad("Sign in required.",401);
 if(!recapAIEncryptionReady(config()))return bad("Encrypted AI connections are not configured.",409);
 const row=await stored(who.db,who.userId);
 if(!row||row.status==="disconnected"||!row.ciphertext||!row.nonce||row.version!==1)
  return bad("Connect your Groq key first.",409);
 let key:string;
 try{key=await decryptGroqUserKey(config(),who.userId,row.id,
  {ciphertext:row.ciphertext,nonce:row.nonce,version:1});}
 catch{return bad("Stored key could not be decrypted. Reconnect Groq.",409);}
 let response:Response;
 try{response=await fetch("https://api.groq.com/openai/v1/models",{
  headers:{Authorization:"Bearer "+key},redirect:"manual",signal:AbortSignal.timeout(12000),
 });}catch{return bad("Groq verification unavailable. Your saved key is unchanged.",503);}
 if(response.status===401||response.status===403){
  await who.db.prepare("UPDATE user_recap_groq_connections SET status='needs_attention',updated_at=? WHERE id=? AND user_id=?")
   .bind(new Date().toISOString(),row.id,who.userId).run();
  return bad("Groq rejected the saved key. Check your GroqCloud account.",403);
 }
 if(!response.ok||response.redirected)return bad("Groq verification temporarily unavailable. Your key is unchanged.",503);
 if(Number(response.headers.get("content-length")??"0")>1000000)return bad("Unexpected Groq response.",503);
 let data:unknown;
 try{const text=await response.text();if(text.length>1000000)throw Error("large");data=JSON.parse(text);}
 catch{return bad("Unexpected Groq models response.",503);}
 if(!data||typeof data!=="object"||!Array.isArray((data as {data?:unknown}).data))
  return bad("Unexpected Groq models response.",503);
 await who.db.prepare("UPDATE user_recap_groq_connections SET status='connected',updated_at=? WHERE id=? AND user_id=?")
 .bind(new Date().toISOString(),row.id,who.userId).run();
 return Response.json({verified:true,notice:"Groq key verified with a read-only request. No recap generation started."},{headers:noStore});
}
