import { getSessionActor } from "@/lib/auth-session";
import { getCampaignD1 } from "@/lib/campaigns/service";
import { requireReadableJournalPage } from "@/lib/campaigns/journal";

export async function GET(request:Request,context:{params:Promise<{id:string;fileId:string}>}){
 const actor=await getSessionActor(request);
 if(!actor)return Response.json({error:"Sign in required."},{status:401});
 const {id,fileId}=await context.params;
 const db=await getCampaignD1();
 const file=await db.prepare("SELECT entry_id AS entryId FROM campaign_journal_files WHERE id=?").bind(fileId).first<{entryId:string}>();
 if(!file)return Response.json({error:"Not found."},{status:404});
 await requireReadableJournalPage(db,actor,id,file.entryId);
 return Response.json({error:"Download not enabled."},{status:501});
}
