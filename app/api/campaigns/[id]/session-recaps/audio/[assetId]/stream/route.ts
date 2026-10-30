import { env } from "cloudflare:workers";
import { getSessionActor } from "@/lib/auth-session";
import { campaignErrorResponse } from "@/lib/campaigns/http";
import { streamAuthorizedRecapAudio } from "@/lib/campaigns/recap-drive-playback";
import { getCampaignD1 } from "@/lib/campaigns/service";
import type { DriveSettings } from "@/lib/account/recap-google-drive-oauth";

type Context={params:Promise<{id:string;assetId:string}>};

/** Private, Range-capable recording response; no Drive URL or token exposed. */
export async function GET(request:Request,context:Context):Promise<Response> {
  try{
    const actor=await getSessionActor(request);
    if(!actor)return Response.json({error:"Sign in required."},{status:401});
    const {id,assetId}=await context.params;
    return await streamAuthorizedRecapAudio(
      await getCampaignD1(),actor,id,assetId,
      request.headers.get("range"),env as unknown as DriveSettings,request.signal,
    );
  }catch(error){
    if(error instanceof RangeError){
      return Response.json({error:"Invalid audio seek range."},{
        status:416,headers:{"cache-control":"private, no-store"},
      });
    }
    return campaignErrorResponse(error,"Could not stream recording.");
  }
}
