import {env} from "cloudflare:workers";
import {getSessionActor} from "@/lib/auth-session";
import {getCampaignD1} from "@/lib/campaigns/service";
import {dropboxConfigured,type DropboxSettings} from "@/lib/account/recap-dropbox-oauth";

export async function GET(request:Request):Promise<Response>{
  const actor=await getSessionActor(request);
  if(!actor)return Response.json({error:"Sign in required."},{status:401});
  const db=await getCampaignD1();
  const rows=await db.prepare("SELECT id,provider,display_name AS displayName,status,connected_at AS connectedAt "+
    "FROM user_recap_storage_connections WHERE user_id=? AND provider='dropbox' ORDER BY created_at DESC LIMIT 20")
    .bind(actor.userId).all();
  return Response.json({available:dropboxConfigured(env as unknown as DropboxSettings),
    connections:rows.results},{headers:{"cache-control":"private, no-store"}});
}