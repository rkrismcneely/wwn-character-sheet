import {env} from "cloudflare:workers";
import {getSessionActor} from "@/lib/auth-session";
import {CANONICAL_ORIGIN} from "@/lib/auth-constants";
import {getCampaignD1} from "@/lib/campaigns/service";
import {campaignErrorResponse} from "@/lib/campaigns/http";
import {createDropboxState,dropboxAuthorizationUrl,dropboxCookie,newDropboxState,
  type DropboxSettings} from "@/lib/account/recap-dropbox-oauth";
export async function GET(request:Request):Promise<Response>{
  try{
    if(new URL(request.url).origin!==CANONICAL_ORIGIN)
      return Response.json({error:"Connect Dropbox from the production site."},{status:403});
    const actor=await getSessionActor(request);
    if(!actor)return Response.redirect(CANONICAL_ORIGIN+"/account",303);
    const state=newDropboxState();
    // Configuration must pass before writing any pending OAuth state.
    const url=dropboxAuthorizationUrl(env as unknown as DropboxSettings,state);
    await createDropboxState(await getCampaignD1(),actor.userId,state);
    return new Response(null,{status:302,headers:{location:url,
      "set-cookie":dropboxCookie(state),"cache-control":"private, no-store",
      "referrer-policy":"no-referrer"}});
  }catch(error){return campaignErrorResponse(error,"Dropbox authorization is unavailable.");}
}