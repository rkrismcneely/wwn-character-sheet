"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {SessionRecapAudioPlayer} from "./session-recap-audio-player";
import {SessionRecapProgress} from "./session-recap-progress";
import {recapAttentionText,recapStageDescriptions} from "@/lib/campaigns/recap-only-recovery";
import {recapQuotaNotice} from "@/lib/campaigns/recap-quota-estimate";
import {parseGeneratedRecapTitle} from "@/lib/campaigns/recap-ai-title";
import {planM4a} from "@/lib/campaigns/recap-m4a-remux";

type Job={
  id:string;audioAssetId:string;status:string;detail:string;model:string;
  generatedMarkdown:string|null;errorCode:string|null;stageErrorCode:string|null;
  stageBytes:number;totalBytes:number|null;canRetry:boolean;canRetryFailedSection?:boolean;
  createdAt:string;updatedAt:string;
  segmentCount?:number;segmentsReady?:number;
};
type Asset={id:string;label:string;status:string;provider:string;durationMs?:number|null;mimeType?:string|null;byteSize?:number|null};
type FailureDiagnosis={kind:string;title:string;explanation:string;inputTokens:number|null};
type DiagnosisState={jobId:string;value:FailureDiagnosis;section:number|null;sectionCount:number|null};
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
  const [diagnosis,setDiagnosis]=useState<DiagnosisState|null>(null);
  const diagnosedJob=useRef("");
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
      let durationMs=durations[asset.id]??asset.durationMs??null;
      let m4aPlan:Awaited<ReturnType<typeof planM4a>>|undefined;
      // This invisible, non-billable preparation uses the existing private
      // Range-capable Drive playback route. No additional GM action is needed.
      // Once the approved job is stored, all remaining work runs on cron.
      if(asset.mimeType==="audio/mp4"&&
        (durationMs===null||durationMs>60*60_000)){
        const total=asset.byteSize;
        if(!Number.isSafeInteger(total)||!total||total<=0)
          throw Error("The M4A recording size is unavailable. Reload the recap before summarizing.");
        const playback="/api/campaigns/"+encodeURIComponent(campaignId)+
          "/session-recaps/audio/"+encodeURIComponent(asset.id)+"/stream";
        try{
          m4aPlan=await planM4a({byteSize:total,durationMs,mimeType:"audio/mp4"},
            async(start,length)=>{
              const response=await fetch(playback,{method:"GET",cache:"no-store",
                headers:{Range:"bytes="+start+"-"+(start+length-1)}});
              if(response.status!==206||
                response.headers.get("content-range")!==
                  "bytes "+start+"-"+(start+length-1)+"/"+total)
                throw Error("Drive could not supply a verified audio metadata range.");
              const bytes=new Uint8Array(await response.arrayBuffer());
              if(bytes.length!==length)throw Error("Audio metadata range was incomplete.");
              return bytes;
            });
          durationMs=m4aPlan.at(-1)?.endMs??durationMs;
          if(m4aPlan.length<2)m4aPlan=undefined;
        }catch{
          throw Error("This M4A could not be safely divided without converting it. No Gemini request was started.");
        }
      }
      const response=await fetch(endpoint,{method:"POST",headers:{"content-type":"application/json"},
        body:JSON.stringify({recapId,assetId:asset.id,confirmed:true,
          privacyApproved:true,billingApproved:true,detail:selectedDetail,requestId,
          durationMs,m4aPlan})});
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
  const diagnoseFailure=useCallback(async(job:Job)=>{
    if(job.status!=="needs_attention"||
      !["interaction_failed","segment_interaction_failed"].includes(job.errorCode??""))return;
    setDiagnosing(true);setError("");
    try{
      const response=await fetch(endpoint+"/diagnose",{
        method:"POST",headers:{"content-type":"application/json"},
        body:JSON.stringify({recapId,jobId:job.id}),
      });
      const data=await response.json() as {
        diagnosis?:FailureDiagnosis;section?:number|null;sectionCount?:number|null;error?:string
      };
      if(!response.ok||!data.diagnosis)
        throw Error(data.error||"Gemini did not provide a failure diagnosis.");
      setDiagnosis({jobId:job.id,value:data.diagnosis,
        section:data.section??null,sectionCount:data.sectionCount??null});
    }catch(e){setError(e instanceof Error?e.message:"Could not check Gemini failure details.");}
    finally{setDiagnosing(false);}
  },[endpoint,recapId]);
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
      setNotice("Processing resumed.");
      await refresh();
    }catch(e){setError(e instanceof Error?e.message:"Could not retry processing.");}
    finally{setRetrying(false);}
  }
  async function retrySection(job:Job){
    if(retrying||starting||!job.canRetryFailedSection||job.status!=="needs_attention")return;
    if(!window.confirm("Retry ONLY the failed Gemini audio section? TWE verifies that the old interaction failed, reuses the uploaded section when possible, and preserves all other notes. This creates one NEW Gemini analysis request, which can consume quota or incur charges. Continue?"))return;
    setRetrying(true);setError("");setNotice("");
    try{
      const response=await fetch(endpoint,{
        method:"PATCH",headers:{"content-type":"application/json"},
        body:JSON.stringify({recapId,jobId:job.id,retryApproved:true,retryFailedSection:true}),
      });
      const data=await response.json() as {resumed?:boolean;error?:string};
      if(!response.ok||!data.resumed)
        throw Error(data.error||"Could not safely resume the failed section.");
      setDiagnosis(null);diagnosedJob.current="";
      setNotice(data.resumed?"Failed section queued again.":"Could not resume this section.");
      await refresh();
    }catch(e){
      setError(e instanceof Error?e.message:"Could not safely retry the failed section.");
    }finally{setRetrying(false);}
  }
  const playable=assets.filter(a=>a.status==="ready"&&a.provider==="google-drive");
  const activeStatuses=new Set(["pending_upload","transferring","uploaded","submitting","submitted"]);
  const available=playable.filter(a=>!jobs.some(j=>j.audioAssetId===a.id&&activeStatuses.has(j.status)));
  const completeVersions=jobs.filter(job=>job.status==="ready"&&job.generatedMarkdown);
  const newest=jobs[0];
  const currentDiagnosis=diagnosis?.jobId===newest?.id?diagnosis:null;
  // One read-only lookup per failed job when this page is opened. Unlike a
  // model interaction POST, this checks Google's stored failure without
  // uploading audio or generating another result. Free results expire quickly.
  useEffect(()=>{
    if(newest?.status!=="needs_attention"||
      !["segment_interaction_failed","interaction_failed"].includes(newest.errorCode??"")||
      diagnosedJob.current===newest.id)return;
    diagnosedJob.current=newest.id;
    void diagnoseFailure(newest);
  },[newest,diagnoseFailure]);
  const duration=confirmAsset?(durations[confirmAsset.id]??confirmAsset.durationMs):null;
  const quotaEstimate=recapQuotaNotice(duration);
  const longRecording=typeof duration==="number"&&duration>60*60_000;
  const segmentCount=longRecording?Math.ceil(duration/(60*60_000)):0;
  const segmentSupported=confirmAsset&&["audio/wav","audio/mpeg","audio/mp3","audio/mp4"].includes(confirmAsset.mimeType??"");
  return <section className="session-recap-reading" aria-label="Session recording and Auto Summarize">
     {playable.length>0&&<SessionRecapAudioPlayer
      key={playable.map(a=>a.id).join(":")} campaignId={campaignId} recapId={recapId}
      onDuration={(assetId,durationMs)=>setDurations(previous=>
        previous[assetId]===durationMs?previous:{...previous,[assetId]:durationMs})}/>}
    <h4>AI recap</h4>
    <p className="campaign-empty-copy">Summarize with your Gemini account. Review before publishing.</p>
    {available.map(asset=><div className="session-recap-form-actions" key={asset.id}>
      <span>{asset.label}</span>
      <button type="button" className="campaign-primary" disabled={starting}
        onClick={()=>openConfirmation(asset)}>
        {jobs.some(j=>j.audioAssetId===asset.id)?"Summarize again":"Auto Summarize"}
      </button>
    </div>)}
    {newest&&!(newest.status==="needs_attention"||newest.status==="failed")&&(
      newest.status==="ready"
        ? <p role="status"><strong>AI recap ready to review</strong> · {newest.detail}</p>
        : newest.segmentCount&&newest.status==="transferring"
          ? <div className="recap-ai-progress" role="status">
            <strong>Processing recording · {newest.segmentsReady??0} of {newest.segmentCount} sections complete</strong>
            <progress style={{width:"100%"}} value={newest.segmentsReady??0}
              max={newest.segmentCount} aria-label="Summarized audio sections"/>
            <p className="recap-ai-progress__hint">Processing continues if you leave this page.</p>
          </div>
          : <SessionRecapProgress job={newest}/>
    )}
    {completeVersions.length>0&&<details>
      <summary>Saved AI recap versions ({completeVersions.length})</summary>
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
              setNotice("AI title copied to editor.");
            }}>Use AI title</button>
          </div>}
          <button type="button" className="campaign-secondary" onClick={()=>{
            if(!window.confirm("Replace the current editor text with this AI version? Unsaved editor changes will be lost. Your saved and published Journal entries won't change."))return;
            if(onDraft(parsed.content,recapUpdatedAt,true,parsed.title))
              setNotice("Version copied to editor. Save to keep it.");
          }}>Copy this version into editor</button>
          <pre style={{whiteSpace:"pre-wrap",maxHeight:300,overflow:"auto"}}>{parsed.content}</pre>
        </details>;
      })}
    </details>}
    {newest?.status==="needs_attention"&&<div className="session-recap-reading" role="alert">
      <strong>{currentDiagnosis?.value.title??
        recapAttentionText[newest.errorCode??""]?.title??recapAttentionText.unexpected.title}</strong>
      {currentDiagnosis?<p className="campaign-empty-copy">
        {currentDiagnosis.section!==null&&
          <>Section {currentDiagnosis.section} of {currentDiagnosis.sectionCount??"?"}: </>}
        {currentDiagnosis.value.explanation}
      </p>:<p className="campaign-empty-copy">
        {recapAttentionText[newest.errorCode??""]?.description??recapAttentionText.unexpected.description}
      </p>}
      {newest.stageErrorCode&&<p className="campaign-empty-copy">
        {recapStageDescriptions[newest.stageErrorCode]??
          "The preparation step stopped. Your recording is unchanged."}
      </p>}
      {!newest.canRetry&&!newest.canRetryFailedSection&&<p className="campaign-empty-copy">
        {recapAttentionText[newest.errorCode??""]?.action??recapAttentionText.unexpected.action}
      </p>}
      <div className="session-recap-form-actions">
        {newest.canRetryFailedSection&&<button type="button" className="campaign-primary"
          disabled={retrying||starting||diagnosing} onClick={()=>void retrySection(newest)}>
          {retrying?"Verifying…":"Retry failed section only"}
        </button>}
        {newest.canRetry&&<button type="button" className="campaign-primary"
          disabled={retrying||starting} onClick={()=>void retryJob(newest)}>
          {retrying?"Retrying…":"Retry AI processing"}
        </button>}
        {!currentDiagnosis&&["interaction_failed","segment_interaction_failed"].includes(newest.errorCode??"")&&
          <button type="button" className="campaign-secondary" disabled={diagnosing}
            onClick={()=>void diagnoseFailure(newest)}>
            {diagnosing?"Checking Gemini…":"Check error (no AI request)"}
          </button>}
      </div>
      <details>
        <summary>More options and diagnostics</summary>
        {["interaction_failed","segment_interaction_failed"].includes(newest.errorCode??"")&&
          <button type="button" className="campaign-secondary" disabled={diagnosing}
            onClick={()=>void diagnoseFailure(newest)}>
            {diagnosing?"Checking Gemini…":"Recheck Gemini error (no AI request)"}
          </button>}
        {currentDiagnosis?.value.inputTokens!==null&&currentDiagnosis&&
          <p className="campaign-empty-copy">
            Gemini input: {currentDiagnosis.value.inputTokens.toLocaleString()} tokens.
          </p>}
        {newest.generatedMarkdown&&<details>
          <summary>View partial AI notes</summary>
          <pre style={{whiteSpace:"pre-wrap",maxHeight:300,overflow:"auto"}}>{newest.generatedMarkdown}</pre>
        </details>}
        <div className="session-recap-form-actions">
          <a className="campaign-secondary" href="/account#recap-setup">Test Gemini connection</a>
          <a className="campaign-secondary" href="https://aistudio.google.com/" target="_blank"
            rel="noopener noreferrer">Google AI Studio</a>
        </div>
        <p className="campaign-empty-copy">Job ID: <code>{newest.id}</code></p>
        <p className="campaign-empty-copy">Error: <code>{newest.errorCode||"unknown"}</code></p>
        {newest.stageErrorCode&&<p className="campaign-empty-copy">
          Preparation: <code>{newest.stageErrorCode}</code>
        </p>}
        <p className="campaign-empty-copy">Updated {new Date(newest.updatedAt).toLocaleString()}</p>
        <button type="button" className="campaign-secondary" onClick={()=>
          void navigator.clipboard.writeText("TWE recap job: "+newest.id+
            "\\nError: "+(newest.errorCode||"unknown")+
            "\\nPreparation: "+(newest.stageErrorCode||"not available")+
            "\\nUpdated: "+newest.updatedAt+
            (currentDiagnosis?"\\nGemini diagnosis: "+currentDiagnosis.value.title+
              "\\nDiagnosis category: "+currentDiagnosis.value.kind+
              "\\nExplanation: "+currentDiagnosis.value.explanation+
              (currentDiagnosis.value.inputTokens!==null?
                "\\nInput tokens: "+currentDiagnosis.value.inputTokens:"")+
              (currentDiagnosis.section!==null?
                "\\nFailed section: "+currentDiagnosis.section+" of "+(currentDiagnosis.sectionCount??"unknown"):""):
              "\\nGemini diagnosis: not available (use Recheck Gemini error first)"))
            .then(()=>setNotice("Diagnostics copied.")).catch(()=>setError("Could not copy diagnostics."))
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
          Send <strong>{confirmAsset.label}</strong>, relevant Journal entries and
          earlier recaps to Gemini. The result stays private until you publish it.
        </p>
        <p>Google may use free-tier content to improve its products. TWE cannot check your remaining quota.</p>
        <label style={{display:"block",marginBlock:12}}>Recap detail
          <select value={selectedDetail} disabled={starting}
            onChange={event=>setSelectedDetail(event.target.value as typeof selectedDetail)}>
            <option value="brief">Brief — highlights</option>
            <option value="standard">Standard — major scenes</option>
            <option value="detailed">Most detailed — scenes, names, timestamps and consequences</option>
          </select>
        </label>
        {published&&<p className="campaign-empty-copy">Your published recap will not change. This creates a private version.</p>}
        <p role="note" className="campaign-empty-copy">
          {longRecording&&segmentSupported
            ? <>Estimated {segmentCount} audio sections + 1 recap request.</>
            : longRecording
              ? <>This audio format may exceed Gemini&apos;s limits.</>
              : quotaEstimate.size!=="ordinary"
                ? <>Audio duration or limits could not be verified.</>
                : <>Gemini requests count toward your account&apos;s quota.</>}
          {" "}<a href="https://aistudio.google.com/rate-limit" target="_blank"
            rel="noopener noreferrer">Check limits</a>.
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
