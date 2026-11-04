"use client";

import {useEffect,useRef,useState} from "react";
import {browserRecapFile} from "@/lib/campaigns/recap-browser-preparation";
import {recapCloudClipReceipt} from "@/lib/campaigns/recap-cloud-clip-receipt";
import {GEMINI_TRANSCRIBE_MODEL} from "@/lib/campaigns/recap-gemini-transcribe";
import {submitStagedCloudClip} from "@/lib/campaigns/recap-staged-upload-client";
import {inspectPcmWavUpload,planPcmWavUploadChunks,buildPcmWavUpload} from "@/lib/campaigns/recap-wav-chunks";
import type {RecapPreparation} from "@/lib/campaigns/recap-stage-workflow";
import {loadLocalWhisper,localCaptionCues} from "./session-recap-local-whisper";
import {SessionRecapFullTranscriptManager} from "./session-recap-full-transcript-manager";

type Speaker={id:string;displayName:string};
type Result={saved?:boolean;duplicate?:boolean;error?:string};
async function fingerprint(file:File,speakerId:string,startMs:number,model:string){
  const payload=new Uint8Array(await file.arrayBuffer());
  const meta=new TextEncoder().encode("local-whisper:"+speakerId+":"+startMs+":"+model);
  const joined=new Uint8Array(payload.byteLength+meta.byteLength);
  joined.set(payload);joined.set(meta,payload.byteLength);
  const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",joined));
  return Array.from(digest,b=>b.toString(16).padStart(2,"0")).join("");
}
const LOCAL_MODEL="onnx-community/whisper-tiny.en";
export function SessionRecapStagedTranscriber({campaignId,recapId,preparation,onTranscriptSaved}:{
  campaignId:string;recapId:string;preparation:RecapPreparation;
  onTranscriptSaved:()=>void;
}){
  const [speakers,setSpeakers]=useState<Speaker[]>([]);
  const [speakerId,setSpeakerId]=useState("guest");
  const [model,setModel]=useState("whisper-large-v3");
  const [apiKey,setApiKey]=useState("");
  const [connectedGroq,setConnectedGroq]=useState(false);
  const [existingCues,setExistingCues]=useState(0);
  const [savedReceipts,setSavedReceipts]=useState<string[]>([]);
  const [historyLoaded,setHistoryLoaded]=useState(false);
  const [share,setShare]=useState(false);
  const [billing,setBilling]=useState(false);
  const [busy,setBusy]=useState(false);
  const [completed,setCompleted]=useState(0);
  const [notice,setNotice]=useState("");
  const [transfer,setTransfer]=useState<{done:number;total:number}|null>(null);
  const [error,setError]=useState("");
  const stop=useRef(false);
  const base="/api/campaigns/"+encodeURIComponent(campaignId)+"/session-recaps/transcript";
  const provider=preparation.provider;
  const cloud=provider==="groq"||provider==="gemini";
  useEffect(()=>{
    const controller=new AbortController();
    void fetch(base+"?recapId="+encodeURIComponent(recapId),{signal:controller.signal,cache:"no-store"})
      .then(async r=>{
        const value=await r.json() as {cues?:unknown[];processedClips?:string[];error?:string};
        if(!r.ok)throw Error(value.error||"Could not check saved transcription progress.");
        return value;
      }).then(value=>{
        if(controller.signal.aborted)return;
        setExistingCues(value.cues?.length??0);
        setSavedReceipts(value.processedClips??[]);
        setHistoryLoaded(true);
      }).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:"Could not check saved transcription progress.");});
    return ()=>controller.abort();
  },[base,recapId]);
  useEffect(()=>{
    if(provider!=="groq")return;
    const controller=new AbortController();
    void fetch("/api/account/recap-ai/groq",{signal:controller.signal}).then(async r=>await r.json() as {connection?:{status?:string}})
      .then((v:{connection?:{status?:string}})=>{if(!controller.signal.aborted)setConnectedGroq(v.connection?.status==="connected");})
      .catch(()=>{});
    return ()=>controller.abort();
  },[provider]);
  useEffect(()=>{
    const controller=new AbortController();
    void fetch("/api/campaigns/"+encodeURIComponent(campaignId)+"/recap-imports",
      {cache:"no-store",signal:controller.signal}).then(async response=>{
      const data=await response.json() as {speakers?:Speaker[]};
      if(!response.ok)throw Error("Could not load campaign speakers.");
      if(!controller.signal.aborted)setSpeakers(data.speakers??[]);
    }).catch(()=>{});
    return ()=>controller.abort();
  },[campaignId]);
  async function submitCloud(){
    if(!cloud)throw Error("Unsupported cloud transcription stage.");
    if(!historyLoaded)throw Error("Check saved transcription progress before retrying provider requests.");
    if(!share||!billing)throw Error("Approve provider sharing and quota before submitting.");
    if(provider==="groq"&&!apiKey.trim()&&!connectedGroq)throw Error("Connect your Groq key in Account or enter it here.");
    for(let i=completed;i<preparation.parts.length;i++){
      if(stop.current)break;
      const part=preparation.parts[i];
      if(!part.localKey)throw Error("Prepared part is not available locally. Return to Prepare Audio.");
      const file=await browserRecapFile(part.localKey);
      if(file.size!==part.bytes)throw Error("Prepared part has changed. Return to Prepare Audio.");
      const maxSize=provider==="gemini"?11*1024*1024:16*1024*1024;
      if(file.size>maxSize)throw Error("Section "+(i+1)+" exceeds the selected provider clip limit. Return to Prepare Audio.");
      const receipt=await recapCloudClipReceipt(await file.arrayBuffer(),provider,{
        startMs:part.startMs,durationMs:part.durationMs,speakerId,
        model:provider==="groq"?model:GEMINI_TRANSCRIBE_MODEL,
      });
      if(savedReceipts.includes(receipt)){
        setCompleted(i+1);
        continue;
      }
      const endpoint=base+"/staged/"+provider;
      setTransfer({done:0,total:file.size});
      const result=await submitStagedCloudClip({
        endpoint,recapId,receipt,file,
        filename:part.name,mimeType:part.mimeType,
        startMs:part.startMs,durationMs:part.durationMs,speakerId,
        model:provider==="groq"?model:GEMINI_TRANSCRIBE_MODEL,
        apiKey,provider,
        onProgress:(done,total,stage)=>{
          setTransfer(stage==="transfer"?{done,total}:null);
          setNotice(stage==="transfer"
            ?"Transferring section "+(i+1)+" of "+preparation.parts.length+
              " in small pieces ("+Math.round(done/total*100)+"%)…"
            :"Section "+(i+1)+" transferred. TWE is verifying audio and awaiting "+
              (provider==="gemini"?"Gemini":"Groq")+" transcription…");
        },
      });
      setTransfer(null);
      setCompleted(i+1);
      setSavedReceipts(previous=>previous.includes(receipt)?previous:[...previous,receipt]);
      if(!result.duplicate){setExistingCues(x=>x+1);onTranscriptSaved();}
    }
  }
  async function submitLocal(){
    const transcribe=await loadLocalWhisper();
    const audioContext=new AudioContext({sampleRate:16000});
    try{
      for(let i=completed;i<preparation.parts.length;i++){
        if(stop.current)break;
        const part=preparation.parts[i];
        if(!part.localKey)throw Error("Prepared WAV is no longer available.");
        const file=await browserRecapFile(part.localKey);
        if(file.size!==part.bytes)throw Error("Prepared file has changed.");
        const wav=await inspectPcmWavUpload(new File([file],part.name,{type:"audio/wav"}));
        const chunks=planPcmWavUploadChunks(wav,4*1024*1024);
        for(let c=0;c<chunks.length;c++){
          if(stop.current)break;
          const clip=buildPcmWavUpload(new File([file],part.name,{type:"audio/wav"}),wav,chunks[c],c);
          const startMs=part.startMs+chunks[c].startMs;
          const receipt=await fingerprint(clip,speakerId,startMs,LOCAL_MODEL);
          const status=await fetch(base+"/local?recapId="+encodeURIComponent(recapId)+
            "&receipt="+receipt,{cache:"no-store"});
          const saved=await status.json() as {complete?:boolean;error?:string};
          if(!status.ok)throw Error(saved.error||"Could not check saved transcription section.");
          if(!saved.complete){
            const decoded=await audioContext.decodeAudioData(await clip.arrayBuffer());
            if(decoded.numberOfChannels<1)throw Error("WAV clip could not be decoded.");
            const result=await transcribe(decoded.getChannelData(0),
              {return_timestamps:true,chunk_length_s:30});
            const cues=localCaptionCues(result,startMs,chunks[c].endMs-chunks[c].startMs);
            const response=await fetch(base+"/local",{
              method:"POST",headers:{"content-type":"application/json"},
              body:JSON.stringify({recapId,speakerId,receipt,cues,approved:true}),
            });
            const confirmation=await response.json() as Result;
            if(!response.ok||!confirmation.saved)throw Error(confirmation.error||"Local section not saved.");
            onTranscriptSaved();
          }
        }
        if(stop.current)break;
        setCompleted(i+1);
      }
    }finally{await audioContext.close();}
  }
  // The Groq model choice was not recorded in old workflow checkpoints.
  // Recover it from an existing clip receipt before offering another submission.
  useEffect(()=>{
    if(provider!=="groq"||!historyLoaded||!savedReceipts.length||busy)return;
    let active=true;
    void (async()=>{
      for(const part of preparation.parts){
        if(!part.localKey)continue;
        let file:File;
        try{file=await browserRecapFile(part.localKey);}catch{continue;}
        if(file.size!==part.bytes)continue;
        const bytes=await file.arrayBuffer();
        for(const candidate of ["whisper-large-v3","whisper-large-v3-turbo"]){
          const receipt=await recapCloudClipReceipt(bytes,"groq",{
            startMs:part.startMs,durationMs:part.durationMs,speakerId,model:candidate,
          });
          if(savedReceipts.includes(receipt)){
            if(active)setModel(candidate);
            return;
          }
        }
      }
    })().catch(()=>{});
    return ()=>{active=false;};
  },[provider,historyLoaded,savedReceipts,busy,preparation.parts,speakerId]);
  useEffect(()=>{
    if(!cloud||!historyLoaded||busy)return;
    let active=true;
    void (async()=>{
      const receipts=new Set(savedReceipts);
      let verified=0;
      for(const part of preparation.parts){
        if(!part.localKey)break;
        try{
          const file=await browserRecapFile(part.localKey);
          if(file.size!==part.bytes)break;
          const receipt=await recapCloudClipReceipt(await file.arrayBuffer(),provider,{
            startMs:part.startMs,durationMs:part.durationMs,speakerId,
            model:provider==="groq"?model:GEMINI_TRANSCRIBE_MODEL,
          });
          if(!receipts.has(receipt))break;
          verified++;
        }catch{break;}
      }
      if(active)setCompleted(verified);
    })();
    return ()=>{active=false;};
  },[cloud,historyLoaded,busy,savedReceipts,preparation.parts,provider,speakerId,model]);
  async function run(){
    if(busy||!preparation.parts.length||!speakerId)return;
    if(cloud&&!share||cloud&&!billing)return;
    stop.current=false;setBusy(true);setError("");setNotice("");
    try{
      if(cloud)await submitCloud();
      else if(provider==="local-whisper")await submitLocal();
      else throw Error("Import a transcript using the editor below.");
      setNotice(stop.current?"Paused after the current section. Completed sections remain saved.":
        "Transcription finished. Review the saved transcript before approving it.");
    }catch(e){
      const message=e instanceof Error?e.message:"Transcription failed.";
      setError(message+(/HTTP 413|Payload Too Large/u.test(message)
        ?" Previously prepared sections are saved. Don't reupload the original recording."
        :/timed out|timeout|connection ended|uncertain|temporarily unavailable|could not be reached/iu.test(message)
          ?" Your prepared audio is saved. No automatic retry was made; verify saved progress and provider usage before explicitly resubmitting."
          :" Finished sections remain saved; check saved progress and your provider account before retrying."));
    }
    finally{setBusy(false);setTransfer(null);}
  }
  if(provider==="import")return <div className="session-recap-reading">
    <h4>Import your timestamped transcript</h4>
    <p className="campaign-empty-copy">Import Craig SRT or WebVTT captions. No AI account required.</p>
    <SessionRecapFullTranscriptManager campaignId={campaignId} recapId={recapId}/>
    <button className="campaign-secondary" type="button" onClick={onTranscriptSaved}>
      Refresh saved transcript
    </button>
  </div>;
  return <section className="session-recap-reading" aria-label="Transcribe saved audio parts">
    <h4>Transcribe with {provider==="local-whisper"?"Local Whisper":provider==="groq"?"Groq Whisper":"Gemini"}</h4>
    <p className="campaign-empty-copy">
      {preparation.parts.length} prepared audio section(s). No conversion happens during this step.
      Completed sections are checkpointed in the private transcript. Keep this tab open while processing.
    </p>
    <label>Speaker attribution for mixed-down audio
      <select disabled={busy} value={speakerId} onChange={e=>setSpeakerId(e.target.value)}>
        <option value="guest">Unidentified / mixed session</option>
        {speakers.map(s=><option key={s.id} value={s.id}>{s.displayName}</option>)}
      </select>
    </label>
    {provider==="groq"&&<>
      <label>Whisper model
        <select disabled={busy||existingCues>0} value={model} onChange={e=>{setModel(e.target.value);setCompleted(0);}}>
          <option value="whisper-large-v3">Whisper Large V3 — accuracy</option>
          <option value="whisper-large-v3-turbo">Whisper Large V3 Turbo — faster</option>
        </select>
      </label>
      {existingCues>0&&<p className="campaign-empty-copy">A transcript already exists. Model switching is locked to avoid mixing different model outputs. Finish or export the existing transcript first.</p>}
    </>}
    {cloud&&<>
      <label>Personal {provider==="groq"?"Groq":"Gemini"} API key (optional when connected in Account)
        <input type="password" autoComplete="off" disabled={busy} value={apiKey}
          onChange={e=>setApiKey(e.target.value)}/>
      </label>
      <label><input type="checkbox" checked={share} disabled={busy}
        onChange={e=>setShare(e.target.checked)}/>
        I approve sending these prepared audio sections to {provider==="groq"?"Groq":"Google"}.
      </label>
      <label><input type="checkbox" checked={billing} disabled={busy}
        onChange={e=>setBilling(e.target.checked)}/>
        I understand my own provider quota may be used or charges may apply.
      </label>
    </>}
    {!cloud&&<p className="campaign-empty-copy">Free on this device; no AI account. This may be slow, especially for multi-hour sessions. Keep the browser awake.</p>}
    <div className="session-recap-form-actions">
      <button className="campaign-primary" type="button" disabled={busy||!speakerId||!historyLoaded||
        (cloud&&(!share||!billing))||(provider==="groq"&&!apiKey&&!connectedGroq)}
        onClick={()=>void run()}>{busy?"Transcribing…":completed?"Resume transcription":"Start transcription"}</button>
      {busy&&<button className="campaign-secondary" type="button" onClick={()=>{stop.current=true;}}>
        Stop after current section
      </button>}
    </div>
    {transfer&&<div role="status">
      <p>Transferring prepared section to TWE: {Math.round(transfer.done/transfer.total*100)}%
        ({(transfer.done/1024/1024).toFixed(1)} of {(transfer.total/1024/1024).toFixed(1)} MiB)</p>
      <progress style={{width:"100%"}} max={transfer.total} value={transfer.done}
        aria-label="Prepared audio transfer progress"/>
    </div>}
    <progress style={{width:"100%"}} max={Math.max(1,preparation.parts.length)} value={completed} aria-label="Transcription sections complete"/>
    {busy&&<div role="status">
      <span>Transcribing section {Math.min(completed+1,preparation.parts.length)} of {preparation.parts.length}…</span>
      <progress style={{width:"100%"}} aria-label="Current transcription request in progress"/>
      <p className="campaign-empty-copy">The current transcription request does not provide a reliable percentage. Saved sections are counted above.</p>
    </div>}
    <p className="campaign-empty-copy">{completed} of {preparation.parts.length} sections verified in this browser. Saved cloud sections are checked before transfer or another AI request.</p>
    {notice&&<p role="status" className="session-recap-import-notice">{notice}</p>}
    {error&&<p role="alert" className="campaign-error">{error}</p>}
  </section>;
}
