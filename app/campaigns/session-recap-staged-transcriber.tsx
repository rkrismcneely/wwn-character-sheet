"use client";

import {useEffect,useRef,useState} from "react";
import {browserRecapFile} from "@/lib/campaigns/recap-browser-preparation";
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
  const [share,setShare]=useState(false);
  const [billing,setBilling]=useState(false);
  const [busy,setBusy]=useState(false);
  const [completed,setCompleted]=useState(0);
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");
  const stop=useRef(false);
  const base="/api/campaigns/"+encodeURIComponent(campaignId)+"/session-recaps/transcript";
  const provider=preparation.provider;
  const cloud=provider==="groq"||provider==="gemini";
  useEffect(()=>{
    const controller=new AbortController();
    void fetch(base+"?recapId="+encodeURIComponent(recapId),{signal:controller.signal})
      .then(r=>r.json()).then((v:{cues?:unknown[]})=>{
        if(!controller.signal.aborted)setExistingCues(v.cues?.length??0);
      }).catch(()=>{});
    return ()=>controller.abort();
  },[base,recapId]);
  useEffect(()=>{
    if(provider!=="groq")return;
    const controller=new AbortController();
    void fetch("/api/account/recap-ai/groq",{signal:controller.signal}).then(r=>r.json())
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
    if(!share||!billing)throw Error("Approve provider sharing and quota before submitting.");
    if(provider==="groq"&&!apiKey.trim()&&!connectedGroq)throw Error("Connect your Groq key in Account or enter it here.");
    for(let i=completed;i<preparation.parts.length;i++){
      if(stop.current)break;
      const part=preparation.parts[i];
      if(!part.localKey)throw Error("Prepared part is not available locally. Return to Prepare Audio.");
      const file=await browserRecapFile(part.localKey);
      if(file.size!==part.bytes)throw Error("Prepared part has changed. Return to Prepare Audio.");
      const form=new FormData();
      form.set("recapId",recapId);
      form.set("file",new File([file],part.name,{type:part.mimeType}));
      form.set("startMs",String(part.startMs));
      form.set("durationMs",String(part.durationMs));
      form.set("speakerId",speakerId);
      form.set("approvedShare","true");
      form.set("approvedBilling","true");
      if(apiKey.trim())form.set("apiKey",apiKey.trim());
      if(provider==="groq"){form.set("model",model);form.set("language","en");}
      const endpoint=provider==="groq"?base+"/transcribe":base+"/gemini";
      const response=await fetch(endpoint,{method:"POST",body:form});
      const result=await response.json() as Result;
      if(!response.ok||!result.saved)throw Error(result.error||"Transcription stopped on section "+(i+1)+".");
      setCompleted(i+1);setExistingCues(x=>x+1);onTranscriptSaved();
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
    }catch(e){setError((e instanceof Error?e.message:"Transcription failed.")+
      " Finished sections remain saved; check provider quota before retrying.");}
    finally{setBusy(false);}
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
      <button className="campaign-primary" type="button" disabled={busy||!speakerId||
        (cloud&&(!share||!billing))||(provider==="groq"&&!apiKey&&!connectedGroq)}
        onClick={()=>void run()}>{busy?"Transcribing…":completed?"Resume transcription":"Start transcription"}</button>
      {busy&&<button className="campaign-secondary" type="button" onClick={()=>{stop.current=true;}}>
        Stop after current section
      </button>}
    </div>
    <progress max={Math.max(1,preparation.parts.length)} value={completed} aria-label="Transcription sections complete"/>
    <p className="campaign-empty-copy">{completed} of {preparation.parts.length} sections checked in this run. Saved cloud clip receipts are verified before provider submission, including after reload.</p>
    {notice&&<p role="status" className="session-recap-import-notice">{notice}</p>}
    {error&&<p role="alert" className="campaign-error">{error}</p>}
  </section>;
}
