/**
 * Read a GM-authorized original audio stream with real byte-level progress.
 * Use the verified saved asset size, not a sometimes-missing Content-Length.
 * Reject truncated or unexpectedly oversized responses before using the audio.
 */
export async function readRecapAudioWithProgress(
  response:Response,
  expectedBytes:number,
  onProgress?:(receivedBytes:number,totalBytes:number)=>void,
):Promise<Blob>{
  if(!Number.isSafeInteger(expectedBytes)||expectedBytes<=0)
    throw Error("Saved recording does not have a valid file size.");
  if(!response.ok)throw Error("Could not read the original recording.");
  if(!response.body){
    const blob=await response.blob();
    if(blob.size!==expectedBytes)throw Error("Drive returned an incomplete recording.");
    onProgress?.(blob.size,expectedBytes);
    return blob;
  }
  const reader=response.body.getReader();
  const parts:BlobPart[]=[];
  let received=0;
  try{
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      if(!value?.byteLength)continue;
      received+=value.byteLength;
      if(received>expectedBytes)throw Error("Drive returned more audio than the verified recording size.");
      parts.push(new Uint8Array(value));
      onProgress?.(received,expectedBytes);
    }
  }catch(error){
    await reader.cancel().catch(()=>{});
    throw error;
  }finally{
    reader.releaseLock();
  }
  if(received!==expectedBytes)throw Error("Drive returned an incomplete recording.");
  return new Blob(parts);
}
