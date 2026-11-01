"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {SessionRecapAudioPlayer} from "./session-recap-audio-player";
import {SessionRecapProgress} from "./session-recap-progress";
import {recapAttentionText,recapStageDescriptions} from "@/lib/campaigns/recap-only-recovery";
import {recapQuotaNotice} from "@/lib/campaigns/recap-quota-estimate";
import {parseGeneratedRecapTitle} from "@/lib/campaigns/recap-ai-title";

type Job={
  id:string;audioAssetId:string;status:string;detail:string;model:string;
  generatedMarkdown:string|null;errorCode:string|null;stageErrorCode:string|null;
  stageBytes:number;totalBytes:number|null;canRetry:boolean;
  createdAt:string;updatedAt:string;
  segmentCount?:number;segmentsReady?:number;
};
type Asset={id:string;label:string;status:string;provider:string;durationMs?:number|null;mimeType?:string|null};
type FailureDiagnosis={kind:string;title:string;explanation:string;inputTokens:number|null};
const statusLabel:Record<string,string>={
  pending_upload:"Queued for Gemini — original audio remains in Drive",
  transferring:"Transferring a temporary copy from Drive to Gemini",
  uploaded:"Gemini is preparing its temporary audio file",
  submitting:"Starting AI summarization",
  submitted:"Gemini is analyzing your session — you can close this page",
  ready:"AI recap draft ready for review — not published",
  needs_attention:"Summarization needs attention",
  failed:"Summarization stopped",
};
export function SessionRecapAutoStatus({campaignId,recapId,onDraft,onSuggestedTitle,published=false}:{
  campaignId:string;recapId:string;published?:boolean;
  onDraft:(content:string,updatedAt:string,overwrite:boolean,suggestedTitle:string|null)=>boolean;
  onSuggestedTitle:(title:string)=>void;
}){
  const endpoint="/api/campaigns/"+encodeURIComponent(campaignId)+"/session-recaps/auto-recap";
  const [jobs,setJobs]=useState<Job[]>([]);
  const [assets,setAssets]=useState<Asset[]>([]);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [starting,setStarting]=useState(false);
  const [retrying,setRetrying]=useState(false);
  const [diagnosing,setDiagnosing]=useState(false);
  const [diagnosis,setDiagnosis]=useState<{jobId:string;value:FailureDiagnosis}|null>(null);
  const [confirmAsset,setConfirmAsset]=useState<Asset|null>(null);
  const [defaultDetail,setDefaultDetail]=useState<"brief"|"standard"|"detailed">("detailed");
  const [selectedDetail,setSelectedDetail]=useState<"brief"|"standard"|"detailed">("detailed");
  const [requestId,setRequestId]=useState("");
  const [durations,setDurations]=useState<Record<string,number>>({});
  const [privacy,setPrivacy]=useState(false);
  const [billing,setBilling]=useState(false);
  const [recapUpdatedAt,setRecapUpdatedAt]=useState("");
  const seen=useRef("");
  const cancelRef=useRef<HTMLButtonElement|null>(null);
  useEffect(()=>{
    const controller=new AbortController();
    void fetch("/api/account/recap-preferences",{cache:"no-store",signal:controller.signal})
      .then(async response=>response.ok?await response.json() as {detail?:string}:null)
      .then((result:{detail?:string}|null)=>{
        if(!controller.signal.aborted&&["brief","standard","detailed"].includes(result?.detail??"")){
          const detail=result!.detail as "brief"|"standard"|"detailed";
          setDefaultDetail(detail);setSelectedDetail(detail);
        }
      }).catch(()=>{});
    return()=>controller.abort();
  },[]);
  const refresh=useCallback(async(signal?:AbortSignal)=>{
    const [status,audio]=await Promise.all([
      fetch(endpoint+"?recapId="+encodeURIComponent(recapId),{cache:"no-store",signal}),
      fetch("/api/campaigns/"+encodeURIComponent(campaignId)+"/session-recaps/audio?recapId="+encodeURIComponent(recapId),{cache:"no-store",signal}),
    ]);
    const [result,recordings]=await Promise.all([status.json(),audio.json()]) as [
      {jobs?:Job[];recap?:{updatedAt:string};error?:string},
      {assets?:Asset[];error?:string},
    ];
    if(!status.ok||!Array.isArray(result.jobs))
      throw Error(result.error||"Could not read automatic recap status.");
    if(!audio.ok||!Array.isArray(recordings.assets))
      throw Error(recordings.error||"Could not read attached audio.");
    if(!signal?.aborted){
      setJobs(result.jobs);
      setAssets(recordings.assets);
      setRecapUpdatedAt(result.recap?.updatedAt||"");
    }
  },[campaignId,recapId,endpoint]);
  useEffect(()=>{
    const controller=new AbortController();
    const load=()=>{void refresh(controller.signal).catch(e=>{
      if(!controller.signal.aborted)setError(e instanceof Error?e.message:"Recap status unavailable.");
    });};
    const first=window.setTimeout(load,0);
    const interval=window.setInterval(load,12000);
    const uploaded=(event:Event)=>{
      if((event as CustomEvent<{recapId:string}>).detail?.recapId===recapId)load();
    };
    window.addEventListener("twe:recap-audio-attached",uploaded);
    return ()=>{
      controller.abort();window.clearTimeout(first);window.clearInterval(interval);
      window.removeEventListener("twe:recap-audio-attached",uploaded);
    };
  },[recapId,refresh]);
  useEffect(()=>{
    const job=jobs.find(x=>x.status==="ready"&&x.generatedMarkdown);
    if(!published&&job?.generatedMarkdown&&seen.current!==job.id){
      seen.current=job.id;
      const parsed=parseGeneratedRecapTitle(job.generatedMarkdown);
      onDraft(parsed.content,recapUpdatedAt,false,parsed.title);
    }
  },[jobs,onDraft,recapUpdatedAt,published]);
  useEffect(()=>{
    if(!confirmAsset)return;
    cancelRef.current?.focus();
    const close=(event:KeyboardEvent)=>{
      if(event.key==="Escape"&&!starting){event.preventDefault();setConfirmAsset(null);}
    };
    window.addEventListener("keydown",close);
    return ()=>window.removeEventListener("keydown",close);
  },[confirmAsset,starting]);
  function openConfirmation(asset:Asset){
    if(starting)return;
    setConfirmAsset(asset);setSelectedDetail(defaultDetail);setRequestId(crypto.randomUUID());
    setPrivacy(false);setBilling(false);setError("");setNotice("");
  }
  async function summarize(){
    if(!confirmAsset||!privacy||!billing||starting)return;
    const asset=confirmAsset;
    setStarting(true);setError("");setNotice("");
    try{
      const response=await fetch(endpoint,{method:"POST",headers:{"content-type":"application/json"},
        body:JSON.stringify({recapId,assetId:asset.id,confirmed:true,
          privacyApproved:true,billingApproved:true,detail:selectedDetail,requestId})});
      const data=await response.json() as {
        queued?:boolean;created?:boolean;alreadyQueued?:boolean;error?:string;
      };
      if(!response.ok||!data.queued)throw Error(data.error||"Could not start Gemini summarization.");
      setConfirmAsset(null);
      setNotice(data.alreadyQueued
        ?"This recording was already submitted; no duplicate request was created."
        :"Auto Summarize confirmed. TWE will process the recording in the background using your Gemini account.");
      await refresh();
    }catch(e){setError(e instanceof Error?e.message:"Could not start summarization.");}
    finally{setStarting(false);}
  }
  async function diagnoseFailure(job:Job){
    if(diagnosing||job.status!=="needs_attention"||job.errorCode!=="interaction_failed")return;
    setDiagnosing(true);setError("");setDiagnosis(null);
    try{
      const response=await fetch(endpoint+"/diagnose",{
        method:"POST",headers:{"content-type":"application/json"},
        body:JSON.stringify({recapId,jobId:job.id}),
      });
      const data=await response.json() as {diagnosis?:FailureDiagnosis;error?:string};
      if(!response.ok||!data.diagnosis)
        throw Error(data.error||"Gemini did not provide a failure diagnosis.");
      setDiagnosis({jobId:job.id,value:data.diagnosis});
    }catch(e){setError(e instanceof Error?e.message:"Could not check Gemini failure details.");}
    finally{setDiagnosing(false);}
  }
  async function retryJob(job:Job){
    if(retrying||starting||!job.canRetry||job.status!=="needs_attention")return;
    if(!window.confirm("Retry this AI processing job? TWE will reuse your original Drive recording and previous approval. No new recap job will be created, but Gemini requests can use quota or incur charges. This option is available only because no model submission was confirmed or attempted in the failed stage."))return;
    setRetrying(true);setError("");setNotice("");
    try{
      const response=await fetch(endpoint,{
        method:"PATCH",headers:{"content-type":"application/json"},
        body:JSON.stringify({recapId,jobId:job.id,retryApproved:true}),
      });
      const data=await response.json() as {resumed?:boolean;error?:string};
      if(!response.ok||!data.resumed)throw Error(data.error||"Could not safely retry this job.");
      setNotice("Processing resumed using your existing recording. The recap will update here when Gemini finishes.");
      await refresh();
    }catch(e){setError(e instanceof Error?e.message:"Could not retry processing.");}
    finally{setRetrying(false);}
  }
  const playable=assets.filter(a=>a.status==="ready"&&a.provider==="google-drive");
  const activeStatuses=new Set(["pending_upload","transferring","uploaded","submitting","submitted"]);
  const available=playable.filter(a=>!jobs.some(j=>j.audioAssetId===a.id&&activeStatuses.has(j.status)));
  const completeVersions=jobs.filter(job=>job.status==="ready"&&job.generatedMarkdown);
  const newest=jobs[0];
  const duration=confirmAsset?(durations[confirmAsset.id]??confirmAsset.durationMs):null;
  const quotaEstimate=recapQuotaNotice(duration);
  const longRecording=typeof duration==="number"&&duration>95*60_000;
  const segmentCount=longRecording?Math.ceil(duration/(35*60_000)):0;
  const segmentSupported=confirmAsset&&["audio/wav","audio/mpeg","audio/mp3"].includes(confirmAsset.mimeType??"");
  return <section className="session-recap-reading" aria-label="Session recording and Auto Summarize">
    <h4>Session recording</h4>
    <p className="campaign-empty-copy">
      Your recording remains in Google Drive. Every approved AI run saves a separate result;
      existing edits and published Journal pages are preserved.
    </p>
    {playable.length>0&&<SessionRecapAudioPlayer
      key={playable.map(a=>a.id).join(":")} campaignId={campaignId} recapId={recapId}
      onDuration={(assetId,durationMs)=>setDurations(previous=>
        previous[assetId]===durationMs?previous:{...previous,[assetId]:durationMs})}/>}
    {playable.length===0&&<p className="campaign-empty-copy">
      Once your upload finishes, the recording will appear here with playback controls.
    </p>}
    <h4>Step 2 — AI summarization (optional)</h4>
    <p className="campaign-empty-copy">
      Gemini never starts when you upload. Choose <strong>Auto Summarize</strong>
      and confirm for this recording. It uses your own Gemini API key, may consume
      free-tier quota or incur charges, and creates a private draft for review.
      Long compatible recordings are divided and summarized in sections automatically,
      then combined into one recap. No separate files or extra setup needed.
    </p>
    {available.map(asset=><div className="session-recap-form-actions" key={asset.id}>
      <span>{asset.label}</span>
      <button type="button" className="campaign-primary" disabled={starting}
        onClick={()=>openConfirmation(asset)}>
        {jobs.some(j=>j.audioAssetId===asset.id)?"Summarize again":"Auto Summarize"}
      </button>
    </div>)}
    {newest&&<>
      <p role="status"><strong>{
        newest.segmentCount&&newest.status==="transferring"
          ?"Analyzing session in "+newest.segmentCount+" sections"
          :statusLabel[newest.status]||"Status: "+newest.status
      }</strong>{" · "}{newest.detail} recap</p>
      {newest.segmentCount&&newest.status==="transferring"?<>
        <p className="campaign-empty-copy">
          {newest.segmentsReady??0} of {newest.segmentCount} sections summarized.
          Your recording stays in Drive. TWE keeps completed sections if you leave.
        </p>
        <progress style={{width:"100%"}} value={newest.segmentsReady??0}
          max={newest.segmentCount} aria-label="Summarized audio sections"/>
      </>:<SessionRecapProgress job={newest}/>}
    </>}
    {completeVersions.length>0&&<details>
      <summary>Saved AI recap versions ({completeVersions.length})</summary>
      <p className="campaign-empty-copy">
        Every version is preserved. Choosing one only copies it into the editor;
        your saved recap and Journal entry remain unchanged until you save.
      </p>
      {completeVersions.map(version=>{
        const parsed=parseGeneratedRecapTitle(version.generatedMarkdown!);
        return <details key={version.id}>
          <summary>{version.detail==="detailed"?"Most detailed":
            version.detail==="standard"?"Standard":"Brief"} — {new Date(version.createdAt).toLocaleString()}
            {parsed.title?" — "+parsed.title:""}</summary>
          {parsed.title&&<div className="session-recap-form-actions">
            <span className="campaign-empty-copy">AI-suggested title: <strong>{parsed.title}</strong></span>
            <button type="button" className="campaign-secondary" onClick={()=>{
              onSuggestedTitle(parsed.title!);
              setNotice("AI title copied into the title field. Review and save to keep it.");
            }}>Use AI title</button>
          </div>}
          <button type="button" className="campaign-secondary" onClick={()=>{
            if(!window.confirm("Replace the current editor text with this AI version? Unsaved editor changes will be lost. Your saved and published Journal entries won't change."))return;
            if(onDraft(parsed.content,recapUpdatedAt,true,parsed.title))
              setNotice("Saved version copied into the editor. Review and save only if you want to use it.");
          }}>Copy this version into editor</button>
          <pre style={{whiteSpace:"pre-wrap",maxHeight:300,overflow:"auto"}}>{parsed.content}</pre>
        </details>;
      })}
    </details>}
    {newest?.status==="needs_attention"&&<div className="session-recap-reading" role="alert">
      <strong>{recapAttentionText[newest.errorCode??""]?.title??recapAttentionText.unexpected.title}</strong>
      <p className="campaign-empty-copy">
        {recapAttentionText[newest.errorCode??""]?.description??recapAttentionText.unexpected.description}
      </p>
      {newest.stageErrorCode&&<p className="campaign-empty-copy">
        <strong>Specific issue:</strong> {recapStageDescriptions[newest.stageErrorCode]??
          "The preparation step failed; the saved recording is unchanged."}
      </p>}
      <p className="campaign-empty-copy">
        {recapAttentionText[newest.errorCode??""]?.action??recapAttentionText.unexpected.action}
      </p>
      {newest.generatedMarkdown&&<details>
        <summary>View partial AI notes — not a complete recap</summary>
        <p className="campaign-empty-copy">
          Gemini returned only part of the recap. These notes are private, unverified,
          and have not been copied into the published session summary.
        </p>
        <pre style={{whiteSpace:"pre-wrap",maxHeight:300,overflow:"auto"}}>{newest.generatedMarkdown}</pre>
      </details>}
      {newest.errorCode==="interaction_failed"&&<>
        <button type="button" className="campaign-secondary" disabled={diagnosing}
          onClick={()=>void diagnoseFailure(newest)}>
          {diagnosing?"Checking Gemini…":"Check failure reason (no new AI request)"}
        </button>
        {diagnosis?.jobId===newest.id&&<div className="session-recap-import-notice" role="status">
          <strong>{diagnosis.value.title}</strong>
          <p>{diagnosis.value.explanation}</p>
          {diagnosis.value.inputTokens!==null&&<p>
            Gemini reported {diagnosis.value.inputTokens.toLocaleString()} input tokens for this interaction.
          </p>}
          <p className="campaign-empty-copy">
            Only the existing interaction was read. No audio was uploaded or summarized again.
          </p>
        </div>}
      </>}
      <div className="session-recap-form-actions">
        {newest.canRetry&&<button type="button" className="campaign-primary"
          disabled={retrying||starting} onClick={()=>void retryJob(newest)}>
          {retrying?"Retrying…":"Retry AI processing"}
        </button>}
        <a className="campaign-secondary" href="/account#recap-setup">Test Gemini connection</a>
        <a className="campaign-secondary" href="https://aistudio.google.com/" target="_blank"
          rel="noopener noreferrer">Open Google AI Studio</a>
      </div>
      <details>
        <summary>Technical details</summary>
        <p className="campaign-empty-copy">Job ID: <code>{newest.id}</code></p>
        <p className="campaign-empty-copy">Error code: <code>{newest.errorCode||"unknown"}</code></p>
        {newest.stageErrorCode&&<p className="campaign-empty-copy">Preparation stage: <code>{newest.stageErrorCode}</code></p>}
        <p className="campaign-empty-copy">Last updated: {new Date(newest.updatedAt).toLocaleString()}</p>
        <button type="button" className="campaign-secondary" onClick={()=>
          void navigator.clipboard.writeText("TWE recap job: "+newest.id+
            "\\nError: "+(newest.errorCode||"unknown")+
            "\\nPreparation: "+(newest.stageErrorCode||"not available")+
            "\\nUpdated: "+newest.updatedAt)
            .then(()=>setNotice("Diagnostic copied.")).catch(()=>setError("Could not copy diagnostics."))
        }>Copy diagnostics</button>
      </details>
    </div>}
    {confirmAsset&&<div role="presentation" style={{
      position:"fixed",inset:0,background:"rgba(0,0,0,0.65)",display:"flex",
      justifyContent:"center",alignItems:"center",padding:16,zIndex:2000,
    }}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="recap-confirm-title"
        aria-describedby="recap-confirm-description"
        style={{background:"var(--parchment,#f5e9d0)",color:"#302315",
          width:"min(100%,520px)",padding:24,borderRadius:8,boxShadow:"0 12px 40px rgba(0,0,0,.4)"}}>
        <h3 id="recap-confirm-title">Auto Summarize this recording?</h3>
        <p id="recap-confirm-description">
          <strong>{confirmAsset.label}</strong> is already saved in your Drive.
          TWE will send a temporary copy of the audio, relevant campaign Journal
          entries, and earlier recaps to your connected Gemini project.
        </p>
        <p>
          Google may use free-tier submitted content to improve its products.
          The request may count toward free limits or incur charges in your own
          Google project. TWE cannot verify your remaining free quota.
          Nothing will be published to players automatically.
        </p>
        <label style={{display:"block",marginBlock:12}}>Detail level for this run
          <select value={selectedDetail} disabled={starting}
            onChange={event=>setSelectedDetail(event.target.value as typeof selectedDetail)}>
            <option value="brief">Brief — highlights</option>
            <option value="standard">Standard — major scenes</option>
            <option value="detailed">Most detailed — scenes, names, timestamps and consequences</option>
          </select>
          <span className="campaign-empty-copy">Default from Account; changes here apply only to this run.</span>
        </label>
        {published&&<p className="campaign-empty-copy"><strong>Your published Journal entry will not change.</strong>
          The new result will be saved as another private AI version for you to review.</p>}
        <p role="note" className="campaign-empty-copy">
          {longRecording&&segmentSupported?<>
            <strong>Long-session processing:</strong> TWE will analyze roughly {segmentCount} verified
            audio sections separately, then make one final text-only request to assemble
            your recap ({segmentCount+1} Gemini requests in total). Each section is
            approximately {Math.round(35*60*32).toLocaleString()} audio input tokens or less,
            plus Journal context. These requests count toward your personal project&apos;s
            daily and per-minute limits, and may incur charges.
          </>:<>
            <strong>Estimated audio input:</strong>{" "}
            {quotaEstimate.estimatedTokens===null?"Duration unavailable":
              quotaEstimate.estimatedTokens.toLocaleString()+" tokens"}.
            {" "}{quotaEstimate.message}
            {longRecording&&!segmentSupported&&
              " Automatic long-audio segmentation currently requires CBR MP3 or PCM WAV; other formats cannot safely be divided on the free backend."}
          </>}
          {" "}<a href="https://aistudio.google.com/rate-limit" target="_blank"
            rel="noopener noreferrer">Check your project&apos;s active limits in Google AI Studio</a>.
        </p>
        <label style={{display:"block",marginBlock:12}}>
          <input type="checkbox" checked={privacy} disabled={starting}
            onChange={e=>setPrivacy(e.target.checked)}/>
          {" "}I approve sending this recording and campaign context to Gemini.
        </label>
        <label style={{display:"block",marginBlock:12}}>
          <input type="checkbox" checked={billing} disabled={starting}
            onChange={e=>setBilling(e.target.checked)}/>
          {" "}I understand this request could use my quota or incur provider charges.
        </label>
        <div className="session-recap-form-actions">
          <button ref={cancelRef} type="button" className="campaign-secondary" disabled={starting}
            onClick={()=>setConfirmAsset(null)}>Cancel</button>
          <button type="button" className="campaign-primary"
            disabled={starting||!privacy||!billing} onClick={()=>void summarize()}>
            {starting?"Submitting…":"Confirm Auto Summarize"}
          </button>
        </div>
      </div>
    </div>}
    {notice&&<p className="session-recap-import-notice" role="status">{notice}</p>}
    {error&&<p className="campaign-error" role="alert">{error}</p>}
  </section>;
}
