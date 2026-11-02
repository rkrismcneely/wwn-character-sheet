import {CampaignServiceError} from "./service.ts";
import {manualGroqWriterErrors} from "./recap-groq-request.ts";

type Input={
  jobId:string;campaignId:string;recapId:string;userId:string;
  acknowledgedPossibleCharge:boolean;
};
type Job={
  id:string;model:string;status:string;errorCode:string|null;
  processingMode:string;audioNotes:string|null;
};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/**
 * Recovery from SAVED GEMINI SCENE NOTES ONLY. No audio transfer, transcription,
 * or provider POST occurs inside this function.
 *
 * All retries are GM initiated. A lost Groq response might already have used
 * quota, so a user-visible warning and acknowledgment are mandatory even for
 * errors that usually represent a definite HTTP rejection.
 */
export async function resumeGroqWriter(
  db:D1Database,input:Input,
):Promise<{resumed:true;status:"uploaded"}>{
  if(!UUID.test(input.jobId))throw new CampaignServiceError("Choose a valid recap job.",422);
  if(input.acknowledgedPossibleCharge!==true)
    throw new CampaignServiceError(
      "Review the Groq request log and confirm that another writing request may consume quota.",422);
  const job=await db.prepare(
    "SELECT id,model,status,error_code AS errorCode,processing_mode AS processingMode,"+
    "audio_notes AS audioNotes FROM campaign_recap_audio_summary_jobs "+
    "WHERE id=? AND campaign_id=? AND recap_id=? AND requested_by=? AND confirmed_at IS NOT NULL",
  ).bind(input.jobId,input.campaignId,input.recapId,input.userId).first<Job>();
  if(!job||job.status!=="needs_attention"||!job.model.startsWith("groq:")||
    !job.errorCode||!manualGroqWriterErrors.has(job.errorCode))
    throw new CampaignServiceError("This recap has no Groq writer failure eligible for manual recovery.",409);

  if(job.processingMode==="segmented"){
    const sections=await db.prepare("SELECT COUNT(*) AS total,"+
      "SUM(CASE WHEN status='ready' AND notes IS NOT NULL THEN 1 ELSE 0 END) AS completed "+
      "FROM campaign_recap_audio_summary_segments WHERE job_id=?")
      .bind(job.id).first<{total:number;completed:number|null}>();
    if(!sections||sections.total<2||sections.completed!==sections.total)
      throw new CampaignServiceError(
        "Gemini audio sections are not complete. TWE did not resubmit the recording.",409);
  }else if(job.processingMode!=="single"||!job.audioNotes?.trim()){
    throw new CampaignServiceError(
      "This recap has no reusable Gemini audio notes. TWE did not submit the recording.",409);
  }

  const groq=await db.prepare("SELECT 1 AS ok FROM user_recap_groq_connections "+
    "WHERE user_id=? AND status='connected' AND key_ciphertext IS NOT NULL")
    .bind(input.userId).first();
  if(!groq)throw new CampaignServiceError(
    "Reconnect your Groq API key under Account before retrying the writer.",409);
  const updated=await db.prepare("UPDATE campaign_recap_audio_summary_jobs "+
    "SET status='uploaded',error_code=NULL,claimed_at=NULL,updated_at=? "+
    "WHERE id=? AND campaign_id=? AND recap_id=? AND requested_by=? "+
    "AND status='needs_attention' AND error_code=? AND model=? "+
    "AND confirmed_at IS NOT NULL")
    .bind(new Date().toISOString(),job.id,input.campaignId,input.recapId,
      input.userId,job.errorCode,job.model).run();
  if(updated.meta.changes!==1)
    throw new CampaignServiceError("The recap changed. Refresh before resuming Groq.",409);
  return {resumed:true,status:"uploaded"};
}
