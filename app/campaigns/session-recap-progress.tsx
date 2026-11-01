"use client";
import {formatRecapBytes,recapProgress} from "@/lib/campaigns/recap-progress";

type JobProgress={
  status:string;stageBytes:number;totalBytes:number|null;updatedAt:string;
  errorCode?:string|null;segmentCount?:number;segmentsReady?:number;
};

/** Show measured transfer progress, never a fabricated Gemini completion percentage. */
export function SessionRecapProgress({job}:{job:JobProgress}){
  const progress=recapProgress(job);
  const isTransfer=job.status==="pending_upload"||job.status==="transferring";
  const analysisFailure=progress.interrupted&&
    /^(?:segment_interaction_|interaction_|segment_invalid_output)/u.test(job.errorCode??"");
  const showTransfer=isTransfer||progress.interrupted&&
    progress.transferPercent!==null&&!analysisFailure;
  const updated=Number.isFinite(Date.parse(job.updatedAt))?
    new Date(job.updatedAt).toLocaleString():null;
  return <section className="recap-ai-progress" aria-label="AI recap processing progress">
    <div className="recap-ai-progress__heading">
      <strong>{progress.label}</strong>
      {showTransfer&&progress.transferPercent!==null&&
        <span className="recap-ai-progress__counter">{progress.transferPercent}%</span>}
    </div>
    {showTransfer&&!analysisFailure&&<>
      <progress className="recap-ai-progress__meter"
        value={progress.transferPercent??undefined} max={100} aria-label="Audio transfer to Gemini"/>
      {progress.completedBytes!==null&&progress.totalBytes!==null&&
        <p className="recap-ai-progress__hint">
          {formatRecapBytes(progress.completedBytes)} of {formatRecapBytes(progress.totalBytes)} transferred
        </p>}
    </>}
    {progress.interrupted&&<p className="recap-ai-progress__hint">
      Paused. See the error and available actions below.
    </p>}
    {!progress.interrupted&&!progress.finished&&<p className="recap-ai-progress__hint">
      Processing continues if you leave this page.
    </p>}
    {updated&&<details>
      <summary>Processing details</summary>
      <p className="recap-ai-progress__hint">{progress.detail} Updated {updated}.</p>
    </details>}
  </section>;
}
