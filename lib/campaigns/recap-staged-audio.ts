/**
 * Private, short-lived staging of prepared recap audio in small request bodies.
 * The browser never sends more than 512 KiB at a time; the final step assembles
 * the original prepared clip for exactly one explicit provider invocation.
 * No AI operation occurs while individual chunks are being uploaded.
 */
import {getSessionActor} from "@/lib/auth-session";
import {canManageCampaignContent} from "@/lib/campaigns/authorization";
import {getCampaignSessionRecap} from "@/lib/campaigns/session-recaps";
import {getCampaignD1,loadCampaignAccess,requireActiveCampaign,
  CampaignServiceError} from "@/lib/campaigns/service";
import {recapCloudClipReceipt} from "@/lib/campaigns/recap-cloud-clip-receipt";
import {GEMINI_TRANSCRIBE_MODEL} from "@/lib/campaigns/recap-gemini-transcribe";
import {readBoundedJson} from "@/lib/http-json";
import {handleGeminiRequest} from "@/app/api/campaigns/[id]/session-recaps/transcript/gemini/route";
import {handleGroqRequest} from "@/app/api/campaigns/[id]/session-recaps/transcript/transcribe/route";

const MAX_CHUNK=512*1024;
const MAX_CHUNKS=40;
const MAX_TOTAL=16*1024*1024;
const HEADERS={"cache-control":"private, no-store"};
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu;
const RECEIPT=/^[a-f0-9]{64}$/u;
const reply=(error:string,status:number)=>Response.json({error},{status,headers:HEADERS});
export function stagedRecapAudioKey(campaignId:string,recapId:string,
  actorId:string,receipt:string,index:number):string{
  if(!/^cmp_[A-Za-z0-9_-]{22}$/u.test(campaignId)||!UUID.test(recapId)||
    !/^[A-Za-z0-9_-]{1,120}$/u.test(actorId)||!RECEIPT.test(receipt)||
    !Number.isSafeInteger(index)||index<0||index>=MAX_CHUNKS)
    throw Error("Invalid private clip staging reference.");
  return ["recap-staged-audio",campaignId,recapId,actorId,receipt,
    String(index).padStart(2,"0")].join("/");
}
type Finalize={
  recapId?:unknown;receipt?:unknown;chunks?:unknown;byteSize?:unknown;
  filename?:unknown;mimeType?:unknown;startMs?:unknown;durationMs?:unknown;
  speakerId?:unknown;model?:unknown;apiKey?:unknown;
  approvedShare?:unknown;approvedBilling?:unknown;
};
const integer=(raw:unknown,min:number,max:number):raw is number=>
  typeof raw==="number"&&Number.isSafeInteger(raw)&&raw>=min&&raw<=max;

