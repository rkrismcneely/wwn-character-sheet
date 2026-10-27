import {getSessionActor} from "@/lib/auth-session";
import {getCampaignD1} from "@/lib/campaigns/service";
import {campaignErrorResponse} from "@/lib/campaigns/http";
import {listPreparedEncounters,savePreparedEncounter,deletePreparedEncounter} from "@/lib/campaigns/prepared-encounters";
import {readBoundedJson,RequestBodyError} from "@/lib/http-json";
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,context:Context){
 try{const actor=await getSessionActor(request);if(!actor)return Response.json({error:"Sign in is required."},{status:401});const {id}=await context.params;return Response.json({encounters:await listPreparedEncounters(await getCampaignD1(),actor,id)});}
 catch(error){return campaignErrorResponse(error,"Could not load prepared encounters.");}
}
export async function POST(request:Request,context:Context){
 try{const actor=await getSessionActor(request);if(!actor)return Response.json({error:"Sign in is required."},{status:401});const {id}=await context.params;const body=await readBoundedJson(request,8192) as {id?:unknown;name?:unknown;entries?:unknown};return Response.json({encounter:await savePreparedEncounter(await getCampaignD1(),actor,id,body)});}
 catch(error){if(error instanceof RequestBodyError)return Response.json({error:error.message},{status:error.status});return campaignErrorResponse(error,"Could not save prepared encounter.");}
}
export async function DELETE(request:Request,context:Context){
 try{const actor=await getSessionActor(request);if(!actor)return Response.json({error:"Sign in is required."},{status:401});const {id}=await context.params;const body=await readBoundedJson(request,1024) as {id?:unknown};if(typeof body.id!=="string")return Response.json({error:"Encounter ID is required."},{status:422});await deletePreparedEncounter(await getCampaignD1(),actor,id,body.id);return Response.json({ok:true});}
 catch(error){if(error instanceof RequestBodyError)return Response.json({error:error.message},{status:error.status});return campaignErrorResponse(error,"Could not delete prepared encounter.");}
}
