import { env } from "cloudflare:workers";
import { getSessionActor } from "@/lib/auth-session";
import { campaignErrorResponse } from "@/lib/campaigns/http";
import { getCraigRecordingForDownloadJob } from "@/lib/campaigns/recap-imports";
import { getCampaignD1 } from "@/lib/campaigns/service";
import {
  CRAIG_RANGE_MAX_SOURCE_BYTES,CRAIG_RANGE_WINDOW_BYTES,
  parseCraigRequestedRange,craigRangeHeaders,validateCraigRangeMime,
} from "@/lib/campaigns/recap-craig-audio-ranges";

type Context={params:Promise<{id:string}>};
type AssignmentStore={version:1;assignments:{index:number;discordName:string;displayName:string}[]};
const headers={"cache-control":"private, no-store","x-content-type-options":"nosniff",
  "cross-origin-resource-policy":"same-origin"};
function fail(message:string,status:number):Response{
  return Response.json({error:message},{status,headers});
}
async function locate(request:Request,context:Context){
  const actor=await getSessionActor(request);
  if(!actor)throw new Error("AUTH_REQUIRED");
  const {id}=await context.params;
  const qs=new URL(request.url).searchParams;
  const importId=qs.get("importId"),entryIndex=qs.get("entryIndex");
  if(!entryIndex||!/^(?:0|[1-9][0-9]{0,2})$/u.test(entryIndex)||Number(entryIndex)>127)
    throw new Error("TRACK_INVALID");
  const db=await getCampaignD1();
  await getCraigRecordingForDownloadJob(db,actor,id,importId);
  const row=await db.prepare("SELECT campaign_id AS campaignId "+
    "FROM campaign_recap_recording_imports "+
    "WHERE id=? AND source_type='craig'").bind(importId).first<{campaignId:string}>();
  if(!row)throw new Error("TRACK_MISSING");
  const prefix=row.campaignId+"/"+importId;
  const speakerObj=await env.BUCKET.get("recap-track-speakers/"+prefix);
  if(!speakerObj)throw new Error("TRACK_UNCONFIRMED");
  const speakers=await speakerObj.json<AssignmentStore>();
  if(speakers.version!==1||!Array.isArray(speakers.assignments)||
    !speakers.assignments.some(item=>item.index===Number(entryIndex)&&
      typeof item.discordName==="string"&&item.discordName.length>0&&
      typeof item.displayName==="string"&&item.displayName.length>0))
    throw new Error("TRACK_UNCONFIRMED");
  const key="recap-tracks/"+prefix+"/"+entryIndex;
  const head=await env.BUCKET.head(key);
  if(!head)throw new Error("TRACK_MISSING");
  if(head.size<128||head.size>CRAIG_RANGE_MAX_SOURCE_BYTES)
    throw new Error("TRACK_OVERSIZED");
  let mime:"audio/flac"|"audio/mp4";
  try{mime=validateCraigRangeMime(
    head.customMetadata?.filename??"",head.httpMetadata?.contentType??null);
  }catch{throw new Error("TRACK_FORMAT");}
  return {key,head,mime};
}
function handleError(e:unknown){
  if(e instanceof Error){
    if(e.message==="AUTH_REQUIRED")return fail("Sign in to read this Craig recording.",401);
    if(e.message==="TRACK_INVALID")return fail("Choose a valid Craig speaker track.",422);
    if(e.message==="TRACK_UNCONFIRMED")return fail("Confirm Craig speaker assignments before reading audio.",409);
    if(e.message==="TRACK_MISSING")return fail("The Craig track no longer exists.",404);
    if(e.message==="TRACK_OVERSIZED")return fail("Source exceeds the 256 MiB bounded streaming limit.",413);
    if(e.message==="TRACK_FORMAT")return fail("Only verified Craig FLAC or MPEG-4 AAC is supported.",415);
  }
  return campaignErrorResponse(e,"Craig recording range unavailable.");
}
/** Exposes only metadata, not Craig keys, Drive OAuth tokens or source locations. */
export async function HEAD(request:Request,context:Context):Promise<Response>{
  try{
    const {head,mime}=await locate(request,context);
    return new Response(null,{status:200,headers:{
      ...headers,"content-length":String(head.size),"accept-ranges":"bytes",
      "content-type":mime,"etag":head.httpEtag,
      "x-twe-max-range-bytes":String(CRAIG_RANGE_WINDOW_BYTES),
    }});
  }catch(e){return handleError(e);}
}
/** A single 1 MiB authenticated R2 range per request, never a whole file. */
export async function GET(request:Request,context:Context):Promise<Response>{
  try{
    if(request.headers.get("sec-fetch-site")==="cross-site")
      return fail("Cross-site audio requests are not allowed.",403);
    const {key,head,mime}=await locate(request,context);
    const ifMatch=request.headers.get("if-match");
    if(!ifMatch||ifMatch!==head.httpEtag)
      return fail("Craig recording changed. Recheck the source metadata before reading audio.",412);
    let part;
    try{part=parseCraigRequestedRange(request.headers.get("range"),head.size);}
    catch(e){return fail(e instanceof Error?e.message:"Invalid byte range.",416);}
    const object=await env.BUCKET.get(key,{range:{offset:part.start,length:part.length}});
    if(!object||!("body" in object)||!object.body)
      return fail("Craig audio byte range is unavailable.",409);
    if(object.etag!==head.etag||
      object.range?.offset!==part.start||
      object.range?.length!==part.length)
      return fail("The source file changed during download.",409);
    return new Response(object.body,{status:206,headers:{
      ...craigRangeHeaders(part,head.httpEtag,mime),
      "x-twe-max-range-bytes":String(CRAIG_RANGE_WINDOW_BYTES),
    }});
  }catch(e){return handleError(e);}
}
