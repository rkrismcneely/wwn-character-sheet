"use client";
import {useCallback,useEffect,useRef,useState} from "react";
type Job={
  id:string;status:string;detail:string;model:string;generatedMarkdown:string|null;
  errorCode:string|null;createdAt:string;updatedAt:string;
};
type Asset={id:string;label:string;status:string;provider:string};
const statusLabel:Record<string,string>={
  pending_upload:"Waiting to send the saved recording to Gemini",
  transferring:"Transferring your Drive recording to Gemini",
  uploaded:"Preparing your temporary Gemini audio file",
  submitting:"Starting AI recap generation",
  submitted:"Gemini is analyzing the session — you can close this page",
  ready:"AI draft ready for review — not published",
  needs_attention:"Processing needs your attention",
  failed:"Processing stopped",
};
export function SessionRecapAutoStatus({campaignId,recapId,onDraft}:{
  campaignId:string;recapId:string;onDraft:(content:string)=>boolean;
}){
  const endpoint="/api/campaigns/"+encodeURIComponent(campaignId)+"/session-recaps/auto-recap";
  const [jobs,setJobs]=useState<Job[]>([]);
  const [assets,setAssets]=useState<Asset[]>([]);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [starting,setStarting]=useState("");
  const seen=useRef("");
  const refresh=useCallback(async(signal?:AbortSignal)=>{
    const [results,audio]=await Promise.all([
      fetch(endpoint+"?recapId="+encodeURIComponent(recapId),{cache:"no-store",signal}),
      fetch("/api/campaigns/"+encodeURIComponent(campaignId)+"/session-recaps/audio?recapId="+encodeURIComponent(recapId),{cache:"no-store",signal}),
    ]);
    const [jobsResult,audioResult]=await Promise.all([results.json(),audio.json()]) as [
      {jobs?:Job[];error?:string},{assets?:Asset[];error?:string},
    ];
    if(!results.ok||!Array.isArray(jobsResult.jobs))throw Error(jobsResult.error||"Could not read recap processing status.");
    if(!audio.ok||!Array.isArray(audioResult.assets))throw Error(audioResult.error||"Could not read saved audio.");
    if(!signal?.aborted){setJobs(jobsResult.jobs);setAssets(audioResult.assets);}
  },[campaignId,recapId,endpoint]);
  useEffect(()=>{
    const ctrl=new AbortController();
    void refresh(ctrl.signal).catch(e=>{if(!ctrl.signal.aborted)setError(e instanceof Error?e.message:"Status unavailable.");});
    const timer=window.setInterval(()=>{
      void refresh(ctrl.signal).catch(()=>{ /* keep existing progress visible while offline */ });
    },12000);
    return ()=>{ctrl.abort();window.clearInterval(timer);};
  },[refresh]);
  useEffect(()=>{
    const job=jobs.find(x=>x.status==="ready"&&x.generatedMarkdown);
    if(job?.generatedMarkdown&&seen.current!==job.id){
      seen.current=job.id;
      if(onDraft(job.generatedMarkdown))
        setNotice("Gemini wrote a private draft into the recap editor. Review and publish when ready.");
    }
  },[jobs,onDraft]);
  async function start(assetId:string){
    setStarting(assetId);setError("");setNotice("");
    try{
      const response=await fetch(endpoint,{method:"POST",headers:{"content-type":"application/json"},
        body:JSON.stringify({recapId,assetId})});
      const data=await response.json() as {queued?:boolean;error?:string};
      if(!response.ok||!data.queued)throw Error(data.error||"Could not queue audio recap.");
      setNotice("Recording queued for private Gemini recap generation.");
      await refresh();
    }catch(e){setError(e instanceof Error?e.message:"Could not start audio recap.");}
    finally{setStarting("");}
  }
  const newest=jobs[0];
  const pending=assets.filter(x=>x.status==="ready"&&x.provider==="google-drive"&&jobs.length===0);
  return <section className="session-recap-reading" aria-label="Automatic recap progress">
    <h4>Automatic audio recap</h4>
    <p className="campaign-empty-copy">
      The recording stays in your Google Drive. Gemini receives a temporary copy
      only after your account&apos;s processing and billing approvals are saved.
      The AI recap is private until you publish it.
    </p>
    {newest&&<p role="status"><strong>{statusLabel[newest.status]||"Processing status: "+newest.status}</strong>
      {" · "}{newest.detail} recap</p>}
    {newest?.status==="submitted"&&<p className="campaign-empty-copy">
      TWE checks the result automatically while your computer is off. Free-tier
      provider quotas and audio processing may affect completion time.
    </p>}
    {newest?.status==="ready"&&<p className="campaign-empty-copy">
      Review the AI draft in the editor below. Check names, timeline and NPC details before publishing.
      The audio player will appear in the published recap.
    </p>}
    {newest?.status==="needs_attention"&&<p className="campaign-error">
      {newest.errorCode==="audio_exceeds_2gb"
        ?"The original recording is saved in Drive, but Gemini cannot accept an audio file over 2 GB."
        :newest.errorCode==="submission_uncertain"
          ?"Gemini may have received this request. TWE will not retry automatically and risk a second charge."
          :"Processing could not complete safely. Your original Drive recording is still saved; no recap was published."}
    </p>}
    {pending.map(asset=><p key={asset.id} className="campaign-empty-copy">
      {asset.label} {" "}
      <button type="button" className="campaign-secondary" disabled={Boolean(starting)}
        onClick={()=>void start(asset.id)}>{starting===asset.id?"Starting…":"Generate recap from this recording"}</button>
    </p>)}
    {notice&&<p className="session-recap-import-notice" role="status">{notice}</p>}
    {error&&<p className="campaign-error" role="alert">{error}</p>}
  </section>;
}
