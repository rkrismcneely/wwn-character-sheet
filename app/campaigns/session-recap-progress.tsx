"use client";

import {formatRecapBytes,recapProgress,RECAP_PROGRESS_STEPS} from "@/lib/campaigns/recap-progress";

type JobProgress={
  status:string;stageBytes:number;totalBytes:number|null;updatedAt:string;
  errorCode?:string|null;segmentCount?:number;segmentsReady?:number;
};

/** Never turn stage ordinal into an estimated global completion percentage:
 * Gemini does not provide an analysis completion ratio. */
export function SessionRecapProgress({job}:{job:JobProgress}){
  const progress=recapProgress(job);
  const isTransfer=job.status==="pending_upload"||job.status==="transferring";
  // A section may have uploaded successfully and then failed during Gemini
  // generation. Do not describe its earlier 62% transfer as the failing step.
  const analysisFailure=progress.interrupted&&
    /^(?:segment_interaction_|interaction_|segment_invalid_output)/u.test(job.errorCode??"");
  const showTransfer=isTransfer||progress.interrupted&&
    progress.transferPercent!==null&&!analysisFailure;
  const progressValue=progress.finished?100:showTransfer?(progress.transferPercent??0):undefined;
  const progressLabel=progress.finished?"All recap steps complete":
    analysisFailure?"Gemini audio analysis stopped":
    showTransfer?"Audio transfer to Gemini":"Gemini preparation and summarization";
  const progressDetail=showTransfer?progress.transferPercent===null
    ?"Checking accepted audio bytes…"
    :`${progress.transferPercent}% of audio transferred`:"Completion percentage not provided by Gemini";
  const updated=Number.isFinite(Date.parse(job.updatedAt))?
    new Date(job.updatedAt).toLocaleString():null;
  return <section className="recap-ai-progress" aria-label="AI recap processing progress">
    <div className="recap-ai-progress__heading">
      <strong>{progress.label}</strong>
      {progress.activeStep!==null&&
        <span className="recap-ai-progress__counter">Step {progress.activeStep+1} of 4</span>}
      {progress.finished&&<span className="recap-ai-progress__counter">4 of 4 complete</span>}
    </div>
    <p className="campaign-empty-copy">{progress.detail}</p>
    <ol className="recap-ai-progress__steps" aria-label="Processing stages">
      {RECAP_PROGRESS_STEPS.map((name,index)=>{
        const state=progress.finished?"complete":
          progress.activeStep===null?"idle":
          index<progress.activeStep?"complete":
          index===progress.activeStep?"current":"waiting";
        return <li key={name} className={"recap-ai-progress__step recap-ai-progress__step--"+state}
          aria-current={state==="current"?"step":undefined}>
          <span className="recap-ai-progress__step-marker" aria-hidden="true">
            {state==="complete"?"✓":index+1}
          </span>
          <span>{name}</span>
        </li>;
      })}
    </ol>
    {(progress.activeStep!==null||progress.interrupted||progress.finished)&&<>
      <div className="recap-ai-progress__meter-label">
        <span>{progressLabel}</span>
        <span>{progress.finished?"Complete":progressDetail}</span>
      </div>
      {analysisFailure?<p className="recap-ai-progress__hint">
        Gemini failed after the audio reached its analysis stage. No valid AI
        processing percentage is available; the earlier transfer percentage
        does not measure summarization progress.
      </p>:<progress className="recap-ai-progress__meter" value={progressValue} max={100}
        aria-label={progressLabel} aria-valuetext={
          progressValue===undefined?"In progress — no numeric percentage is available":
          progress.finished?"Complete":progressDetail
        }/>}
      {showTransfer&&!analysisFailure&&progress.completedBytes!==null&&progress.totalBytes!==null&&
        <p className="recap-ai-progress__hint">
          {formatRecapBytes(progress.completedBytes)} of {formatRecapBytes(progress.totalBytes)} accepted by Gemini
        </p>}
      {progress.indeterminate&&<p className="recap-ai-progress__hint">
        Gemini reports processing status, not a percentage or reliable time remaining.
      </p>}
      {progress.interrupted&&!analysisFailure&&<p className="recap-ai-progress__hint">
        This bar is paused. It will only advance after the issue below is resolved.
      </p>}
      {!progress.finished&&<p className="recap-ai-progress__hint">
        {updated&&<>Last reported: {updated}. </>}
        Status refreshes automatically while this page is open; background processing continues if you leave.
      </p>}
    </>}
  </section>;
}
