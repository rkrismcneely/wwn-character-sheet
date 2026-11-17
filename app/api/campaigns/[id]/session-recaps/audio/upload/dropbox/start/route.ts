import {env} from "cloudflare:workers";
import {getSessionActor} from "@/lib/auth-session";
import {CANONICAL_ORIGIN} from "@/lib/auth-constants";
import {getCampaignD1} from "@/lib/campaigns/service";
import {campaignErrorResponse} from "@/lib/campaigns/http";
import {readBoundedJson,RequestBodyError} from "@/lib/http-json";
import {beginDropboxAudio} from "@/lib/campaigns/recap-dropbox-audio";
import type {DropboxSettings} from "@/lib/account/recap-dropbox-oauth";
type Context={params:Promise<{id:string}>};
export async function POST(request:Request,context:Context):Promise<Response>{
  try{
    const actor=await getSessionActor(request);
    if(!actor)return Response.json({error:"Sign in required."},{status:401});
    if(request.headers.get("origin")!==CANONICAL_ORIGIN)
      return Response.json({error:"Invalid upload origin."},{status:403});
    const {id}=await context.params;
    const input=await readBoundedJson(request,4096);
    const started=await beginDropboxAudio(await getCampaignD1(),actor,id,input??{},
      env as unknown as DropboxSettings);
    return Response.json(started,{status:201,headers:{"cache-control":"private, no-store"}});
  }catch(e){
    if(e instanceof RequestBodyError)return Response.json({error:e.message},{status:e.status});
    return campaignErrorResponse(e,"Dropbox recording upload could not start.");
  }
}