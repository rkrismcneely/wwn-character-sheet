import { env } from "cloudflare:workers";
import { getSessionActor } from "@/lib/auth-session";
import { campaignErrorResponse } from "@/lib/campaigns/http";
import { getCraigRecordingForDownloadJob } from "@/lib/campaigns/recap-imports";
import { getCampaignD1 } from "@/lib/campaigns/service";
import { MAX_GROQ_AUDIO_BYTES } from "@/lib/campaigns/recap-groq-audio";
import { sniffCraigGroqFormat } from "@/lib/campaigns/recap-craig-groq-format";

type Context={params:Promise<{id:string}>};
type AssignmentStore={version:1;assignments:{index:number;displayName:string;discordName:string}[]};
const privateHeaders={"cache-control":"private, no-store","x-content-type-options":"nosniff"};
/**
 * Read a short, already-extracted Craig speaker track into the GM's browser.
 * TWE never reveals Craig's recording key or exposes public storage objects.
 * The GM then submits the file with their own key via the existing Groq route.
 * Long encoded recordings are intentionally NOT byte-sliced.
 */
export async function GET(request:Request,context:Context):Promise<Response> {
  try {
    const actor=await getSessionActor(request);
    if(!actor)return Response.json({error:"Sign in required."},{status:401,headers:privateHeaders});
    const {id}=await context.params;
    const params=new URL(request.url).searchParams;
    const importId=params.get("importId");
    const rawIndex=params.get("entryIndex");
    if(!rawIndex||!/^(?:0|[1-9]\d{0,2})$/u.test(rawIndex)||Number(rawIndex)>127)
      return Response.json({error:"Select a valid Craig track."},{status:422,headers:privateHeaders});
    const db=await getCampaignD1();
    // Same ready-state and GM authorization as the private Craig archive.
    await getCraigRecordingForDownloadJob(db,actor,id,importId);
    const row=await db.prepare("SELECT campaign_id AS campaignId FROM campaign_recap_recording_imports "+
      "WHERE id=? AND source_type='craig'").bind(importId)
      .first<{campaignId:string}>();
    if(!row)return Response.json({error:"Craig recording not found."},{status:404,headers:privateHeaders});
    const prefix=row.campaignId+"/"+importId;
    const assignmentObject=await env.BUCKET.get("recap-track-speakers/"+prefix);
    if(!assignmentObject)
      return Response.json({error:"Confirm and save Craig track speakers first."},{status:409,headers:privateHeaders});
    const snapshot=await assignmentObject.json<AssignmentStore>();
    const index=Number(rawIndex);
    const assignment=snapshot.version===1&&Array.isArray(snapshot.assignments)?
      snapshot.assignments.find(part=>part.index===index):undefined;
    if(!assignment||!assignment.discordName||!assignment.displayName)
      return Response.json({error:"This Craig track does not have a confirmed speaker."},
        {status:409,headers:privateHeaders});
    const key="recap-tracks/"+prefix+"/"+index;
    const head=await env.BUCKET.head(key);
    if(!head)return Response.json({error:"Extract this Craig track first."},{status:404,headers:privateHeaders});
    if(head.size<128||head.size>MAX_GROQ_AUDIO_BYTES)
      return Response.json({error:"This track exceeds the 16 MB Groq import limit. Long Craig tracks need audio-aware splitting."},
        {status:413,headers:privateHeaders});
    const originalName=head.customMetadata?.filename??"";
    const header=await env.BUCKET.get(key,{range:{offset:0,length:32}});
    if(!header)return Response.json({error:"Craig audio header unavailable."},
      {status:404,headers:privateHeaders});
    const format=sniffCraigGroqFormat(originalName,head.httpMetadata?.contentType??null,
      new Uint8Array(await header.arrayBuffer()));
    if(!format)
      return Response.json({error:"Choose genuine FLAC or MPEG-4 AAC audio. Raw AAC or incorrectly labelled audio is unsupported."},
        {status:415,headers:privateHeaders});
    const asset=await env.BUCKET.get(key);
    if(!asset?.body)return Response.json({error:"Craig track could not be read."},{status:404,headers:privateHeaders});
    return new Response(asset.body,{status:200,headers:{
      ...privateHeaders,
      "content-type":format.mimeType,
      "content-length":String(head.size),
      "content-disposition":'attachment; filename="craig-track-'+index+'.'+format.extension+'"',
      "x-recap-speaker-label":encodeURIComponent(assignment.displayName.slice(0,80)),
    }});
  }catch(error){return campaignErrorResponse(error,"Craig audio unavailable.");}
}
