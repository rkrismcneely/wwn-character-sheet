/** Explicit, checkpointed session recap workflow. No stage calls an AI provider. */
export type RecapSource = {
  kind:"drive"|"browser"; id:string; name:string; bytes:number; mimeType:string;
};
export type RecapTranscriber = "groq"|"gemini"|"local-whisper"|"import";
export type RecapWriter = "gemini"|"groq"|"local"|"manual";
export type PreparedPart = {
  name:string; bytes:number; mimeType:string; startMs:number; durationMs:number;
  localKey:string|null;
};
export type RecapPreparation = {
  provider:RecapTranscriber; method:"original"|"ffmpeg"|"import";
  parts:PreparedPart[]; savedAt:string; transcriptBefore:string|null;
};
export type RecapDraftVersion = {
  id:string; provider:RecapWriter; model:string; detail:"brief"|"standard"|"detailed";
  savedAt:string; key:string;
};
export type RecapWorkflow = {
  version:1; revision:number; updatedAt:string;
  source:RecapSource|null; sourceApprovedAt:string|null;
  preparation:RecapPreparation|null;
  transcriptApprovedAt:string|null; transcriptApprovedRevision:string|null;
  writer:{provider:RecapWriter;model:string;detail:"brief"|"standard"|"detailed"}|null;
  drafts:RecapDraftVersion[]; approvedDraftId:string|null;
};
export type RecapWorkflowAction =
  | {action:"approve-source";source:RecapSource}
  | {action:"save-preparation";provider:RecapTranscriber;method:"original"|"ffmpeg"|"import";parts:PreparedPart[]}
  | {action:"approve-transcript"}
  | {action:"select-writer";provider:RecapWriter;model:string;detail:"brief"|"standard"|"detailed"}
  | {action:"save-draft";content:string}
  | {action:"approve-draft";draftId:string};
