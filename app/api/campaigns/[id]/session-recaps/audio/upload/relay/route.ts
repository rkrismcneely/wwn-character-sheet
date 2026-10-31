import {env} from "cloudflare:workers";
import {getSessionActor} from "@/lib/auth-session";
import {CANONICAL_ORIGIN} from "@/lib/auth-constants";
import {getCampaignD1} from "@/lib/campaigns/service";
import {relayGmDriveAudioUpload} from "@/lib/campaigns/recap-drive-upload-service";
import {campaignErrorResponse} from "@/lib/campaigns/http";
import type {DriveSettings} from "@/lib/account/recap-google-drive-oauth";

type Context={params:Promise<{id:string}>};

/** Same-origin, owner-bound, streaming relay to the exact signed Google upload
 * session. This avoids browser-to-Google cross-origin fetch/preflight failures.
 * The file still belongs to the GM's own Google Drive; no TWE audio storage.
 */
export async function PUT(request:Request,context:Context):Promise<Response>{
  try{
    if(request.headers.get("origin")!==CANONICAL_ORIGIN||
      request.headers.get("sec-fetch-site")==="cross-site")
      return Response.json({error:"Start the upload from your TWE campaign page."},
        {status:403,headers:{"cache-control":"private, no-store"}});
    const actor=await getSessionActor(request);
    if(!actor)return Response.json({error:"Sign in required."},
      {status:401,headers:{"cache-control":"private, no-store"}});
    const {id}=await context.params;
    return await relayGmDriveAudioUpload(await getCampaignD1(),actor,id,request,
      env as unknown as DriveSettings);
  }catch(error){
    return campaignErrorResponse(error,"Recording transfer to Google Drive was interrupted.");
  }
}
