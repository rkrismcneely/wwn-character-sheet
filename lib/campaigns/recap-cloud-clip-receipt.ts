/** Shared receipt formula for cloud transcription clips. Keep byte-for-byte compatibility
 * with receipts already stored in saved transcripts; changing the order would re-spend quota.
 */
async function digestHex(data:BufferSource):Promise<string>{
  const bytes=new Uint8Array(await crypto.subtle.digest("SHA-256",data));
  return Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
}
export async function recapCloudClipReceipt(
  fileBytes:ArrayBuffer,
  provider:"groq"|"gemini",
  info:{startMs:number;durationMs:number;speakerId:string;model:string},
):Promise<string>{
  const audioHash=await digestHex(fileBytes);
  const fields=provider==="gemini"
    ? ["gemini",audioHash,info.startMs,info.durationMs,info.speakerId,info.model]
    : [audioHash,info.startMs,info.durationMs,info.model,info.speakerId];
  return digestHex(new TextEncoder().encode(fields.join(":")));
}
