"use client";

import {useCallback,useEffect,useState,type ChangeEvent} from "react";
import {SessionRecapAudioUploader} from "./session-recap-audio-uploader";
import {SessionRecapStagedTranscriber} from "./session-recap-staged-transcriber";
import {SessionRecapFullTranscriptManager} from "./session-recap-full-transcript-manager";
import {SessionRecapStagedTranscriptReview} from "./session-recap-staged-transcript-review";
import {SessionRecapStagedWriter} from "./session-recap-staged-writer";
import {audioFileDuration,browserRecapFile,browserRecapKey,
  saveBrowserRecapFile,prepareRecapWithFFmpeg,saveUnchangedAudio,
  recommendedRecapPreparation,stopRecapFFmpeg} from "@/lib/campaigns/recap-browser-preparation";
import type {RecapSource,RecapTranscriber,RecapWriter,RecapWorkflow,PreparedPart,
  RecapWorkflowAction} from "@/lib/campaigns/recap-stage-workflow";

type Asset={id:string;label:string;status:string;byteSize:number|null;mimeType:string|null;
  durationMs:number|null};
type Data={workflow:RecapWorkflow;assets:Asset[];
  transcript:{count:number;updatedAt:string|null;published:boolean};error?:string};
const names=["Upload","Prepare","Transcribe","Review","Write"];
const NO_ASSETS:Asset[]=[];
const transcriptionOptions:{id:RecapTranscriber;name:string;description:string}[]=[
  {id:"groq",name:"Groq Whisper",description:"Cloud · Personal Groq key · Accurate timestamps · Quotas apply"},
  {id:"gemini",name:"Google Gemini",description:"Cloud · Personal Gemini key · Audio processing may be less reliable"},
  {id:"local-whisper",name:"Local Whisper",description:"Free on this device · No AI account · Slower and experimental"},
  {id:"import",name:"Import SRT / WebVTT",description:"Free · Use an existing Craig or other timestamped transcript"},
];
const writerOptions:{id:RecapWriter;name:string;description:string;models:{id:string;name:string}[]}[]=[
  {id:"gemini",name:"Gemini Flash",description:"Cloud · Text-only · GM-owned API quota",models:[
    {id:"gemini-3.8-flash",name:"Gemini 3.8 Flash"}]},
  {id:"groq",name:"Groq GPT-OSS",description:"Cloud · Text-only · GM-owned API quota",models:[
    {id:"openai/gpt-oss-120b",name:"GPT-OSS 120B"},
    {id:"openai/gpt-oss-20b",name:"GPT-OSS 20B"}]},
  {id:"local",name:"Local browser AI (WebLLM)",description:"Free · No other account · WebGPU needed; may be slow",models:[
    {id:"Qwen2.5-1.5B-Instruct-q4f16_1-MLC",name:"Qwen2.5 1.5B — more capable"},
    {id:"Qwen2.5-0.5B-Instruct-q4f16_1-MLC",name:"Qwen2.5 0.5B — less memory"}]},
  {id:"manual",name:"Write manually",description:"Free · No AI needed",models:[
    {id:"manual",name:"Manual writing"}]},
];
const unavailableMessage="Previous stages remain saved. No AI request was sent.";
function sizeText(n:number){return n>=1024*1024?(n/1024/1024).toFixed(1)+" MiB":
  (n/1024).toFixed(0)+" KiB";}
