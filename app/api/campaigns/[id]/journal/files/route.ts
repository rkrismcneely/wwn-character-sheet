import { getSessionActor } from "@/lib/auth-session";
import { getCampaignD1, loadCampaignAccess } from "@/lib/campaigns/service";
import { canManageCampaignContent } from "@/lib/campaigns/authorization";
import { validateJournalFile, verifyJournalFileSignature, journalStorageKey } from "@/lib/campaigns/journal-files";
import { env } from "cloudflare:workers";
import { readBoundedJournalForm, JournalUploadTooLargeError } from "@/lib/campaigns/journal-upload";

export async function POST(request:Request,context:{params:Promise<{id:string}>}){
 const actor=await getSessionActor(request);
 if(!actor)return Response.json({error:"Sign in required."},{status:401});
 const {id}=await context.params;
 const db=await getCampaignD1();
 const access=await loadCampaignAccess(db,actor,id);
 if(!canManageCampaignContent(actor,access.campaign,access.membership))
  return Response.json({error:"Forbidden."},{status:403});
 let form:FormData;
 try{form=await readBoundedJournalForm(request);}catch(error){
  if(error instanceof JournalUploadTooLargeError)return Response.json({error:error.message},{status:413});
  return Response.json({error:"Invalid multipart upload."},{status:422});
 }
 const entryId=form.get("entryId");
 const file=form.get("file");
 if(typeof entryId!=="string"||!(file instanceof File))return Response.json({error:"Missing page or file."},{status:422});
 const page=await db.prepare("SELECT kind FROM campaign_journal_entries WHERE campaign_id=? AND id=?").bind(access.campaign.id,entryId).first<{kind:string}>();
 if(page?.kind!=="page")return Response.json({error:"Page not found."},{status:404});
 try{validateJournalFile(file.name,file.type,file.size);}catch{return Response.json({error:"Invalid file."},{status:422});}
 const bytes=new Uint8Array(await file.arrayBuffer());
 if(!verifyJournalFileSignature(file.type,bytes))return Response.json({error:"File signature mismatch."},{status:422});
 const fileId=crypto.randomUUID(),key=journalStorageKey(access.campaign.id,fileId);
 await env.BUCKET.put(key,bytes,{httpMetadata:{contentType:file.type}});
 try{
  await db.prepare("INSERT INTO campaign_journal_files (id,campaign_id,entry_id,filename,mime_type,byte_size,storage_key,created_at) VALUES (?,?,?,?,?,?,?,?)")
   .bind(fileId,access.campaign.id,entryId,file.name,file.type,file.size,key,new Date().toISOString()).run();
 }catch(error){await env.BUCKET.delete(key);throw error;}
 return Response.json({id:fileId,filename:file.name},{status:201});
}
