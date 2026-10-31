"use client";

import { useEffect,useRef,useState,type ChangeEvent } from "react";
import type { RecapSpeakerAssociation } from "@/lib/campaigns/recap-imports";
import { inspectPcmWavUpload,planPcmWavUploadChunks,buildPcmWavUpload,
  type PcmWav,type WavChunk } from "@/lib/campaigns/recap-wav-chunks";
import type { CaptionCue } from "@/lib/campaigns/recap-full-transcript";
import { localHandleKey,rememberLocalRecapFile,readRememberedLocalRecapFile,
  clearRememberedLocalRecapFile,requestLocalRecapFileHandle } from "@/lib/campaigns/recap-local-file-access";

// Pinned third-party inference library, fetched only after explicit GM activation.
// Audio remains in the browser; model JS and weights download from public CDNs.
const WHISPER_BROWSER_LIBRARY="https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/+esm";
const WHISPER_MODEL="onnx-community/whisper-tiny.en";
type WhisperChunk={text?:string;timestamp?:[number,number]};
type WhisperOutput={text?:string;chunks?:WhisperChunk[]};
type Transcriber=(audio:Float32Array,options:Record<string,unknown>)=>Promise<WhisperOutput>;
type TranscriptionModule={pipeline:(task:string,model:string,options:Record<string,unknown>)=>Promise<Transcriber>};
async function loadLocalWhisper():Promise<Transcriber>{
  // Dynamic CDN import avoids adding an unverified package-lock dependency.
  // Fail with an actionable error when browser CSP or offline mode blocks assets.
  const libraryUrl:string=WHISPER_BROWSER_LIBRARY;
  const imported=await import(/* @vite-ignore */ libraryUrl) as TranscriptionModule;
  const hasGpu=Boolean((navigator as Navigator&{gpu?:unknown}).gpu);
  return imported.pipeline("automatic-speech-recognition",WHISPER_MODEL,
    {device:hasGpu?"webgpu":"wasm",dtype:"q8"});
}
function localCaptionCues(result:WhisperOutput,startMs:number,durationMs:number):CaptionCue[]{
  if((!Array.isArray(result.chunks)||result.chunks.length===0)&&result.text==="")return [];
  if(!Array.isArray(result.chunks)||result.chunks.length===0)
    throw new Error("Local Whisper returned no reliable timestamps; this clip was not saved.");
  return result.chunks.map(part=>{
    const first=part.timestamp?.[0],last=part.timestamp?.[1];
    if(typeof first!=="number"||typeof last!=="number"||
      !Number.isFinite(first)||!Number.isFinite(last)||first<0||last<=first||
      last*1000>durationMs+1000||!part.text?.trim())
      throw new Error("Whisper returned an invalid timed speech chunk.");
    return {startMs:startMs+Math.round(first*1000),
      endMs:startMs+Math.min(durationMs,Math.round(last*1000)),
      rawSpeaker:"Local Whisper",text:part.text.trim()};
  });
}
async function checksum(source:File,speakerId:string,startMs:number,model:string):Promise<string>{
  const bytes=await source.arrayBuffer();
  const part=new Uint8Array(bytes);
  const extra=new TextEncoder().encode("local-whisper:"+speakerId+":"+startMs+":"+model);
  const joined=new Uint8Array(part.byteLength+extra.byteLength);
  joined.set(part);joined.set(extra,part.byteLength);
  const hash=new Uint8Array(await crypto.subtle.digest("SHA-256",joined));
  return Array.from(hash,b=>b.toString(16).padStart(2,"0")).join("");
}
export function SessionRecapLocalWhisper({campaignId,recapId,onSaved}:{
  campaignId:string;recapId:string;onSaved:()=>void;
}) {
  const [speakers,setSpeakers]=useState<RecapSpeakerAssociation[]>([]);
  const [speakerId,setSpeakerId]=useState("");
  const [file,setFile]=useState<File|null>(null);
  const [wav,setWav]=useState<PcmWav|null>(null);
  const [chunks,setChunks]=useState<WavChunk[]>([]);
  const [busy,setBusy]=useState(false);
  const [done,setDone]=useState(0);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  const [approved,setApproved]=useState(false);
  const [autoResume,setAutoResume]=useState(false);
  const [restored,setRestored]=useState(false);
  const resumedOnce=useRef(false);
  const stop=useRef(false);
  const abort=useRef<AbortController|null>(null);
  const base="/api/campaigns/"+encodeURIComponent(campaignId)+"/session-recaps/transcript/local";
  const savedKey=localHandleKey(campaignId,recapId);
  useEffect(()=>{
    let disposed=false;
    void (async()=>{
      try{
        const prefs=localStorage.getItem("twe-local-resume:"+savedKey);
        if(!prefs)return;
        const parsed=JSON.parse(prefs) as {speakerId?:string;enabled?:boolean};
        if(!parsed.enabled||!parsed.speakerId)return;
        setAutoResume(true);setSpeakerId(parsed.speakerId);setApproved(true);
        const handle=await readRememberedLocalRecapFile(savedKey);
        if(!handle||disposed)return;
        if(await handle.queryPermission({mode:"read"})!=="granted"){
          setMessage("The browser needs you to reauthorize the saved WAV file to resume.");
          return;
        }
        const original=await handle.getFile();
        const format=await inspectPcmWavUpload(original);
        const parts=planPcmWavUploadChunks(format,4*1024*1024);
        if(disposed)return;
        setFile(original);setWav(format);setChunks(parts);setRestored(true);
        setMessage("Saved recording was reopened. Local transcription will resume from verified checkpoints.");
      }catch{
        if(!disposed)setMessage("Could not automatically access the earlier audio. Re-select the file to resume.");
      }
    })();
    return ()=>{disposed=true;};
  },[savedKey]);
  useEffect(()=>{
    if(restored&&autoResume&&!resumedOnce.current&&file&&wav&&chunks.length&&speakerId&&approved&&!busy){
      resumedOnce.current=true;
      void process();
    }
    // This resumes once per mount only after the recording handle is reauthorized.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[restored,autoResume,file,wav,chunks,speakerId,approved,busy]);
  async function rememberFile(){
    if(!speakerId||!approved)return;
    try{
      const handle=await requestLocalRecapFileHandle();
      if(!handle){
        setMessage("Persistent file handles aren't supported by this browser. Choose the WAV manually next time.");
        return;
      }
      const next=await handle.getFile();
      const format=await inspectPcmWavUpload(next);
      const parts=planPcmWavUploadChunks(format,4*1024*1024);
      await rememberLocalRecapFile(savedKey,handle);
      localStorage.setItem("twe-local-resume:"+savedKey,
        JSON.stringify({speakerId,enabled:true}));
      setAutoResume(true);setFile(next);setWav(format);setChunks(parts);
      setRestored(false);setMessage("Local file handle remembered. TWE will try resuming automatically next visit.");
    }catch(cause){
      setError(cause instanceof Error?cause.message:"Could not remember the recording.");
    }
  }
  async function forgetFile(){
    await clearRememberedLocalRecapFile(savedKey);
    localStorage.removeItem("twe-local-resume:"+savedKey);
    setAutoResume(false);setRestored(false);setMessage("Saved local file permission was cleared.");
  }

  useEffect(()=>{
    const controller=new AbortController();
    void fetch("/api/campaigns/"+encodeURIComponent(campaignId)+"/recap-imports",
      {cache:"no-store",signal:controller.signal})
      .then(async response=>{
        const data=await response.json() as {speakers?:RecapSpeakerAssociation[];error?:string};
        if(!response.ok)throw new Error(data.error||"Could not load campaign speakers.");
        return data.speakers??[];
      }).then(values=>{if(!controller.signal.aborted)setSpeakers(values);})
      .catch(reason=>{if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:"Speakers unavailable.");});
    return ()=>{controller.abort();stop.current=true;abort.current?.abort();};
  },[campaignId]);
  async function choose(event:ChangeEvent<HTMLInputElement>){
    const selected=event.currentTarget.files?.[0]??null;
    event.currentTarget.value="";
    setFile(null);setWav(null);setChunks([]);setDone(0);setError("");setMessage("");
    if(!selected)return;
    try{
      const data=await inspectPcmWavUpload(selected);
      const plan=planPcmWavUploadChunks(data,4*1024*1024);
      setFile(selected);setWav(data);setChunks(plan);
      setMessage("Ready. Finished chunks will be detected and skipped on later visits.");
    }catch(cause){setError(cause instanceof Error?cause.message:"Unsupported audio file.");}
  }
  async function process(){
    if(!file||!wav||!speakerId||!approved||busy)return;
    setBusy(true);setError("");setMessage("");stop.current=false;setDone(0);
    const controller=new AbortController();abort.current=controller;
    let complete=0;
    try{
      // Model download occurs only after an explicit user action.
      const transcribe=await loadLocalWhisper();
      const ctx=new AudioContext({sampleRate:16000});
      try{
        for(let i=0;i<chunks.length;i++){
          if(stop.current||controller.signal.aborted)break;
          const slice=buildPcmWavUpload(file,wav,chunks[i],i);
          const receipt=await checksum(slice,speakerId,chunks[i].startMs,WHISPER_MODEL);
          const endpoint=base+"?recapId="+encodeURIComponent(recapId)+"&receipt="+receipt;
          const prior=await fetch(endpoint,{cache:"no-store",signal:controller.signal});
          const checked=await prior.json() as {complete?:boolean;error?:string};
          if(!prior.ok)throw new Error(checked.error||"Could not verify saved chunk.");
          if(!checked.complete){
            const audio=await ctx.decodeAudioData(await slice.arrayBuffer());
            if(audio.numberOfChannels<1)throw new Error("Unable to decode WAV audio.");
            const samples=audio.getChannelData(0);
            const result=await transcribe(samples,{return_timestamps:true,chunk_length_s:30});
            const cues=localCaptionCues(result,chunks[i].startMs,
              chunks[i].endMs-chunks[i].startMs);
            const response=await fetch(base,{method:"POST",signal:controller.signal,
              headers:{"content-type":"application/json"},
              body:JSON.stringify({recapId,speakerId,receipt,cues,approved:true})});
            const saved=await response.json() as {saved?:boolean;error?:string};
            if(!response.ok||!saved.saved)throw new Error(saved.error||"Could not save local transcript chunk.");
            onSaved();
          }
          complete++;setDone(complete);
        }
      }finally{await ctx.close();}
      setMessage(stop.current?"Paused safely. Reselect the same WAV later to resume.":
        "Local transcription completed. Review and publish the private transcript.");
    }catch(cause){
      if(!controller.signal.aborted)setError((cause instanceof Error?cause.message:"Local transcription failed.")+
        " Completed chunks remain saved. Re-select the same file to resume.");
    }finally{setBusy(false);abort.current=null;}
  }
  return <section className="session-recap-reading" aria-label="Local Whisper on-device transcription">
    <h4>Local Whisper (experimental)</h4>
    <p className="campaign-empty-copy">
      Runs on this device using a small open-source Whisper model. No API key, inference billing,
      or audio upload. The model and JavaScript load from third-party CDNs on first use.
      Keep this browser and computer awake. Finished chunks are saved privately to TWE.
      If you leave, TWE skips previously completed chunks. On compatible browsers,
      opt in to remembering a file handle; TWE can restart on return if read permission persists.
      Otherwise it will ask you to select or reauthorize the WAV.
    </p>
    <label>Uncompressed PCM WAV recording
      <input type="file" accept=".wav,audio/wav" disabled={busy}
        onChange={event=>void choose(event)}/></label>
    {file&&<p className="campaign-empty-copy">{file.name} · {chunks.length} small chunks</p>}
    <div className="session-recap-form-actions">
      <button type="button" className="campaign-secondary" disabled={busy||!speakerId||!approved}
        onClick={()=>void rememberFile()}>Choose WAV and remember for auto-resume</button>
      {autoResume&&<button type="button" className="campaign-quiet" disabled={busy}
        onClick={()=>void forgetFile()}>Forget saved file permission</button>}
    </div>
    <label>Speaker for this isolated recording
      <select value={speakerId} disabled={busy} onChange={event=>setSpeakerId(event.target.value)}>
        <option value="">Select a confirmed voice</option>
        {speakers.map(person=><option key={person.id} value={person.id}>{person.displayName}</option>)}
        <option value="guest">Guest</option>
      </select>
    </label>
    <label style={{display:"block",marginBlock:"0.5rem"}}>
      <input type="checkbox" checked={approved} disabled={busy}
        onChange={event=>setApproved(event.target.checked)}/>
      I understand the model is experimental and will download to this browser.
    </label>
    <div className="session-recap-form-actions">
      <button type="button" className="campaign-primary"
        disabled={busy||!file||!speakerId||!approved} onClick={()=>void process()}>
        {busy?"Transcribing locally…":"Start / resume Local Whisper"}
      </button>
      {busy&&<button type="button" className="campaign-secondary"
        onClick={()=>{stop.current=true;setMessage("Stopping after current audio chunk.");}}>
        Stop after current chunk
      </button>}
    </div>
    {busy&&<p role="status">Completed {done} of {chunks.length} chunks. Keep this page open.</p>}
    {message&&<p role="status">{message}</p>}
    {error&&<p role="alert" className="campaign-error">{error}</p>}
  </section>;
}
