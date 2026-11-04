/** Transfer the already-prepared clip in small chunks to the owner's
 * temporary private TWE R2 staging area, then request exactly one provider
 * interaction. No audio is transcoded or uploaded to Drive again.
 */
import {readRecapClipSubmitResponse,type RecapClipSubmitResult} from "./recap-transcript-response";

const CHUNK_BYTES=512*1024;
export async function submitStagedCloudClip(options:{
  endpoint:string;recapId:string;receipt:string;file:File;
  filename:string;mimeType:string;startMs:number;durationMs:number;
  speakerId:string;model:string;apiKey:string;provider:"gemini"|"groq";
  onProgress?:(completedBytes:number,totalBytes:number,stage:"transfer"|"provider")=>void;
}):Promise<RecapClipSubmitResult>{
  const {endpoint,recapId,receipt,file}=options;
  const chunks=Math.ceil(file.size/CHUNK_BYTES);
  if(chunks<1||chunks>40)throw Error("Prepared audio has too many transfer chunks.");
  for(let i=0;i<chunks;i++){
    const start=i*CHUNK_BYTES;
    const section=file.slice(start,Math.min(start+CHUNK_BYTES,file.size));
    const url=endpoint+"?operation=chunk&recapId="+encodeURIComponent(recapId)+
      "&receipt="+encodeURIComponent(receipt)+"&index="+i+"&total="+chunks;
    const response=await fetch(url,{
      method:"POST",
      headers:{"content-type":"application/octet-stream"},
      body:section,
    });
    if(!response.ok){
      if(response.status===413)throw Error("The server rejected a 512 KiB audio transfer chunk (HTTP 413)."+
        " No Gemini or Groq request was started. Prepared files remain saved.");
      let message="HTTP "+response.status;
      try{
        const result=await response.json() as {error?:string};
        if(typeof result.error==="string")message=result.error;
      }catch{/* A proxy may respond with non-JSON. */}
      throw Error("Could not transfer section chunk "+(i+1)+" of "+chunks+": "+message+
        ". No Gemini or Groq request was started.");
    }
    options.onProgress?.(Math.min(start+section.size,file.size),file.size,"transfer");
  }
  options.onProgress?.(file.size,file.size,"provider");
  // The personal provider key, when supplied, is sent only with this final
  // small JSON request. The worker reconstructs the exact original bytes and
  // verifies the receipt before any external AI request.
  const body={
    recapId,receipt,chunks,byteSize:file.size,
    filename:options.filename,mimeType:options.mimeType,
    startMs:options.startMs,durationMs:options.durationMs,
    speakerId:options.speakerId,model:options.model,
    approvedShare:true,approvedBilling:true,
    ...(options.apiKey.trim()?{apiKey:options.apiKey.trim()}:{})
  };
  const response=await fetch(endpoint+"?operation=finalize",{
    method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify(body),
  });
  return readRecapClipSubmitResponse(response,1);
}