export async function handleStagedRecapAudio(request:Request,
  campaignId:string,provider:"gemini"|"groq",bucket:R2Bucket):Promise<Response>{
  try{
    const url=new URL(request.url);
    const origin=request.headers.get("origin");
    if(origin!==url.origin||request.headers.get("sec-fetch-site")==="cross-site")
      return reply("Start audio transcription from TWE.",403);
    const actor=await getSessionActor(request);
    if(!actor)return reply("Sign in required.",401);
    const db=await getCampaignD1();
    const access=await loadCampaignAccess(db,actor,campaignId);
    if(!canManageCampaignContent(actor,access.campaign,access.membership))
      return reply("Only campaign GMs may prepare audio transcription.",403);
    requireActiveCampaign(access.campaign);
    if(request.method!=="POST")return reply("Unsupported request.",405);

    if(url.searchParams.get("operation")==="chunk"){
      const recapId=url.searchParams.get("recapId");
      const recap=await getCampaignSessionRecap(db,actor,campaignId,recapId);
      const receipt=url.searchParams.get("receipt")??"";
      const index=Number(url.searchParams.get("index"));
      const total=Number(url.searchParams.get("total"));
      if(!integer(index,0,MAX_CHUNKS-1)||!integer(total,1,MAX_CHUNKS)||index>=total)
        return reply("Invalid audio chunk sequence.",422);
      const length=request.headers.get("content-length");
      if(length&&(!/^\d+$/u.test(length)||Number(length)>MAX_CHUNK))
        return reply("Audio chunk exceeds the 512 KiB transfer limit.",413);
      if(request.headers.get("content-type")!=="application/octet-stream")
        return reply("Send a binary audio chunk.",415);
      const key=stagedRecapAudioKey(access.campaign.publicId,recap.id,actor.userId,receipt,index);
      // Explicitly bound the stream; never trust Content-Length on its own.
      const reader=request.body?.getReader();
      if(!reader)return reply("Audio chunk is missing.",422);
      let received=0;
      const pieces:Uint8Array[]=[];
      try{
        while(true){
          const result=await reader.read();
          if(result.done)break;
          received+=result.value.byteLength;
          if(received>MAX_CHUNK)throw new CampaignServiceError("Audio chunk too large.",413);
          pieces.push(result.value);
        }
      }finally{reader.releaseLock();}
      if(received<1)return reply("Audio chunk is empty.",422);
      const chunk=new Uint8Array(received);
      let offset=0;
      for(const part of pieces){chunk.set(part,offset);offset+=part.byteLength;}
      await bucket.put(key,chunk,{customMetadata:{stagedAt:new Date().toISOString()}});
      return Response.json({saved:true,index,bytes:received},{headers:HEADERS});
    }

    if(url.searchParams.get("operation")!=="finalize")
      return reply("Unsupported staging action.",422);
    const body=await readBoundedJson(request,4096) as Finalize;
    const recap=await getCampaignSessionRecap(db,actor,campaignId,body.recapId);
    if(typeof body.receipt!=="string"||!RECEIPT.test(body.receipt)||
      !integer(body.chunks,1,MAX_CHUNKS)||
      !integer(body.byteSize,128,provider==="gemini"?11*1024*1024:MAX_TOTAL)||
      body.chunks!==Math.ceil(body.byteSize/MAX_CHUNK)||
      typeof body.filename!=="string"||body.filename.length>180||
      !/^[^\x00-\x1f\\/]+\.(?:m4a|mp3|wav|flac|ogg|webm|mp4)$/iu.test(body.filename)||
      typeof body.mimeType!=="string"||body.mimeType.length>80||
      !integer(body.startMs,0,8*3600*1000)||
      !integer(body.durationMs,1000,30*60*1000)||
      typeof body.speakerId!=="string"||
      body.approvedShare!==true||body.approvedBilling!==true)
      return reply("Invalid prepared audio section or missing provider consent.",422);
    const receipt=body.receipt;
    const names=Array.from({length:body.chunks},(_,index)=>
      stagedRecapAudioKey(access.campaign.publicId,recap.id,actor.userId,receipt,index));
    const fileParts:Uint8Array[]=[];
    let totalBytes=0;
    for(let i=0;i<names.length;i++){
      const stored=await bucket.get(names[i]);
      if(!stored)return reply("Audio upload is incomplete. Resend this section before transcription.",409);
      const chunk=new Uint8Array(await stored.arrayBuffer());
      if(!chunk.byteLength||chunk.byteLength>MAX_CHUNK||
        (i<names.length-1&&chunk.byteLength!==MAX_CHUNK))
        return reply("One audio chunk is incomplete. Resend this section.",409);
      totalBytes+=chunk.byteLength;
      if(totalBytes>MAX_TOTAL)return reply("Prepared audio exceeds provider size limit.",413);
      fileParts.push(chunk);
    }
    if(totalBytes!==body.byteSize)return reply("Uploaded section size does not match the prepared original.",409);
    const file=new File(fileParts.map(p=>new Uint8Array(p)),body.filename,
      {type:body.mimeType});
    const model=provider==="gemini"?GEMINI_TRANSCRIBE_MODEL:
      typeof body.model==="string"?body.model:"";
    const fileBytes=await file.arrayBuffer();
    const computed=await recapCloudClipReceipt(fileBytes,provider,{
      startMs:body.startMs,durationMs:body.durationMs,
      speakerId:body.speakerId,model,
    });
    if(computed!==receipt)return reply("Audio clip verification failed. The provider was not called.",409);
    const form=new FormData();
    form.set("recapId",recap.id);
    form.set("file",file,body.filename);
    form.set("startMs",String(body.startMs));
    form.set("durationMs",String(body.durationMs));
    form.set("speakerId",body.speakerId);
    form.set("approvedShare","true");
    form.set("approvedBilling","true");
    if(typeof body.apiKey==="string"&&body.apiKey)form.set("apiKey",body.apiKey);
    if(provider==="groq"){
      form.set("model",model);
      form.set("language","en");
    }
    // Invoke the existing, independently authenticated provider handler inside
    // the Worker. No large client request passes through Vinext or Cloudflare.
    const headers=new Headers(request.headers);
    headers.delete("content-length");
    headers.delete("content-type");
    const endpoint=new URL(request.url);
    endpoint.pathname=endpoint.pathname.replace(/\/staged$/u,
      provider==="gemini"?"/gemini":"/transcribe");
    endpoint.search="";
    const internal=new Request(endpoint.toString(),{
      method:"POST",headers,
    });
    try{
      return provider==="gemini"
        ?await handleGeminiRequest(internal,{params:Promise.resolve({id:campaignId})},form)
        :await handleGroqRequest(internal,{params:Promise.resolve({id:campaignId})},form);
    }finally{
      // Explicitly discard temporary owner-hosted copies after a provider
      // submission. Failed retries upload only the already-prepared clips.
      for(const key of names)await bucket.delete(key).catch(()=>{});
    }
  }catch(error){
    if(error instanceof CampaignServiceError)return reply(error.message,error.status);
    return reply("Unable to stage this private audio section safely.",422);
  }
}

/** Reclaim browser-abandoned temporary clips without touching published audio.
 * Free-plan-friendly: at most 50 old staging chunks per scheduled tick. */
export async function cleanupExpiredStagedRecapAudio(bucket:R2Bucket):Promise<number>{
  const threshold=Date.now()-24*60*60*1000;
  const page=await bucket.list({prefix:"recap-staged-audio/",limit:200});
  let removed=0;
  for(const item of page.objects){
    if(removed>=50)break;
    if(item.uploaded.getTime()>threshold)continue;
    await bucket.delete(item.key);
    removed++;
  }
  return removed;
}