export type RecapEvidence = {
  sourceReady:boolean; transcriptRevision:string|null; draft?:{id:string;key:string};
};
export function emptyRecapWorkflow(now:string):RecapWorkflow{
  return {version:1,revision:0,updatedAt:now,source:null,sourceApprovedAt:null,
    preparation:null,transcriptApprovedAt:null,transcriptApprovedRevision:null,
    writer:null,drafts:[],approvedDraftId:null};
}
export function recapWorkflowObjectKey(campaignId:string,recapId:string):string{
  if(!/^cmp_[A-Za-z0-9_-]{22}$/u.test(campaignId)||
    !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu.test(recapId))
    throw Error("Invalid recap workflow identifiers.");
  return "recap-workflows/"+campaignId+"/"+recapId+".json";
}
export function recapDraftObjectKey(campaignId:string,recapId:string,id:string):string{
  if(!/^[0-9a-f-]{36}$/iu.test(id))throw Error("Invalid draft identifier.");
  return recapWorkflowObjectKey(campaignId,recapId).replace(/\.json$/u,"/draft-"+id+".json");
}
function check(value:unknown,message:string):asserts value{
  if(!value)throw Error(message);
}
export function validateRecapSource(raw:unknown):RecapSource{
  check(raw&&typeof raw==="object"&&!Array.isArray(raw),"Choose a saved recording.");
  const s=raw as Record<string,unknown>;
  check(s.kind==="drive"||s.kind==="browser","Unsupported source type.");
  check(typeof s.id==="string"&&/^[A-Za-z0-9_-]{1,100}$/u.test(s.id),"Invalid recording reference.");
  check(typeof s.name==="string"&&s.name.length>0&&s.name.length<=180&&
    !/[\u0000-\u001f]/u.test(s.name),"Invalid recording filename.");
  check(Number.isSafeInteger(s.bytes)&&Number(s.bytes)>128&&Number(s.bytes)<=2_000_000_000,
    "Recording size is missing or unsupported.");
  check(typeof s.mimeType==="string"&&s.mimeType.length<=80,"Invalid recording type.");
  return {kind:s.kind,id:s.id,name:s.name,bytes:Number(s.bytes),mimeType:s.mimeType};
}
export function validatePreparationParts(provider:RecapTranscriber,raw:unknown):PreparedPart[]{
  check(Array.isArray(raw)&&raw.length>0&&raw.length<=64,
    "Preparation must contain 1–64 saved, validated parts.");
  let previousEnd=0;
  const allowed=/\.(?:m4a|mp3|flac|wav|ogg|webm|mp4)$/iu;
  return raw.map((p:unknown,index:number)=>{
    check(p&&typeof p==="object"&&!Array.isArray(p),"Invalid prepared part.");
    const v=p as Record<string,unknown>;
    check(typeof v.name==="string"&&v.name.length<=180&&allowed.test(v.name)&&
      !/[\u0000-\u001f\\/]/u.test(v.name),"Unsupported prepared filename.");
    check(typeof v.mimeType==="string"&&v.mimeType.length<80,"Invalid prepared audio type.");
    check(Number.isSafeInteger(v.bytes)&&Number(v.bytes)>=128&&
      Number(v.bytes)<=2_000_000_000,"Invalid prepared audio size.");
    check(Number.isSafeInteger(v.startMs)&&Number(v.startMs)>=0&&
      Number.isSafeInteger(v.durationMs)&&Number(v.durationMs)>0&&
      Number(v.startMs)+Number(v.durationMs)<=8*60*60*1000,"Invalid prepared audio timeline.");
    check(index===0 || Number(v.startMs)>=previousEnd-2000,
      "Prepared parts overlap by more than two seconds.");
    previousEnd=Number(v.startMs)+Number(v.durationMs);
    check(v.localKey===null || typeof v.localKey==="string"&&
      /^[A-Za-z0-9_-]{1,120}$/u.test(v.localKey),"Invalid browser audio reference.");
    if(provider==="groq")check(Number(v.bytes)<=16*1024*1024&&Number(v.durationMs)<=30*60_000,
      "Groq parts must be at most 16 MiB and 30 minutes.");
    if(provider==="gemini")check(Number(v.bytes)<=11*1024*1024&&Number(v.durationMs)<=30*60_000,
      "Gemini clip parts must be at most 11 MiB and 30 minutes.");
    if(provider==="local-whisper")check(/\.wav$/iu.test(v.name),
      "Local Whisper currently requires PCM WAV parts.");
    return {name:v.name,bytes:Number(v.bytes),mimeType:v.mimeType,
      startMs:Number(v.startMs),durationMs:Number(v.durationMs),
      localKey:v.localKey as string|null};
  });
}
/** State changes are explicit and invalidation is downstream-only; old draft versions remain. */
export function transitionRecapWorkflow(old:RecapWorkflow,action:RecapWorkflowAction,
  evidence:RecapEvidence,now:string):RecapWorkflow{
  check(old.version===1&&Number.isSafeInteger(old.revision),"Unsupported workflow state.");
  const next:RecapWorkflow={...old,revision:old.revision+1,updatedAt:now};
  switch(action.action){
    case "approve-source":{
      const source=validateRecapSource(action.source);
      check(evidence.sourceReady,"Verify the saved recording before continuing.");
      const same=JSON.stringify(old.source)===JSON.stringify(source);
      next.source=source;next.sourceApprovedAt=now;
      if(!same){next.preparation=null;next.transcriptApprovedAt=null;
        next.transcriptApprovedRevision=null;next.writer=null;next.approvedDraftId=null;}
      break;
    }
    case "save-preparation":{
      check(action.provider==="import"&&action.method==="import" || Boolean(next.sourceApprovedAt&&next.source),
        "Approve a recording first, or choose transcript-only import.");
      check(["groq","gemini","local-whisper","import"].includes(action.provider),
        "Unsupported transcription provider.");
      check(["original","ffmpeg","import"].includes(action.method),"Unsupported preparation method.");
      const parts=validatePreparationParts(action.provider,action.parts);
      if(action.provider==="import")check(action.method==="import","Transcript import does not need audio conversion.");
      next.preparation={provider:action.provider,method:action.method,parts,savedAt:now,
        transcriptBefore:evidence.transcriptRevision};
      next.transcriptApprovedAt=null;next.transcriptApprovedRevision=null;
      next.writer=null;next.approvedDraftId=null;
      break;
    }
    case "approve-transcript":{
      check(Boolean(next.preparation),"Prepare and save audio before approving the transcript.");
      check(Boolean(evidence.transcriptRevision),"A saved timestamped transcript is required.");
      check(evidence.transcriptRevision!==next.preparation!.transcriptBefore,
        "The transcript has not changed since this audio was prepared. Transcribe or import it first.");
      next.transcriptApprovedAt=now;
      next.transcriptApprovedRevision=evidence.transcriptRevision;
      next.approvedDraftId=null;
      break;
    }
    case "select-writer":{
      check(Boolean(next.transcriptApprovedAt&&next.transcriptApprovedRevision),
        "Review and approve the transcript first.");
      check(["groq","gemini","local","manual"].includes(action.provider),
        "Unsupported recap writing provider.");
      check(typeof action.model==="string"&&action.model.length<=90&&
        !/[\u0000-\u001f]/u.test(action.model),"Invalid recap model.");
      check(["brief","standard","detailed"].includes(action.detail),"Choose recap detail.");
      next.writer={provider:action.provider,model:action.model,detail:action.detail};
      next.approvedDraftId=null;
      break;
    }
    case "save-draft":{
      check(Boolean(next.writer&&next.transcriptApprovedAt),"Approve a transcript and select a writer first.");
      check(typeof action.content==="string"&&action.content.trim().length>=10&&
        action.content.length<=30_000,"Recap draft must contain 10–30,000 characters.");
      check(Boolean(evidence.draft),"A saved recap draft receipt is required.");
      const version:RecapDraftVersion={...evidence.draft!,...next.writer!,
        detail:next.writer!.detail,savedAt:now};
      next.drafts=[...next.drafts.slice(-19),version];
      next.approvedDraftId=null;
      break;
    }
    case "approve-draft":{
      check(next.drafts.some(d=>d.id===action.draftId),"Choose a saved recap draft version.");
      next.approvedDraftId=action.draftId;
      break;
    }
    default:throw Error("Unsupported workflow action.");
  }
  return next;
}
