import {getSessionActor} from "@/lib/auth-session";
import {getCampaignD1} from "@/lib/campaigns/service";
import {campaignErrorResponse} from "@/lib/campaigns/http";
import {readCampaignAvailability,setCampaignAvailability} from "@/lib/campaigns/availability";
import {readBoundedJson,RequestBodyError} from "@/lib/http-json";
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,context:Context){
 try{const actor=await getSessionActor(request);const {id}=await context.params;const month=new URL(request.url).searchParams.get("month")??"";return Response.json(await readCampaignAvailability(await getCampaignD1(),actor,id,month));}
 catch(error){return campaignErrorResponse(error,"Availability could not be loaded.");}
}
export async function PATCH(request:Request,context:Context){
 try{const actor=await getSessionActor(request);const {id}=await context.params;const body=await readBoundedJson(request,1024) as {date:string;status:"yes"|"maybe"|"no"|null};return Response.json(await setCampaignAvailability(await getCampaignD1(),actor,id,body?.date,body?.status));}
 catch(error){if(error instanceof RequestBodyError)return Response.json({error:error.message},{status:error.status});return campaignErrorResponse(error,"Availability could not be saved.");}
}
