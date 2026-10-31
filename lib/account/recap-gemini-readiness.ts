/** Read-only checks. A valid key is not proof of sufficient quota. */
export type GeminiRecapReadiness={
  modelAvailable:boolean;
  filesApiReachable:boolean;
  quotaVerified:false;
  warning:string|null;
};
const BASE="https://generativelanguage.googleapis.com/v1beta";
async function responseOk(url:string,key:string,requester:typeof fetch):Promise<boolean>{
  try{
    const response=await requester(url,{
      method:"GET",redirect:"manual",signal:AbortSignal.timeout(12000),
      headers:{"x-goog-api-key":key},
    });
    return response.ok&&!response.redirected;
  }catch{return false;}
}
export async function checkGeminiRecapReadiness(key:string,requester:typeof fetch=fetch):
  Promise<GeminiRecapReadiness>{
  // Both requests only read metadata. Neither uploads audio, submits an
  // interaction nor consumes model generation. Google doesn't disclose active
  // project TPM/RPD headroom through these requests.
  const [modelAvailable,filesApiReachable]=await Promise.all([
    responseOk(BASE+"/models/gemini-3.8-flash",key,requester),
    responseOk(BASE+"/files?pageSize=1",key,requester),
  ]);
  const warning=!modelAvailable
    ?"Gemini 3.8 Flash is not confirmed available to this project. Check its enabled models in AI Studio."
    :!filesApiReachable
      ?"The Gemini Files API could not be verified. Large recordings may not upload successfully."
      :null;
  return {modelAvailable,filesApiReachable,quotaVerified:false,warning};
}
