/** Server-side AES-GCM seal for GM-owned Gemini API keys.
 * Reuses TWE's existing 256-bit recap encryption secret with provider-specific AAD.
 * Only per-user verified ownership routes can call decrypt, never browser modules.
 */
export type RecapAIEncryptionSettings={RECAP_STORAGE_ENCRYPTION_KEY?:string};
export type EncryptedProviderKey={ciphertext:string;nonce:string;version:1};
const KEY_PATTERN=/^[A-Za-z0-9_-]{43}$/u;
// Google AI Studio can issue different key types. Reject unsafe control/space
// characters and unreasonably large values, but do not invent an API key
// alphabet/length rule; Google's own read-only models endpoint verifies access.
const API_KEY_PATTERN=/^[\\x21-\\x7e]{16,512}$/u;
const encoder=new TextEncoder();

export function recapAIEncryptionReady(config:RecapAIEncryptionSettings):boolean {
  return KEY_PATTERN.test(config.RECAP_STORAGE_ENCRYPTION_KEY??"");
}
function fromBase64URL(s:string):Uint8Array<ArrayBuffer>{
  const raw=atob(s.replaceAll("-","+").replaceAll("_","/"));
  const buffer=new ArrayBuffer(raw.length);
  const arr=new Uint8Array(buffer);
  for(let i=0;i<raw.length;i++)arr[i]=raw.charCodeAt(i);
  return arr;
}
function toBase64URL(buffer:ArrayBufferLike):string {
  let raw="";
  for(const byte of new Uint8Array(buffer))raw+=String.fromCharCode(byte);
  return btoa(raw).replaceAll("+","-").replaceAll("/","_").replace(/=+$/u,"");
}
async function key(config:RecapAIEncryptionSettings):Promise<CryptoKey>{
  if(!recapAIEncryptionReady(config))
    throw new Error("Encrypted provider connections are not configured.");
  return crypto.subtle.importKey("raw",fromBase64URL(config.RECAP_STORAGE_ENCRYPTION_KEY!),
    "AES-GCM",false,["encrypt","decrypt"]);
}
function associatedData(userId:string,id:string):Uint8Array<ArrayBuffer>{
  if(!userId||!/^[0-9a-f-]{36}$/iu.test(id))throw new Error("Invalid connection identity.");
  return encoder.encode("twe:recap-ai:v1:gemini:"+userId+":"+id);
}
export function validateGeminiUserKey(raw:unknown):string{
  if(typeof raw!=="string"||!API_KEY_PATTERN.test(raw))
    throw new Error("Enter a valid Google AI Studio API key string (not its key ID). Copy the entire string without spaces or line breaks.");
  return raw;
}
export async function encryptGeminiUserKey(config:RecapAIEncryptionSettings,
  userId:string,id:string,raw:string):Promise<EncryptedProviderKey>{
  validateGeminiUserKey(raw);
  const nonce=crypto.getRandomValues(new Uint8Array(12));
  const encrypted=await crypto.subtle.encrypt({
    name:"AES-GCM",iv:nonce,additionalData:associatedData(userId,id),
  },await key(config),encoder.encode(raw));
  return {ciphertext:toBase64URL(encrypted),nonce:toBase64URL(nonce.buffer),version:1};
}
export async function decryptGeminiUserKey(config:RecapAIEncryptionSettings,
  userId:string,id:string,encrypted:EncryptedProviderKey):Promise<string>{
  if(encrypted.version!==1||!/^[A-Za-z0-9_-]{16}$/u.test(encrypted.nonce) ||
    !/^[A-Za-z0-9_-]{32,2048}$/u.test(encrypted.ciphertext))
    throw new Error("Unrecognized Gemini credential.");
  const plain=await crypto.subtle.decrypt({
    name:"AES-GCM",iv:fromBase64URL(encrypted.nonce),
    additionalData:associatedData(userId,id),
  },await key(config),fromBase64URL(encrypted.ciphertext));
  return validateGeminiUserKey(new TextDecoder().decode(plain));
}
/** UI-safe public fingerprint; never include key prefix or suffix. */
export async function fingerprintGeminiKey(raw:string):Promise<string>{
  const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",encoder.encode(raw)));
  return Array.from(digest.slice(0,6),b=>b.toString(16).padStart(2,"0")).join("");
}
