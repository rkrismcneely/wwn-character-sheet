import {env} from "cloudflare:workers";
import {getSessionActor} from "@/lib/auth-session";
import {CANONICAL_ORIGIN} from "@/lib/auth-constants";
import {getCampaignD1} from "@/lib/campaigns/service";
import {recoverGmDriveAudioUpload} from "@/lib/campaigns/recap-drive-upload-service";
import {campaignErrorResponse} from "@/lib/campaigns/http";
import {readBoundedJson,RequestBodyError} from "@/lib/http-json";
import type {DriveSettings} from "@/lib/account/recap-google-drive-oauth";

type Context={params:Promise<{id:string}>};
const noStore={"cache-control":"private, no-store"};

/** Find the GM's already-saved Google file using TWE's private upload marker.
 * Never accept arbitrary file IDs or download/re-upload the recording.
 */
export async function POST(request:Request,context:Context):Promise<Response>{
  try{
    if(request.headers.get("origin")!==CANONICAL_ORIGIN||
      request.headers.get("sec-fetch-site")==="cross-site")
      return Response.json({error:"Open the recovery from your TWE campaign page."},
        {status:403,headers:noStore});
    const actor=await getSessionActor(request);
    if(!actor)return Response.json({error:"Sign in required."},{status:401,headers:noStore});
    const {id}=await context.params;
    const body=await readBoundedJson(request,1024) as {assetId?:unknown;recapId?:unknown};
    const recovered=await recoverGmDriveAudioUpload(await getCampaignD1(),actor,id,body??{},
      env as unknown as DriveSettings);
    return Response.json(recovered,{headers:noStore});
  }catch(error){
    if(error instanceof RequestBodyError)
      return Response.json({error:error.message},{status:error.status,headers:noStore});
    return campaignErrorResponse(error,"Completed recording could not be recovered from Google Drive.");
  }
}
