/** Parse private transcript responses without leaking server HTML/plain text to GMs.
 * A 413 can originate before our JSON API handler is called; never treat it
 * as a provider-quota issue or silently resubmit a possibly charged request.
 */
export type RecapClipSubmitResult={
  saved?:boolean;duplicate?:boolean;error?:string;
};
export async function readRecapClipSubmitResponse(
  response:Response,section:number,
):Promise<RecapClipSubmitResult>{
  let text:string;
  try{text=await response.text();}
  catch{throw Error("Section "+section+": the server response could not be read (HTTP "+
    response.status+"). Verify saved progress before retrying.");}
  let data:RecapClipSubmitResult|null=null;
  if(text.length<=32_000&&text.trim().startsWith("{")){
    try{
      const parsed=JSON.parse(text) as unknown;
      if(parsed&&typeof parsed==="object"&&!Array.isArray(parsed))
        data=parsed as RecapClipSubmitResult;
    }catch{/* A proxy can send plain text or truncated HTML instead of JSON. */}
  }
  if(response.status===413)throw Error(
    "Section "+section+": TWE rejected the prepared audio upload (HTTP 413 Payload Too Large). "+
    "Your prepared sections remain saved; the request did not produce a saved transcript. "+
    "This is an upload limit, not evidence of exhausted Gemini or Groq quota.");
  if(!response.ok)throw Error(
    typeof data?.error==="string"&&data.error.trim()
      ?data.error
      :"Section "+section+": the transcription server returned HTTP "+response.status+
        " instead of a usable result. Check saved progress before retrying.");
  if(!data||data.saved!==true)throw Error(
    typeof data?.error==="string"&&data.error.trim()
      ?data.error
      :"Section "+section+": the transcription response was incomplete. Check saved progress before retrying.");
  return data;
}
