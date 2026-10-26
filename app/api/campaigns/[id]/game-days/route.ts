import {getSessionActor} from "@/lib/auth-session";
import {getCampaignD1} from "@/lib/campaigns/service";
import {campaignErrorResponse} from "@/lib/campaigns/http";
import {readCampaignGameDays,setCampaignGameDay} from "@/lib/campaigns/game-days";
import {readBoundedJson,RequestBodyError} from "@/lib/http-json";
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,context:Context){
 try{const actor=await getSessionActor(request);const {id}=await context.params;const month=new URL(request.url).searchParams.get("month")??"";return Response.json(await readCampaignGameDays(await getCampaignD1(),actor,id,month));}
 catch(error){return campaignErrorResponse(error,"Game days could not be loaded.");}
}
export async function PATCH(request:Request,context:Context){
 try{const actor=await getSessionActor(request);const {id}=await context.params;const body=await readBoundedJson(request,1024) as {date?:unknown;gameDay?:unknown};return Response.json(await setCampaignGameDay(await getCampaignD1(),actor,id,body?.date,body?.gameDay));}
 catch(error){if(error instanceof RequestBodyError)return Response.json({error:error.message},{status:error.status});return campaignErrorResponse(error,"Game day could not be saved.");}
}
