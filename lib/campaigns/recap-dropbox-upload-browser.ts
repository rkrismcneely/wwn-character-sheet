/** Browser-to-TWE bounded Dropbox upload. Dropbox OAuth credentials never reach the browser. */
export async function uploadRecordingToDropbox(file:Blob,
  endpoint:string,session:{assetId:string;sessionId:string;chunkBytes:number},
  progress:(sent:number,total:number)=>void,signal?:AbortSignal):Promise<void>{
  if(!file.size||!session.assetId||!session.sessionId||session.chunkBytes<1)
    throw Error("Invalid Dropbox upload session.");
  let offset=0;
  while(offset<file.size){
    if(signal?.aborted)throw Error("Upload cancelled.");
    const length=Math.min(session.chunkBytes,file.size-offset);
    let response:Response;
    try{
      response=await fetch(endpoint+"?assetId="+encodeURIComponent(session.assetId),{
        method:"POST",credentials:"same-origin",headers:{
          "x-twe-dropbox-session":session.sessionId,
          "x-twe-dropbox-offset":String(offset),
          "x-twe-dropbox-length":String(length),
          "content-type":"application/octet-stream",
        },body:file.slice(offset,offset+length),signal,
      });
    }catch{
      throw Error("Dropbox transfer interrupted. A chunk may have reached Dropbox. "+
        "Use Find saved recording if the upload was completed; otherwise start a fresh upload.");
    }
    const result=await response.json() as {receivedBytes?:number;ready?:boolean;error?:string};
    if(!response.ok)throw Error(result.error||"Dropbox did not accept this recording chunk.");
    if(result.receivedBytes!==offset+length)
      throw Error("Dropbox returned an unexpected upload offset.");
    offset=result.receivedBytes;
    progress(offset,file.size);
    if(result.ready!== (offset===file.size))
      throw Error("Dropbox did not confirm recording completion.");
  }
}
