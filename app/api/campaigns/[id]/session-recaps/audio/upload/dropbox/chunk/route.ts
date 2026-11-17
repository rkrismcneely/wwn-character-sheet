import {env} from "cloudflare:workers";
import {getSessionActor} from "@/lib/auth-session";
import {CANONICAL_ORIGIN} from "@/lib/auth-constants";
import {getCampaignD1} from "@/lib/campaigns/service";
import {campaignErrorResponse} from "@/lib/campaigns/http";
import {appendDropboxAudio} from "@/lib/campaigns/recap-dropbox-audio";
import type {DropboxSettings} from "@/lib/account/recap-dropbox-oauth";
type Context={params:Promise<{id:string}>};
export async function POST(request:Request,context:Context):Promise<Response>{
  try{
    if(request.headers.get("origin")!==CANONICAL_ORIGIN||
       request.headers.get("sec-fetch-site")==="cross-site")
      return Response.json({error:"Invalid upload origin."},{status:403});
    const actor=await getSessionActor(request);
    if(!actor)return Response.json({error:"Sign in required."},{status:401});
    const {id}=await context.params;
    const state=await appendDropboxAudio(await getCampaignD1(),actor,id,request,
      env as unknown as DropboxSettings);
    return Response.json(state,{headers:{"cache-control":"private, no-store"}});
  }catch(e){return campaignErrorResponse(e,"Dropbox recording transfer was interrupted.");}
}