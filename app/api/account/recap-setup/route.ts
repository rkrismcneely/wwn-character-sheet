import { env } from "cloudflare:workers";
import { getSessionActor } from "@/lib/auth-session";
import { driveConfiguration,type DriveSettings } from "@/lib/account/recap-google-drive-oauth";
import { recapAIEncryptionReady,type RecapAIEncryptionSettings } from "@/lib/account/recap-gemini-key";
import { getCampaignD1 } from "@/lib/campaigns/service";

const noStore={"cache-control":"private, no-store"};

/** Redacted, user-scoped setup state. Never expose tokens or provider credentials. */
export async function GET(request:Request):Promise<Response>{
  try{
    const actor=await getSessionActor(request);
    if(!actor)return Response.json({error:"Sign in required."},{status:401,headers:noStore});
    const db=await getCampaignD1();
    const config=env as unknown as DriveSettings&RecapAIEncryptionSettings;
    const [drive,gemini,prefs]=await Promise.all([
      db.prepare("SELECT COUNT(*) AS count FROM user_recap_storage_connections "+
        "WHERE user_id=? AND provider='google-drive' AND status='connected'")
        .bind(actor.userId).first<{count:number}>(),
      db.prepare("SELECT COUNT(*) AS count FROM user_recap_ai_connections "+
        "WHERE user_id=? AND provider='gemini' AND status='connected'")
        .bind(actor.userId).first<{count:number}>(),
      db.prepare("SELECT auto_enabled AS autoEnabled,billing_approved AS billingApproved,"+
        "consent_at AS consentAt FROM user_recap_auto_preferences WHERE user_id=?")
        .bind(actor.userId).first<{autoEnabled:number;billingApproved:number;consentAt:string|null}>(),
    ]);
    const storageAvailable=driveConfiguration(config);
    const aiAvailable=recapAIEncryptionReady(config);
    const storageConnected=storageAvailable&&Number(drive?.count??0)>0;
    const aiConnected=aiAvailable&&Number(gemini?.count??0)>0;
    const automationEnabled=prefs?.autoEnabled===1&&prefs?.billingApproved===1&&Boolean(prefs.consentAt);
    return Response.json({storageAvailable,storageConnected,aiAvailable,aiConnected,automationEnabled,
      ready:storageConnected&&aiConnected&&automationEnabled},{headers:noStore});
  }catch{
    return Response.json({error:"Recap account setup could not be checked. Try again after reloading."},
      {status:503,headers:noStore});
  }
}
