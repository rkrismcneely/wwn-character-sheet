import type {DriveSettings} from "../account/recap-google-drive-oauth.ts";
import {validateDriveSessionUrl} from "./recap-drive-upload.ts";

/** An authenticated GM may relay only one Google-issued, owner-bound upload session.
 * The signed ticket is not a Google OAuth token and cannot be used for other URLs.
 * No audio data, refresh credential or upload session is persisted by this helper.
 */
const utf8=new TextEncoder();
export const DRIVE_RELAY_TICKET_LIFETIME_MS=24*60*60*1000;
export const DRIVE_RELAY_MAX_CHUNK_BYTES=8*1024*1024;
const ticketPattern=/^[a-zA-Z0-9_-]{43}$/u;

async function signingKey(settings:DriveSettings):Promise<CryptoKey>{
  const encoded=settings.RECAP_STORAGE_ENCRYPTION_KEY;
  if(!encoded||!ticketPattern.test(encoded))throw Error("Drive upload protection is not configured.");
  const raw=atob(encoded.replaceAll("-","+").replaceAll("_","/"));
  const bytes=Uint8Array.from(raw,ch=>ch.charCodeAt(0));
  if(bytes.length!==32)throw Error("Invalid Drive upload protection.");
  return crypto.subtle.importKey("raw",bytes,{name:"HMAC",hash:"SHA-256"},false,["sign","verify"]);
}
function subject(userId:string,campaignId:string,assetId:string,url:string,issuedAt:number):Uint8Array<ArrayBuffer>{
  // Newlines cannot be injected by URLs (validated) or app-generated IDs.
  return utf8.encode(["twe:recap-drive-upload:v1",userId,campaignId,assetId,url,String(issuedAt)].join("\n"));
}
function toBase64url(bytes:ArrayBuffer):string{
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replaceAll("+","-").replaceAll("/","_").replace(/=+$/u,"");
}
function fromBase64url(encoded:string):Uint8Array{
  const raw=atob(encoded.replaceAll("-","+").replaceAll("_","/"));
  const bytes=new Uint8Array(new ArrayBuffer(raw.length));
  for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
  return bytes;
}
export async function issueDriveUploadTicket(settings:DriveSettings,parameters:{
  userId:string;campaignId:string;assetId:string;uploadSessionUrl:string;issuedAt:number;
}):Promise<string>{
  const url=validateDriveSessionUrl(parameters.uploadSessionUrl);
  if(!Number.isSafeInteger(parameters.issuedAt)||parameters.issuedAt<1)throw Error("Invalid issue time.");
  const bytes=await crypto.subtle.sign("HMAC",await signingKey(settings),subject(
    parameters.userId,parameters.campaignId,parameters.assetId,url,parameters.issuedAt));
  return toBase64url(bytes);
}
export async function verifyDriveUploadTicket(settings:DriveSettings,parameters:{
  userId:string;campaignId:string;assetId:string;uploadSessionUrl:string;issuedAt:number;
},ticket:string,now=Date.now()):Promise<boolean>{
  if(!ticketPattern.test(ticket)||!Number.isSafeInteger(parameters.issuedAt)||
    parameters.issuedAt>now+60_000||now-parameters.issuedAt>DRIVE_RELAY_TICKET_LIFETIME_MS)
    return false;
  let url:string;
  try{url=validateDriveSessionUrl(parameters.uploadSessionUrl);}
  catch{return false;}
  try{
    return crypto.subtle.verify("HMAC",await signingKey(settings),fromBase64url(ticket),
      subject(parameters.userId,parameters.campaignId,parameters.assetId,url,parameters.issuedAt));
  }catch{return false;}
}
export type DriveRelayRange={kind:"chunk"|"probe";total:number;length:number};
export function parseDriveRelayRange(value:string|null,byteSize:number):DriveRelayRange|null{
  if(!Number.isSafeInteger(byteSize)||byteSize<1)return null;
  const probe=/^bytes \*\/(\d+)$/u.exec(value??"");
  if(probe)return Number(probe[1])===byteSize?{kind:"probe",total:byteSize,length:0}:null;
  const chunk=/^bytes (\d+)-(\d+)\/(\d+)$/u.exec(value??"");
  if(!chunk)return null;
  const start=Number(chunk[1]),end=Number(chunk[2]),total=Number(chunk[3]);
  const length=end-start+1;
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||total!==byteSize||
    start<0||end<start||end>=total||length>DRIVE_RELAY_MAX_CHUNK_BYTES)return null;
  // Google requires 256 KiB aligned chunks and offsets except the last chunk.
  if(start%(256*1024)!==0 || (end+1<total&&length%(256*1024)!==0))return null;
  return {kind:"chunk",total,length};
}
