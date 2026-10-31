import { getSessionActor } from "@/lib/auth-session";
import { CANONICAL_ORIGIN } from "@/lib/auth-constants";
import { getCampaignD1 } from "@/lib/campaigns/service";
import { readBoundedJson,RequestBodyError } from "@/lib/http-json";
const noStore={"cache-control":"private, no-store"};
type Detail="brief"|"standard"|"detailed";
type Row={autoEnabled:number;billingApproved:number;detail:Detail;consentAt:string|null};
const fallback={autoEnabled:false,billingApproved:false,detail:"detailed" as Detail,consentAt:null};
async function read(db:D1Database,userId:string){
  const row=await db.prepare("SELECT auto_enabled AS autoEnabled,billing_approved AS billingApproved,"+
    "detail,consent_at AS consentAt FROM user_recap_auto_preferences WHERE user_id=?")
    .bind(userId).first<Row>();
  return row?{autoEnabled:row.autoEnabled===1,billingApproved:row.billingApproved===1,
    detail:row.detail,consentAt:row.consentAt}:fallback;
}
export async function GET(request:Request){
  try{
    const actor=await getSessionActor(request);
    if(!actor)return Response.json({error:"Sign in required."},{status:401,headers:noStore});
    return Response.json(await read(await getCampaignD1(),actor.userId),{headers:noStore});
  }catch{return Response.json({error:"Recap preferences unavailable."},{status:503,headers:noStore});}
}
export async function PUT(request:Request){
  if(request.headers.get("origin")!==CANONICAL_ORIGIN||request.headers.get("sec-fetch-site")==="cross-site")
    return Response.json({error:"Open Account to change recap settings."},{status:403,headers:noStore});
  const actor=await getSessionActor(request);
  if(!actor)return Response.json({error:"Sign in required."},{status:401,headers:noStore});
  try{
    const body=await readBoundedJson(request,1024) as {
      autoEnabled?:unknown;billingApproved?:unknown;detail?:unknown;privacyApproved?:unknown;
    };
    if(typeof body.autoEnabled!=="boolean"||typeof body.billingApproved!=="boolean"||
      !["brief","standard","detailed"].includes(String(body.detail))||
      (body.autoEnabled&&(body.billingApproved!==true||body.privacyApproved!==true))){
      return Response.json({error:"Choose recap detail and explicitly approve sharing audio, campaign context and possible Gemini charges."},
        {status:422,headers:noStore});
    }
    const db=await getCampaignD1();
    if(body.autoEnabled){
      const [drive,ai]=await Promise.all([
        db.prepare("SELECT 1 AS ok FROM user_recap_storage_connections WHERE user_id=? AND provider='google-drive' AND status='connected' LIMIT 1")
          .bind(actor.userId).first(),
        db.prepare("SELECT 1 AS ok FROM user_recap_ai_connections WHERE user_id=? AND provider='gemini' AND status='connected' LIMIT 1")
          .bind(actor.userId).first(),
      ]);
      if(!drive||!ai)return Response.json({error:"Connect Google Drive and Gemini before enabling automatic recaps."},
        {status:409,headers:noStore});
    }
    const now=new Date().toISOString();
    const consent=body.autoEnabled?now:null;
    await db.prepare("INSERT INTO user_recap_auto_preferences "+
      "(user_id,auto_enabled,billing_approved,detail,consent_at,updated_at) VALUES (?,?,?,?,?,?) "+
      "ON CONFLICT(user_id) DO UPDATE SET auto_enabled=excluded.auto_enabled,"+
      "billing_approved=excluded.billing_approved,detail=excluded.detail,"+
      "consent_at=excluded.consent_at,updated_at=excluded.updated_at")
      .bind(actor.userId,body.autoEnabled?1:0,body.autoEnabled?1:0,body.detail,consent,now).run();
    return Response.json(await read(db,actor.userId),{headers:noStore});
  }catch(e){
    if(e instanceof RequestBodyError)return Response.json({error:e.message},{status:e.status,headers:noStore});
    return Response.json({error:"Could not save recap preferences."},{status:503,headers:noStore});
  }
}