export function SessionRecapStagedWizard({campaignId,recapId,onDraft,onUploadBusy}:{
  campaignId:string;recapId:string;onDraft:(markdown:string)=>boolean;
  onUploadBusy?:(busy:boolean)=>void;
}){
  const base="/api/campaigns/"+encodeURIComponent(campaignId)+"/session-recaps/workflow";
  const [data,setData]=useState<Data|null>(null);
  const [step,setStep]=useState(0);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [refreshing,setRefreshing]=useState(false);
  const [sourceChoice,setSourceChoice]=useState("");
  const [browserFile,setBrowserFile]=useState<File|null>(null);
  const [provider,setProvider]=useState<RecapTranscriber>("groq");
  const [method,setMethod]=useState<"original"|"ffmpeg"|"import">("ffmpeg");
  const [prepared,setPrepared]=useState<PreparedPart[]>([]);
  const [preparedProvider,setPreparedProvider]=useState<RecapTranscriber|null>(null);
  const [progress,setProgress]=useState("");
  const [transcriptReviewed,setTranscriptReviewed]=useState(false);
  const [checkedEnding,setCheckedEnding]=useState(false);
  const [writerProvider,setWriterProvider]=useState<RecapWriter>("gemini");
  const [writerModel,setWriterModel]=useState("gemini-3.8-flash");
  const [detail,setDetail]=useState<"brief"|"standard"|"detailed">("detailed");
  const [approvedDraft,setApprovedDraft]=useState("");
  const [connections,setConnections]=useState<{gemini:boolean;groq:boolean}>({gemini:false,groq:false});
  const workflow=data?.workflow;
  const assets=data?.assets??NO_ASSETS;
  const currentSource=workflow?.source;
  const currentPreparation=workflow?.preparation;
  const eligible=assets.filter(x=>x.status==="ready"&&typeof x.byteSize==="number");
  const selectedAsset=eligible.find(x=>x.id===sourceChoice)||null;
  const recommendedWriter=connections.gemini?"gemini":connections.groq?"groq":"local";

  const refresh=useCallback(async()=>{
    const response=await fetch(base+"?recapId="+encodeURIComponent(recapId),{cache:"no-store"});
    const value=await response.json() as Data;
    if(!response.ok||!value.workflow)throw Error(value.error||"Could not load saved recap steps.");
    setData(value);return value;
  },[base,recapId]);
  useEffect(()=>{
    let mounted=true;
    void fetch(base+"?recapId="+encodeURIComponent(recapId),{cache:"no-store"})
      .then(async response=>{
        const value=await response.json() as Data;
        if(!response.ok||!value.workflow)throw Error(value.error||"Recap workflow unavailable.");
        return value;
      }).then(value=>{
        if(!mounted)return;
        setData(value);
        const w=value.workflow;
        if(w.writer){setWriterProvider(w.writer.provider);setWriterModel(w.writer.model);setDetail(w.writer.detail);}
        else if(w.preparation){setProvider(w.preparation.provider);setMethod(w.preparation.method);}
        if(w.source?.kind==="drive")setSourceChoice(w.source.id);
        else {
          const ready=value.assets.filter(asset=>asset.status==="ready"&&typeof asset.byteSize==="number");
          if(ready.length===1)setSourceChoice(ready[0].id);
        }
        const stage=w.approvedDraftId?4:w.transcriptApprovedAt?4:
          w.preparation?(value.transcript.count>0?3:2):w.sourceApprovedAt?1:0;
        setStep(stage);
      }).catch(e=>{if(mounted)setError(e instanceof Error?e.message:"Recap steps unavailable.");})
      .finally(()=>{if(mounted)setLoading(false);});
    void Promise.all(["gemini","groq"].map(async name=>{
      try{
        const response=await fetch("/api/account/recap-ai/"+name);
        const data=await response.json() as {connection?:{status?:string}};
        return [name,data.connection?.status==="connected"] as const;
      }catch{return [name,false] as const;}
    })).then(values=>{if(mounted)setConnections(Object.fromEntries(values) as {gemini:boolean;groq:boolean});});
    const handler=(event:Event)=>{void (async()=>{
      const detail=(event as CustomEvent<{recapId?:string;assetId?:string}>).detail;
      if(detail?.recapId&&detail.recapId!==recapId)return;
      const latest=await refresh();
      const ready=latest.assets.filter(a=>a.status==="ready"&&typeof a.byteSize==="number");
      const asset=ready.find(a=>a.id===detail?.assetId)??(ready.length===1?ready[0]:null);
      setStep(0);
      if(asset){
        setSourceChoice(asset.id);setBrowserFile(null);
        setNotice("Recording uploaded and ready. Approve it below to continue.");
      }else setNotice("Upload finished, but Drive verification is pending. Refresh saved progress to check again.");
    })().catch(e=>setError(e instanceof Error?e.message:"Could not refresh the uploaded recording."));};
    window.addEventListener("twe:recap-audio-attached",handler);
    return()=>{mounted=false;window.removeEventListener("twe:recap-audio-attached",handler);};
  },[recapId,base,refresh]);
  const recommendedTranscriber:RecapTranscriber=currentSource?.kind==="browser"&&
    !connections.gemini&&!connections.groq?"local-whisper":
    connections.groq?"groq":connections.gemini?"gemini":"local-whisper";
  const recommendedMethod=currentSource?recommendedRecapPreparation(provider,{
    name:currentSource.name,bytes:currentSource.bytes,
    durationMs:assets.find(x=>x.id===currentSource.id)?.durationMs??null,
  }):"ffmpeg";
  const chosenWriter=writerOptions.find(x=>x.id===writerProvider)!;
  const stageValid=[Boolean(currentSource&&workflow?.sourceApprovedAt)||currentPreparation?.provider==="import",
    Boolean(currentPreparation),Boolean(currentPreparation&&data?.transcript.count),
    Boolean(workflow?.transcriptApprovedRevision),Boolean(workflow?.approvedDraftId)];
  const canVisit=(target:number)=>target===0||target===1&&(stageValid[0]||provider==="import")||
    target>=2&&Boolean(stageValid[target-1]);

  async function apply(action:RecapWorkflowAction,extra:Record<string,unknown>={}){
    if(!data)throw Error("Workflow is still loading.");
    const response=await fetch(base,{method:"POST",headers:{"content-type":"application/json"},
      body:JSON.stringify({...action,recapId,revision:data.workflow.revision,...extra})});
    const result=await response.json() as Data;
    if(!response.ok||!result.workflow)throw Error(result.error||"Could not save this stage.");
    setData(old=>({...result,assets:old?.assets??[],transcript:result.transcript??old!.transcript}));
    return result;
  }
  async function chooseBrowserSource(event:ChangeEvent<HTMLInputElement>){
    const file=event.currentTarget.files?.[0]??null;
    event.currentTarget.value="";
    if(!file)return;
    setBrowserFile(file);setError("");setSourceChoice("");
  }
  async function approveSource(){
    if(busy||!data)return;
    setBusy(true);setError("");setNotice("");
    try{
      let source:RecapSource;
      let localVerified=false;
      if(browserFile){
        const ext=browserFile.name.toLowerCase();
        if(!/\.(?:m4a|mp3|mp4|wav|flac|ogg|webm|aac)$/u.test(ext))
          throw Error("Choose a supported audio recording.");
        await audioFileDuration(browserFile);
        const key=await browserRecapKey(campaignId,recapId,"source",browserFile.name,
          String(browserFile.size),String(browserFile.lastModified));
        setProgress("Saving original recording in this browser…");
        await saveBrowserRecapFile(key,browserFile,(done,total)=>setProgress(
          "Saving original recording "+Math.round(done/total*100)+"%"));
        source={kind:"browser",id:key,name:browserFile.name,bytes:browserFile.size,
          mimeType:browserFile.type||"application/octet-stream"};
        localVerified=(await browserRecapFile(key)).size===browserFile.size;
      }else if(selectedAsset){
        source={kind:"drive",id:selectedAsset.id,name:selectedAsset.label,
          bytes:selectedAsset.byteSize!,mimeType:selectedAsset.mimeType||"audio/mp4"};
      }else throw Error("Upload a recording to Google Drive or choose a local audio file.");
      await apply({action:"approve-source",source},{localVerified});
      setPrepared([]);setPreparedProvider(null);setProgress("");
      setMethod(recommendedRecapPreparation(provider,{
        name:source.name,bytes:source.bytes,
        durationMs:assets.find(x=>x.id===source.id)?.durationMs??null,
      }));
      setNotice("Recording approved and saved. Choose a transcription method in Step 2.");
      setStep(1);
    }catch(e){setError((e instanceof Error?e.message:"Unable to approve recording.")+" "+unavailableMessage);}
    finally{setBusy(false);}
  }
  async function sourceFile(){
    if(!currentSource)throw Error("Approve an original recording first.");
    if(currentSource.kind==="browser"){
      const file=await browserRecapFile(currentSource.id);
      if(file.size!==currentSource.bytes)throw Error("Locally saved original is missing or changed.");
      return new File([file],currentSource.name,{type:currentSource.mimeType});
    }
    const endpoint="/api/campaigns/"+encodeURIComponent(campaignId)+"/session-recaps/audio/"+
      encodeURIComponent(currentSource.id)+"/stream";
    setProgress("Reading original recording privately from Google Drive…");
    const response=await fetch(endpoint,{cache:"no-store"});
    if(!response.ok)throw Error("Could not read the original Drive recording. Reconnect Drive if required.");
    const blob=await response.blob();
    if(blob.size!==currentSource.bytes)throw Error("Drive returned an incomplete recording.");
    return new File([blob],currentSource.name,{type:currentSource.mimeType});
  }
  async function prepare(){
    if((!currentSource&&provider!=="import")||busy)return;
    if(currentPreparation&&
      !window.confirm("Create another audio preparation? The approved transcript may need to be reviewed again. Existing recap drafts are preserved."))return;
    setBusy(true);setError("");setNotice("");setProgress("Preparing…");
    try{
      let parts:PreparedPart[];
      if(provider==="import"){
        parts=[{name:"transcript-import.wav",bytes:128,
          mimeType:"audio/wav",startMs:0,
          durationMs:1_000,
          localKey:null}];
      }else{
        if(!currentSource)throw Error("Approve a recording before audio preparation.");
        const source=await sourceFile();
        parts=method==="original"?
          await saveUnchangedAudio(source,{provider,campaignId,recapId,sourceId:currentSource.id}):
          await prepareRecapWithFFmpeg(source,{provider,campaignId,recapId,
            sourceId:currentSource.id,
            onProgress:(completed,total)=>setProgress(
              "Prepared and saved "+completed+" of "+total+" parts")});
      }
      for(const part of parts){
        if(part.localKey&&(await browserRecapFile(part.localKey)).size!==part.bytes)
          throw Error("A prepared audio part could not be verified after saving.");
      }
      setPrepared(parts);setPreparedProvider(provider);
      setNotice("Preparation complete. "+parts.length+
        " section(s) saved. Review and approve them before starting transcription.");
      setProgress("");
    }catch(e){setError((e instanceof Error?e.message:"Preparation failed.")+
      " Already prepared sections remain available for a retry.");}
    finally{setBusy(false);}
  }
  async function approvePreparation(){
    if(!prepared.length||preparedProvider!==provider||busy)return;
    setBusy(true);setError("");
    try{
      await apply({action:"save-preparation",provider,method:provider==="import"?"import":method,parts:prepared});
      setNotice("Preparation approved and saved. Step 3 will not run until you start transcription.");
      setStep(2);
    }catch(e){setError(e instanceof Error?e.message:"Preparation could not be saved.");}
    finally{setBusy(false);}
  }
  async function approveTranscript(){
    if(!transcriptReviewed||!data||busy)return;
    setBusy(true);setError("");
    try{
      await apply({action:"approve-transcript"});
      setNotice("Transcript approved. Select a recap writer in Step 5.");
      setStep(4);
    }catch(e){setError(e instanceof Error?e.message:"Could not approve transcript.");}
    finally{setBusy(false);}
  }
  async function selectWriter(){
    if(busy)return;
    setBusy(true);setError("");
    try{
      await apply({action:"select-writer",provider:writerProvider,model:writerModel,detail});
      setNotice("Writer choice saved. No AI request has been made.");
    }catch(e){setError(e instanceof Error?e.message:"Could not select writer.");}
    finally{setBusy(false);}
  }
  async function saveDraft(content:string){
    if(busy)return;
    setBusy(true);setError("");
    try{
      await apply({action:"save-draft",content});
      setNotice("New immutable draft version saved. Review and approve it below.");
    }catch(e){setError(e instanceof Error?e.message:"Draft could not be saved.");}
    finally{setBusy(false);}
  }
  async function approveDraft(id:string){
    if(busy)return;
    setBusy(true);setError("");
    try{
      const response=await fetch(base+"?recapId="+encodeURIComponent(recapId)+
        "&draftId="+encodeURIComponent(id),{cache:"no-store"});
      const data=await response.json() as {content?:string;error?:string};
      if(!response.ok||!data.content)throw Error(data.error||"Saved draft not found.");
      if(!onDraft(data.content))throw Error("Existing unsaved editor content was preserved. Save or confirm replacement first.");
      await apply({action:"approve-draft",draftId:id});
      setApprovedDraft(id);
      setNotice("Recap draft approved and copied to the Markdown editor. Publish separately when ready.");
    }catch(e){setError(e instanceof Error?e.message:"Could not approve the draft.");}
    finally{setBusy(false);}
  }
  if(loading)return <section className="session-recap-reading"><p role="status">Loading saved recap workflow…</p></section>;
  return <section className="session-recap-reading" aria-label="Session Recap five-step wizard">
    <div className="session-recap-editor-heading">
      <h3>Session Recap — Guided Workflow</h3>
      <button type="button" className="campaign-secondary" disabled={refreshing||busy}
        onClick={()=>void (async()=>{
          setRefreshing(true);setError("");setNotice("");
          try{
            const value=await refresh();
            const ready=value.assets.filter(a=>a.status==="ready"&&typeof a.byteSize==="number");
            const pending=value.assets.filter(a=>a.status!=="ready");
            setSourceChoice(previous=>ready.some(asset=>asset.id===previous)?previous:
              ready.length===1?ready[0].id:"");
            if(ready.length===1)setNotice("Refreshed: "+ready[0].label+" is ready. Click Approve recording and continue in Step 1.");
            else if(ready.length>1)setNotice("Refreshed: "+ready.length+" recordings are ready. Select the correct one in Step 1.");
            else if(pending.length)setNotice("Refreshed: "+pending.length+" recording(s) found, but none is verified yet. Check the upload status below or use Find Saved Recording.");
            else setNotice("Refreshed: no recordings are attached to this recap. If the upload completed, check that you are editing the same recap; the upload may need recovery. Do not upload again until we check.");
          }catch(e){setError(e instanceof Error?e.message:"Could not refresh saved progress.");}
          finally{setRefreshing(false);}
        })()}>
        {refreshing?"Checking saved progress…":"Refresh saved progress"}
      </button>
    </div>
    <p className="campaign-empty-copy">
      Each step saves its result before the next begins. All AI requests require a separate confirmation.
      You can return later without repeating completed work. The free local options never require another AI account.
    </p>
    <div className="session-recap-form-actions" role="navigation" aria-label="Recap steps">
      {names.map((name,i)=><button key={name} type="button" disabled={busy||!canVisit(i)}
        className={step===i?"campaign-primary":"campaign-secondary"}
        aria-current={step===i?"step":undefined}
        onClick={()=>{setStep(i);setError("");setNotice("");}}>
        {stageValid[i]?"✓ ":""}{i+1}. {name}</button>)}
    </div>
    {step===0&&!data&&<p className="campaign-error" role="alert">
      Saved recap progress could not be loaded. Refresh it above before uploading another recording.
    </p>}
    {step===0&&data&&<>
      <h4>1. Upload and approve the original recording</h4>
      <p className="campaign-empty-copy">Keep the original high-quality recording for players.
        Use your connected Google Drive, or save it locally in this browser without another account.</p>
      <SessionRecapAudioUploader campaignId={campaignId} recapId={recapId}
        onBusyChange={onUploadBusy}/>
      {eligible.length===0&&<p className="campaign-error">No verified Drive recording is available yet. After uploading, wait for confirmation or click Refresh saved progress above. You can also choose a local file below.</p>}
      <div className="session-recap-form-fields">
        <label>Saved Google Drive recording
          <select value={sourceChoice} disabled={busy} onChange={e=>{setSourceChoice(e.target.value);setBrowserFile(null);}}>
            <option value="">Choose saved recording</option>
            {eligible.map(a=><option key={a.id} value={a.id}>{a.label} ({sizeText(a.byteSize!)})</option>)}
          </select>
        </label>
        <label>Or use a local recording (free, no Drive account)
          <input type="file" accept=".m4a,.mp3,.mp4,.wav,.flac,.ogg,.webm,.aac"
            disabled={busy} onChange={e=>void chooseBrowserSource(e)}/>
        </label>
      </div>
      {browserFile&&<p>{browserFile.name} · {sizeText(browserFile.size)} · On this device</p>}
      <p className="campaign-empty-copy">Browser-only recordings stay in this browser&apos;s private storage.
        Clearing website data may erase them; keep your own backup. Players cannot stream local-only recordings.</p>
      {currentSource&&<p className="session-recap-import-notice">Approved source:
        {" "}{currentSource.name} ({currentSource.kind==="drive"?"Google Drive":"this browser"})</p>}
      <button type="button" className="campaign-secondary" disabled={busy} onClick={()=>{setProvider("import");setMethod("import");setStep(1);}}>
        I already have a transcript — skip recording
      </button>
      <button type="button" className="campaign-primary" disabled={busy||(!browserFile&&!selectedAsset)}
        onClick={()=>void approveSource()}>{busy?"Saving…":"Approve recording and continue"}</button>
    </>}
    {step===1&&<>
      <h4>2. Choose transcription provider and prepare audio</h4>
      <p className="campaign-empty-copy">No AI request occurs during preparation.
        Choose your provider now; Step 3 will submit to that same provider.</p>
      {!currentSource&&provider!=="import"?<p className="campaign-error">Approve a recording in Step 1, or choose transcript import.</p>:<>
        <fieldset className="session-recap-speaker-list">
          <legend>Transcription options (all supported choices)</legend>
          {transcriptionOptions.map(option=><label key={option.id} style={{display:"block"}}>
            <input type="radio" name="recap-stage-transcriber" value={option.id}
              checked={provider===option.id} disabled={busy}
              onChange={()=>{setProvider(option.id);
                setMethod(recommendedRecapPreparation(option.id,{
                  name:currentSource?.name??"",bytes:currentSource?.bytes??0,
                  durationMs:assets.find(x=>x.id===currentSource?.id)?.durationMs??null,
                }));
                setPrepared([]);setPreparedProvider(null);}}/>
            {" "}<strong>{option.name}</strong>
            {option.id===recommendedTranscriber?" (recommended for your connected accounts)":""}
            <span className="campaign-empty-copy"> — {option.description}</span>
          </label>)}
        </fieldset>
        <fieldset className="session-recap-speaker-list">
          <legend>Audio preparation</legend>
          {(["original","ffmpeg","import"] as const).map(option=><label key={option} style={{display:"block"}}>
            <input type="radio" name="recap-stage-method" checked={method===option} disabled={busy}
              onChange={()=>{setMethod(option);setPrepared([]);setPreparedProvider(null);}}/>
            {" "}{option==="ffmpeg"?"FFmpeg in this browser (free, compress and split)":
              option==="original"?"Use original unchanged (only when within limits)":
                "Use an existing transcript (no audio conversion)"}
            {option===(provider==="import"?"import":recommendedMethod)?" — recommended":""}
          </label>)}
        </fieldset>
        <p className="campaign-empty-copy">
          {provider==="local-whisper"?
            "Local Whisper currently needs a PCM WAV input. FFmpeg will create manageable WAV sections; keep this page open during conversion.":
            provider==="groq"?"Groq parts will be kept at most 16 MiB and 30 minutes each.":
            provider==="gemini"?"Gemini prepared parts will be at most 11 MiB and 30 minutes each.":
            "Import an existing SRT or WebVTT transcript in Step 3."}
          {" "}FFmpeg processing speed depends on this device; already saved sections can be reused.
        </p>
        <div className="session-recap-form-actions">
          <button type="button" className="campaign-primary" disabled={busy||
            (method==="import"&&provider!=="import")||
            (provider==="import"&&method!=="import")}
            onClick={()=>void prepare()}>{busy?"Preparing…":"Prepare and validate audio"}</button>
          {busy&&method==="ffmpeg"&&<button type="button" className="campaign-secondary"
            onClick={()=>stopRecapFFmpeg()}>Stop conversion</button>}
        </div>
        {progress&&<p role="status">{progress}</p>}
        {prepared.length>0&&<div className="session-recap-reading">
          <h5>Prepared and saved sections ({prepared.length})</h5>
          <p className="campaign-empty-copy">{prepared.map(part=>
            part.name+" ("+sizeText(part.bytes)+")").join(" · ")}</p>
          <button type="button" className="campaign-primary" disabled={busy}
            onClick={()=>void approvePreparation()}>Approve prepared files — Continue to transcription</button>
        </div>}
        {currentPreparation&&<div className="session-recap-import-notice">
          Current approved preparation: {currentPreparation.provider} · {currentPreparation.parts.length} sections.
          <button type="button" className="campaign-secondary"
            onClick={()=>setStep(2)}>Continue to transcription</button>
        </div>}
      </>}
    </>}
    {step===2&&<>
      <h4>3. Transcribe approved audio</h4>
      {!currentPreparation?<p className="campaign-error">Approve prepared audio in Step 2 first.</p>:<>
        <p>Selected in Step 2: <strong>{currentPreparation.provider}</strong>.
          To switch providers, return to Step 2 and prepare appropriate files.</p>
        <SessionRecapStagedTranscriber key={currentPreparation.savedAt}
          campaignId={campaignId} recapId={recapId} preparation={currentPreparation}
          onTranscriptSaved={()=>void refresh()}/>
        <p className="campaign-empty-copy">
          Completed transcription: {data?.transcript.count??0} timestamped cues.
          Review them in Step 4 before proceeding.</p>
        <button type="button" className="campaign-secondary"
          onClick={()=>{void refresh();setStep(3);}}>Review saved transcript</button>
      </>}
    </>}
    {step===3&&<>
      <h4>4. Review and approve transcript</h4>
      <p className="campaign-empty-copy">Confirm spelling, speakers, timestamps, and that the
        beginning and end are included. The complete transcript remains independently saved.</p>
      <p>Saved transcript: <strong>{data?.transcript.count??0} cues</strong>.</p>
      <SessionRecapStagedTranscriptReview key={data?.transcript.updatedAt||"none"}
        campaignId={campaignId} recapId={recapId}
        onChanged={()=>{setTranscriptReviewed(false);setCheckedEnding(false);void refresh();}}/>
      <details className="session-recap-reading">
        <summary>Import or replace a transcript from Craig captions</summary>
        <SessionRecapFullTranscriptManager campaignId={campaignId} recapId={recapId}/>
      </details>
      {workflow?.transcriptApprovedAt&&<p className="session-recap-import-notice">
        Transcript approved at {new Date(workflow.transcriptApprovedAt).toLocaleString()}.
      </p>}
      <label style={{display:"block",marginBlock:"0.75rem"}}>
        <input type="checkbox" checked={transcriptReviewed} disabled={busy}
          onChange={e=>setTranscriptReviewed(e.target.checked)}/>
        {" "}I have reviewed this transcript and approve it as the source for recap writing.
      </label>
      <label style={{display:"block",marginBlock:"0.75rem"}}>
        <input type="checkbox" checked={checkedEnding} disabled={busy}
          onChange={e=>setCheckedEnding(e.target.checked)}/>
        {" "}I verified that the transcript represents the session&apos;s beginning and ending, or I have noted any missing portions.
      </label>
      <button type="button" className="campaign-primary" disabled={busy||!transcriptReviewed||
        !checkedEnding||!data?.transcript.count||!currentPreparation}
        onClick={()=>void approveTranscript()}>Approve transcript — Continue to recap writing</button>
    </>}
    {step===4&&<>
      <h4>5. Choose a writing model and generate a recap</h4>
      {!workflow?.transcriptApprovedRevision?
        <p className="campaign-error">Approve the saved transcript in Step 4 first.</p>:<>
        <fieldset className="session-recap-speaker-list">
          <legend>Recap writer (all supported choices)</legend>
          {writerOptions.map(option=><label key={option.id} style={{display:"block"}}>
            <input type="radio" checked={writerProvider===option.id} disabled={busy}
              name="recap-stage-writer" onChange={()=>{
                setWriterProvider(option.id);setWriterModel(option.models[0].id);
              }}/>
            {" "}<strong>{option.name}</strong>
            {option.id===recommendedWriter?" — recommended":""}
            <span className="campaign-empty-copy"> — {option.description}</span>
          </label>)}
        </fieldset>
        <label>Writing model
          <select disabled={busy} value={writerModel} onChange={e=>setWriterModel(e.target.value)}>
            {chosenWriter.models.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
        <label>Recap detail
          <select disabled={busy} value={detail} onChange={e=>setDetail(e.target.value as typeof detail)}>
            <option value="brief">Brief</option>
            <option value="standard">Standard</option>
            <option value="detailed">Detailed</option>
          </select>
        </label>
        <button type="button" className="campaign-secondary" disabled={busy}
          onClick={()=>void selectWriter()}>Save writer choice (no AI request)</button>
        {workflow.writer&&<div className="session-recap-reading">
          <p>Selected: <strong>{workflow.writer.provider} — {workflow.writer.model}</strong>
            {" · "}{workflow.writer.detail}.</p>
          <SessionRecapStagedWriter key={workflow.writer.provider+workflow.writer.model+
            workflow.writer.detail+workflow.transcriptApprovedRevision}
            campaignId={campaignId} recapId={recapId} provider={workflow.writer.provider}
            model={workflow.writer.model} detail={workflow.writer.detail}
            onSaved={content=>void saveDraft(content)}/>
        </div>}
        {workflow.drafts.length>0&&<div className="session-recap-reading">
          <h5>Saved draft versions</h5>
          <p className="campaign-empty-copy">Previous versions stay available even when
            changing writer or detail level. Nothing overwrites your existing editor text.</p>
          {workflow.drafts.map(d=><div className="session-recap-speaker-entry" key={d.id}>
            <span>{d.provider} · {d.model} · {d.detail} · {new Date(d.savedAt).toLocaleString()}
              {d.id===workflow.approvedDraftId?" ✓ Approved":""}</span>
            <button className="campaign-secondary" type="button" disabled={busy}
              onClick={()=>void approveDraft(d.id)}>
              Review and use this draft
            </button>
          </div>)}
          {approvedDraft&&<p role="status">Draft copied to the Markdown editor.
            Review it and publish with the existing Publish button.</p>}
        </div>}
      </>}
    </>}
    {notice&&<p className="session-recap-import-notice" role="status">{notice}</p>}
    {error&&<p className="campaign-error" role="alert">{error}</p>}
    <div className="session-recap-form-actions">
      <button type="button" className="campaign-secondary" disabled={busy||step===0}
        onClick={()=>setStep(x=>Math.max(0,x-1))}>Previous step</button>
      <button type="button" className="campaign-secondary" disabled={busy||step===4||!canVisit(step+1)}
        onClick={()=>setStep(x=>Math.min(4,x+1))}>Next step</button>
    </div>
  </section>;
}
