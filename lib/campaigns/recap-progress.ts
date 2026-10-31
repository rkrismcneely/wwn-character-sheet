/** Presentation-only view of persisted recap job progress.
 * TWE can measure acknowledged audio bytes, but Gemini background Interactions
 * reports a status, not a numeric percentage of generation completed.
 * Do not fabricate an overall completion percentage or an ETA.
 */
export const RECAP_PROGRESS_STEPS=[
  "Transfer audio",
  "Prepare file",
  "Start summary",
  "Generate recap",
] as const;

export type RecapProgressInput={
  status:string;
  stageBytes:number|null|undefined;
  totalBytes:number|null|undefined;
};

export type RecapProgressView={
  activeStep:number|null; // 0..3; null for unrecognized / stopped state
  finished:boolean;
  interrupted:boolean;
  label:string;
  detail:string;
  transferPercent:number|null;
  completedBytes:number|null;
  totalBytes:number|null;
  indeterminate:boolean;
};

const ongoing:Record<string,{step:number;label:string;detail:string}>={
  pending_upload:{step:0,label:"Waiting to transfer recording",
    detail:"The background worker will pick up your saved Drive recording automatically."},
  transferring:{step:0,label:"Transferring audio to Gemini",
    detail:"Bytes accepted by Gemini are saved between background runs."},
  uploaded:{step:1,label:"Preparing audio for analysis",
    detail:"Audio transfer is complete. Waiting for Gemini to activate the temporary file."},
  submitting:{step:2,label:"Starting AI summary",
    detail:"Submitting the approved request to Gemini. TWE is avoiding duplicate submissions."},
  submitted:{step:3,label:"Gemini is generating your recap",
    detail:"Gemini is working in the background. TWE checks its status automatically."},
};
export function recapProgress(input:RecapProgressInput):RecapProgressView{
  const total=typeof input.totalBytes==="number"&&Number.isSafeInteger(input.totalBytes)&&input.totalBytes>0
    ?input.totalBytes:null;
  const bytes=typeof input.stageBytes==="number"&&Number.isSafeInteger(input.stageBytes)&&
    input.stageBytes>=0&&total!==null
      ?Math.min(input.stageBytes,total):null;
  const transferPercent=bytes!==null&&total!==null?Math.min(100,Math.floor(bytes*100/total)):null;
  if(input.status==="ready"){
    return {activeStep:null,finished:true,interrupted:false,label:"AI recap draft ready",
      detail:"All processing steps are complete. Review the private draft before publishing.",
      transferPercent:100,completedBytes:total,totalBytes:total,indeterminate:false};
  }
  if(input.status==="needs_attention"||input.status==="failed"){
    return {activeStep:null,finished:false,interrupted:true,
      label:input.status==="needs_attention"?"Processing paused — action needed":"Processing stopped",
      detail:"The previous step stopped. See the details and available actions below; progress is not advancing.",
      transferPercent,completedBytes:bytes,totalBytes:total,indeterminate:false};
  }
  const current=ongoing[input.status];
  if(!current){
    return {activeStep:null,finished:false,interrupted:false,
      label:"Checking AI recap status",detail:"Waiting for an updated status from TWE.",
      transferPercent,completedBytes:bytes,totalBytes:total,indeterminate:false};
  }
  return {activeStep:current.step,finished:false,interrupted:false,
    label:current.label,detail:current.detail,transferPercent,
    completedBytes:bytes,totalBytes:total,
    indeterminate:input.status==="uploaded"||input.status==="submitting"||
      input.status==="submitted"};
}
export function formatRecapBytes(bytes:number):string{
  if(bytes>=1024*1024*1024)return (bytes/(1024*1024*1024)).toFixed(2)+" GiB";
  return (bytes/(1024*1024)).toFixed(1)+" MiB";
}
