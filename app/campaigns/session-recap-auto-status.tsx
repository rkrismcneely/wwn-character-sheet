"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {SessionRecapAudioPlayer} from "./session-recap-audio-player";
import {SessionRecapProgress} from "./session-recap-progress";
import {recapAttentionText,recapStageDescriptions} from "@/lib/campaigns/recap-only-recovery";
import {recapQuotaNotice} from "@/lib/campaigns/recap-quota-estimate";

type Job={
  id:string;audioAssetId:string;status:string;detail:string;model:string;
  generatedMarkdown:string|null;errorCode:string|null;stageErrorCode:string|null;
  stageBytes:number;totalBytes:number|null;canRetry:boolean;
  createdAt:string;updatedAt:string;
};
type Asset={id:string;label:string;status:string;provider:string;durationMs?:number|null};
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
export function SessionRecapAutoStatus({campaignId,recapId,onDraft}:{
  campaignId:string;recapId:string;onDraft:(content:string,updatedAt:string,overwrite:boolean)=>boolean;
}){
  const endpoint="/api/campaigns/"+encodeURIComponent(campaignId)+"/session-recaps/auto-recap";
  const [jobs,setJobs]=useState<Job[]>([]);
  const [assets,setAssets]=useState<Asset[]>([]);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [starting,setStarting]=useState(false);
  const [retrying,setRetrying]=useState(false);
  const [confirmAsset,setConfirmAsset]=useState<Asset|null>(null);
  const [durations,setDurations]=useState<Record<string,number>>({});
  const [privacy,setPrivacy]=useState(false);
  const [billing,setBilling]=useState(false);
  const [recapUpdatedAt,setRecapUpdatedAt]=useState("");
  const seen=useRef("");
  const cancelRef=useRef<HTMLButtonElement|null>(null);
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
    if(job?.generatedMarkdown&&seen.current!==job.id){
      seen.current=job.id;
      onDraft(job.generatedMarkdown,recapUpdatedAt,false);
    }
  },[jobs,onDraft,recapUpdatedAt]);
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
    setConfirmAsset(asset);setPrivacy(false);setBilling(false);setError("");setNotice("");
  }
  async function summarize(){
    if(!confirmAsset||!privacy||!billing||starting)return;
    const asset=confirmAsset;
    setStarting(true);setError("");setNotice("");
    try{
      const response=await fetch(endpoint,{method:"POST",headers:{"content-type":"application/json"},
        body:JSON.stringify({recapId,assetId:asset.id,confirmed:true,
          privacyApproved:true,billingApproved:true})});
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
  const available=playable.filter(a=>!jobs.some(j=>j.audioAssetId===a.id));
  const newest=jobs[0];
  const quotaEstimate=recapQuotaNotice(confirmAsset?(durations[confirmAsset.id]??confirmAsset.durationMs):null);
  return <section className="session-recap-reading" aria-label="Session recording and Auto Summarize">
    <h4>Session recording</h4>
    <p className="campaign-empty-copy">
      Step 1: upload your recording to Google Drive. It stays attached to this private recap
      whether or not you ever use AI.
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
    </p>
    {available.map(asset=><div className="session-recap-form-actions" key={asset.id}>
      <span>{asset.label}</span>
      <button type="button" className="campaign-primary" disabled={starting}
        onClick={()=>openConfirmation(asset)}>Auto Summarize</button>
    </div>)}
    {newest&&<>
      <p role="status"><strong>{statusLabel[newest.status]||"Status: "+newest.status}</strong>
        {" · "}{newest.detail} recap</p>
      <SessionRecapProgress job={newest}/>
    </>}
    {newest?.status==="ready"&&newest.generatedMarkdown&&<details>
      <summary>View or apply saved Gemini draft</summary>
      <p className="campaign-empty-copy">Review for inaccurate names or events before publishing.</p>
      <button type="button" className="campaign-secondary" onClick={()=>{
        if(!window.confirm("Replace your unsaved editor notes with Gemini's draft?"))return;
        if(onDraft(newest.generatedMarkdown!,recapUpdatedAt,true))
          setNotice("Gemini draft copied into the editor for review.");
      }}>Use Gemini draft in editor</button>
      <pre style={{whiteSpace:"pre-wrap",maxHeight:300,overflow:"auto"}}>{newest.generatedMarkdown}</pre>
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
        <p role="note" className="campaign-empty-copy">
          <strong>Estimated audio input:</strong>{" "}
          {quotaEstimate.estimatedTokens===null?"Duration unavailable":
            quotaEstimate.estimatedTokens.toLocaleString()+" tokens"}.
          {" "}{quotaEstimate.message}{" "}
          <a href="https://aistudio.google.com/rate-limit" target="_blank"
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
