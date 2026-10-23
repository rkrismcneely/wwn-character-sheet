/** Bound multipart uploads even when the browser omits Content-Length. */
export class JournalUploadTooLargeError extends Error {}

export async function readBoundedJournalForm(request:Request,maxBytes=8_200_000):Promise<FormData>{
 const declared=request.headers.get("content-length");
 if(declared!==null){
  const size=Number(declared);
  if(!Number.isSafeInteger(size)||size<0||size>maxBytes)
   throw new JournalUploadTooLargeError("Upload exceeds size limit.");
 }
 if(!request.body)throw new Error("Missing upload body.");
 const reader=request.body.getReader();
 const chunks:Uint8Array[]=[];let length=0;
 try{
  while(true){
   const {value,done}=await reader.read();
   if(done)break;
   length+=value.byteLength;
   if(length>maxBytes){
    await reader.cancel();
    throw new JournalUploadTooLargeError("Upload exceeds size limit.");
   }
   chunks.push(value);
  }
 }finally{reader.releaseLock();}
 const bytes=new Uint8Array(length);let position=0;
 for(const chunk of chunks){bytes.set(chunk,position);position+=chunk.byteLength;}
 const headers=new Headers();
 const contentType=request.headers.get("content-type");
 if(contentType)headers.set("content-type",contentType);
 return new Request(request.url,{method:"POST",headers,body:bytes.buffer as ArrayBuffer}).formData();
}
