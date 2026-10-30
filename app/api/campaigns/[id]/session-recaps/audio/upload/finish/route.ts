import { env } from "cloudflare:workers";
import { getSessionActor } from "@/lib/auth-session";
import { CANONICAL_ORIGIN } from "@/lib/auth-constants";
import { finishGmDriveAudioUpload } from "@/lib/campaigns/recap-drive-upload-service";
import { campaignErrorResponse } from "@/lib/campaigns/http";
import { getCampaignD1 } from "@/lib/campaigns/service";
import type { DriveSettings } from "@/lib/account/recap-google-drive-oauth";
import { readBoundedJson, RequestBodyError } from "@/lib/http-json";

type Context={params:Promise<{id:string}>};

/** Verify a newly completed Google file belongs to the GM's requested asset. */
export async function POST(request:Request,context:Context):Promise<Response> {
  try {
    const actor=await getSessionActor(request);
    if(!actor)return Response.json({error:"Sign in required."},{status:401});
    if(request.headers.get("origin")!==CANONICAL_ORIGIN) {
      return Response.json({error:"Invalid request origin."},{status:403});
    }
    const {id}=await context.params;
    const body=await readBoundedJson(request,2048) as {assetId?:unknown;remoteFileId?:unknown};
    const result=await finishGmDriveAudioUpload(await getCampaignD1(),actor,id,body??{},
      env as unknown as DriveSettings);
    return Response.json(result,{headers:{"cache-control":"private, no-store"}});
  }catch(error){
    if(error instanceof RequestBodyError)return Response.json({error:error.message},{status:error.status});
    return campaignErrorResponse(error,"Google Drive upload could not be verified.");
  }
}
