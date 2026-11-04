"use client";

import {useRef,useState} from "react";
import {browserRecapFile} from "@/lib/campaigns/recap-browser-preparation";
import type {RecapPreparation} from "@/lib/campaigns/recap-stage-workflow";
import type {SherpaTurn} from "@/lib/campaigns/recap-sherpa-alignment";

type WorkerReply={type:"ready"|"result"|"error";message?:string;turns?:SherpaTurn[]};
function runSherpa(worker:Worker,message:{type:"init"}|{type:"process";samples:Float32Array},
  timeoutMs:number,signal?:AbortSignal):Promise<WorkerReply>{
  return new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>{cleanup();reject(Error("Sherpa timed out. Your saved transcript was not changed."));},timeoutMs);
    const cleanup=()=>{clearTimeout(timeout);signal?.removeEventListener("abort",cancel);worker.removeEventListener("message",receive);
      worker.removeEventListener("error",fail);};
    const cancel=()=>{cleanup();reject(Error("Speaker detection stopped. No transcript text was changed."));};
    if(signal?.aborted){cancel();return;}
    signal?.addEventListener("abort",cancel,{once:true});
    const receive=(event:MessageEvent<WorkerReply>)=>{
      const result=event.data;
      if(!result||!["ready","result","error"].includes(result.type))return;
      cleanup();
      if(result.type==="error")reject(Error(result.message||"Sherpa failed."));
      else resolve(result);
    };
    const fail=(event:ErrorEvent)=>{cleanup();reject(Error(event.message||"Speaker model failed to load."));};
    worker.addEventListener("message",receive);
    worker.addEventListener("error",fail);
    if(message.type==="process")worker.postMessage(message,[message.samples.buffer]);
    else worker.postMessage(message);
  });
}
export function SessionRecapSherpaReview({campaignId,recapId,preparation,onChanged}:{
  campaignId:string;recapId:string;preparation:RecapPreparation;onChanged:()=>void;
}){
  const [partIndex,setPartIndex]=useState(0);
  const [busy,setBusy]=useState(false);
  const [status,setStatus]=useState("");
  const [error,setError]=useState("");
  const [consent,setConsent]=useState(false);
  const worker=useRef<Worker|null>(null);
  const abort=useRef<AbortController|null>(null);
  const base="/api/campaigns/"+encodeURIComponent(campaignId)+"/session-recaps";
  async function process(){
    if(busy||!consent)return;
    const part=preparation.parts[partIndex];
    if(!part?.localKey){setError("Reopen the original prepared audio in Step 2 first.");return;}
    const controller=new AbortController();abort.current=controller;
    setBusy(true);setError("");setStatus("Checking saved transcript and prepared section…");
    try{
      const current=await fetch(base+"/transcript?recapId="+encodeURIComponent(recapId),{cache:"no-store"});
      const saved=await current.json() as {updatedAt?:string;cues?:{
        rawSpeaker:string;speakerName:string;startMs:number;endMs:number;}[];error?:string};
      if(!current.ok||!saved.updatedAt||!saved.cues?.length)
        throw Error(saved.error||"Finish the Whisper transcription before diarization.");
      // Local clusters are per section, not a durable identification of a person.
      // Require review before the next section to avoid 32+ distinct voice labels.
      const pending=new Set(saved.cues.map(c=>c.rawSpeaker)
        .filter(label=>/^Speaker [1-9][0-9]*(?: · section [1-9][0-9]*)?$/u.test(label)));
      if(pending.size)throw Error("Identify the detected voices in the transcript review above before processing another section.");
      if(part.durationMs>15*60_000)
        throw Error("This section is longer than 15 minutes. Prepare shorter Local Whisper WAV sections.");
      const audio=await browserRecapFile(part.localKey);
      if(audio.size!==part.bytes)throw Error("The prepared audio has changed. Reprepare it before detecting speakers.");
      setStatus("Decoding audio locally…");
      const context=new AudioContext({sampleRate:16000});
      let samples:Float32Array;
      try{
        const buffer=await context.decodeAudioData(await audio.arrayBuffer());
        if(buffer.numberOfChannels<1)throw Error("Could not decode local audio.");
        samples=new Float32Array(buffer.getChannelData(0));
      }finally{await context.close();}
      setStatus("Downloading Sherpa's open-source model into this browser (first use may be large)…");
      const instance=new Worker("/recap-sherpa-worker.js");
      worker.current=instance;
      try{
        await runSherpa(instance,{type:"init"},180_000,controller.signal);
        setStatus("Detecting voices locally. This can take several minutes…");
        const result=await runSherpa(instance,{type:"process",samples},30*60_000,controller.signal);
        if(!Array.isArray(result.turns)||!result.turns.length)
          throw Error("Sherpa found no speaker turns. Your Whisper transcript was preserved.");
        const body={recapId,updatedAt:saved.updatedAt,partIndex,startMs:part.startMs,
          endMs:part.startMs+part.durationMs,turns:result.turns};
        setStatus("Saving detected speaker labels without changing Whisper's words…");
        const response=await fetch(base+"/transcript/diarization",{
          method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify(body),
        });
        const applied=await response.json() as {
          saved?:boolean;changed?:number;uncertain?:number;error?:string};
        if(!response.ok||!applied.saved)throw Error(applied.error||"Speaker labels could not be saved.");
        setStatus("Labeled "+(applied.changed??0)+" transcript cues. "+
          (applied.uncertain??0)+" remain uncertain. Identify each voice above, then continue to the next section.");
        onChanged();
      }finally{instance.terminate();if(worker.current===instance)worker.current=null;}
    }catch(e){setError(e instanceof Error?e.message:"Speaker detection failed. Your transcript is still saved.");}
    finally{setBusy(false);abort.current=null;}
  }
  if(preparation.provider!=="local-whisper")return null;
  return <section className="session-recap-reading" aria-label="Optional Sherpa speaker detection">
    <h4>Identify voices with Sherpa (experimental)</h4>
    <p className="campaign-empty-copy">
      Keep Whisper's words and timestamps. Sherpa analyzes the saved WAV locally, one prepared
      section at a time. Its speaker numbers are only consistent within that section.
      After each section, confirm voices above before processing the next one.
      Your recording is not uploaded to Sherpa, but model files are downloaded from
      <a href="https://huggingface.co/Transcripta/sherpa-onnx-speaker-diarization-wasm" target="_blank" rel="noopener noreferrer">Hugging Face (model and licenses)</a>. The tab must remain open while processing.
    </p>
    <label>Prepared section
      <select disabled={busy} value={partIndex} onChange={e=>setPartIndex(Number(e.target.value))}>
        {preparation.parts.map((part,index)=><option key={index} value={index}>
          Section {index+1} of {preparation.parts.length} ({Math.round(part.startMs/60000)} min)
        </option>)}
      </select>
    </label>
    <label><input type="checkbox" checked={consent} disabled={busy}
      onChange={e=>setConsent(e.target.checked)}/>
      Download and run the experimental speaker model on this device.
    </label>
    <div className="session-recap-form-actions">
      <button type="button" className="campaign-primary" disabled={busy||!consent}
        onClick={()=>void process()}>{busy?"Detecting speakers…":"Detect speakers in this section"}</button>
      {busy&&<button type="button" className="campaign-secondary" onClick={()=>{
        abort.current?.abort();worker.current?.terminate();worker.current=null;
        setStatus("Stopped. Saved transcript remains intact.");
      }}>Stop model</button>}
    </div>
    {status&&<p role="status">{status}</p>}
    {error&&<p role="alert" className="campaign-error">{error}</p>}
  </section>;
}
