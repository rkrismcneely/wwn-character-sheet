import { env } from "cloudflare:workers";
import { getSessionActor } from "@/lib/auth-session";
import { driveConfiguration,type DriveSettings } from "@/lib/account/recap-google-drive-oauth";
import {dropboxConfigured,type DropboxSettings} from "@/lib/account/recap-dropbox-oauth";
import { recapAIEncryptionReady,type RecapAIEncryptionSettings } from "@/lib/account/recap-gemini-key";
import { getCampaignD1 } from "@/lib/campaigns/service";

const noStore={"cache-control":"private, no-store"};

/** Redacted, user-scoped setup state. Never expose tokens or provider credentials. */
export async function GET(request:Request):Promise<Response>{
  try{
    const actor=await getSessionActor(request);
    if(!actor)return Response.json({error:"Sign in required."},{status:401,headers:noStore});
    const db=await getCampaignD1();
    const config=env as unknown as DriveSettings&DropboxSettings&RecapAIEncryptionSettings;
    const [drive,dropbox,gemini]=await Promise.all([
      db.prepare("SELECT COUNT(*) AS count FROM user_recap_storage_connections "+
        "WHERE user_id=? AND provider='google-drive' AND status='connected'")
        .bind(actor.userId).first<{count:number}>(),
      db.prepare("SELECT COUNT(*) AS count FROM user_recap_storage_connections "+
        "WHERE user_id=? AND provider='dropbox' AND status='connected'")
        .bind(actor.userId).first<{count:number}>(),
      db.prepare("SELECT COUNT(*) AS count FROM user_recap_ai_connections "+
        "WHERE user_id=? AND provider='gemini' AND status='connected'")
        .bind(actor.userId).first<{count:number}>(),
    ]);
    const storageAvailable=driveConfiguration(config)||dropboxConfigured(config);
    const aiAvailable=recapAIEncryptionReady(config);
    const storageConnected=(driveConfiguration(config)&&Number(drive?.count??0)>0)||
      (dropboxConfigured(config)&&Number(dropbox?.count??0)>0);
    const aiConnected=aiAvailable&&Number(gemini?.count??0)>0;
    // Either GM-owned storage provider is sufficient for audio; AI keys are independent.
    // Per-recording permission is granted in a confirmation dialog, not Account.
    return Response.json({storageAvailable,storageConnected,aiAvailable,aiConnected,
      ready:storageConnected},{headers:noStore});
  }catch{
    return Response.json({error:"Recap account setup could not be checked. Try again after reloading."},
      {status:503,headers:noStore});
  }
}
