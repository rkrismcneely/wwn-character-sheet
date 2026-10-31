import { parsePcmWavHeader } from "./recap-wav-chunks.ts";
import { GEMINI_BACKGROUND_MAX_CLIP_BYTES,GEMINI_BACKGROUND_MAX_CLIP_MS } from "./recap-gemini-background.ts";

/** Pure, source-agnostic integrity checks on one bounded GM-owned Drive clip. */
export type GeminiDriveMetadata={
  id?:unknown;size?:unknown;mimeType?:unknown;trashed?:unknown;
  appProperties?:Record<string,unknown>;
};
const UUID=/^[0-9a-f]{64}$/u;
export function validateGeminiDriveFile(file:GeminiDriveMetadata,clip:{
  assetId:string;campaignId:string;remoteFileId:string;byteSize:number;
}):void {
  if(file.trashed===true||file.id!==clip.remoteFileId||
    file.size!==String(clip.byteSize)||file.mimeType!=="audio/wav"||
    file.appProperties?.tweAudioAssetId!==clip.assetId||
    file.appProperties?.tweCampaignId!==clip.campaignId)
    throw new Error("Drive metadata does not match the verified GM audio upload.");
}
export async function boundedGeminiDownload(response:Response,
  maxBytes=GEMINI_BACKGROUND_MAX_CLIP_BYTES):Promise<Uint8Array<ArrayBuffer>> {
  if(response.status!==200||!response.body||response.redirected)
    throw new Error("Private audio download failed.");
  if(!Number.isSafeInteger(maxBytes)||maxBytes<128||
    maxBytes>GEMINI_BACKGROUND_MAX_CLIP_BYTES)
    throw new Error("Invalid download byte limit.");
  const declared=response.headers.get("content-length");
  if(declared&&(!/^\d+$/u.test(declared)||Number(declared)>maxBytes))
    throw new Error("Download exceeds safe byte limit.");
  const reader=response.body.getReader();
  const chunks:Uint8Array[]=[];let count=0;
  try {
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      count+=value.byteLength;
      if(count>maxBytes)throw new Error("Downloaded bytes exceeded clip limit.");
      chunks.push(value);
    }
  } catch(error) {
    await reader.cancel().catch(()=>{});
    throw error;
  } finally {reader.releaseLock();}
  if(count<128)throw new Error("Audio file is too small.");
  const data=new Uint8Array(new ArrayBuffer(count));
  let offset=0;
  for(const part of chunks){data.set(part,offset);offset+=part.byteLength;}
  return data;
}
export async function verifyGeminiSpeechWav(bytes:Uint8Array<ArrayBuffer>,
  expected:{size:number;digest:string;durationMs:number}):Promise<number> {
  if(bytes.byteLength!==expected.size||bytes.byteLength>GEMINI_BACKGROUND_MAX_CLIP_BYTES||
    !UUID.test(expected.digest))
    throw new Error("Staged audio size or source digest is invalid.");
  const header=parsePcmWavHeader(bytes.subarray(0,Math.min(bytes.byteLength,256*1024)),
    bytes.byteLength);
  if(header.channels!==1||header.sampleRate!==16000||header.bitsPerSample!==16||
    header.blockAlign!==2||header.dataOffset+header.dataBytes>bytes.byteLength)
    throw new Error("Staged speech audio is not independent mono 16 kHz PCM WAV.");
  const actualDuration=Math.round(header.dataBytes/header.blockAlign/header.sampleRate*1000);
  if(actualDuration<1000||actualDuration>GEMINI_BACKGROUND_MAX_CLIP_MS||
    Math.abs(actualDuration-expected.durationMs)>10)
    throw new Error("Staged clip duration no longer matches the session timeline.");
  const sha=await crypto.subtle.digest("SHA-256",bytes);
  const hash=Array.from(new Uint8Array(sha),b=>b.toString(16).padStart(2,"0")).join("");
  if(hash!==expected.digest)throw new Error("GM-owned Drive clip checksum mismatch.");
  return actualDuration;
}
