/** The only cases which may be resumed without risking a second
 * Gemini Interactions submission. Provider/Drive preparation failed before the
 * submission call, or a stale transfer is known not to have submitted.
 */
export type RecapRetryRecord = {
  status:string;
  errorCode:string|null;
  fileUri:string|null;
  fileName:string|null;
  interactionId:string|null;
};
export type RecapRetryTarget = "pending_upload" | "uploaded";
export function safeRecapRetryTarget(job:RecapRetryRecord):RecapRetryTarget|null {
  if(job.status!=="needs_attention"||job.interactionId)return null;
  if(job.errorCode==="provider_or_storage_error"){
    // The runner marks this code only for failures in the transfer/uploaded
    // stage, never after claiming a model submission.
    return job.fileUri&&job.fileName?"uploaded":"pending_upload";
  }
  if((job.errorCode==="transfer_stalled"||
      job.errorCode==="incomplete_transfer_or_submission")&&
      !job.fileUri&&!job.fileName)
    return "pending_upload";
  return null;
}

/** Only fixed diagnostic names. Never forward arbitrary Google/API errors. */
export const recapAttentionText:Record<string,{
  title:string;description:string;action:string;
}> = {
  provider_or_storage_error:{
    title:"Recording preparation failed",
    description:"TWE couldn't complete a Drive or Gemini preparation step before submitting the recap request. Your original recording remains saved in Drive.",
    action:"Check your Gemini connection, then retry processing below.",
  },
  transfer_stalled:{
    title:"Audio transfer was interrupted",
    description:"The transfer from your Drive to Gemini took too long or was interrupted. No recap generation request was submitted.",
    action:"You can safely retry from the saved Drive recording.",
  },
  submission_uncertain:{
    title:"Gemini submission could not be confirmed",
    description:"Gemini may have received the request, and running it again could consume quota or incur another charge.",
    action:"Do not resubmit this recording. Check your Gemini usage or ask the site administrator to investigate the job ID.",
  },
  submission_id_missing:{
    title:"Gemini response was missing a job ID",
    description:"Gemini responded without an identifier TWE can track. A request might have been accepted and could have incurred charges.",
    action:"Don't submit it again yet. Check Gemini usage or ask the site administrator to investigate.",
  },
  incomplete_transfer_or_submission:{
    title:"A previous AI step stopped responding",
    description:"The previous worker execution was interrupted. TWE cannot always tell whether Gemini received a request.",
    action:"If the transfer definitely ended before model submission, TWE may offer a safe retry. Otherwise check usage before starting another request.",
  },
  unexpected:{
    title:"AI processing stopped",
    description:"TWE doesn't have a detailed reason for this job. The original Google Drive file is unchanged.",
    action:"Check your Gemini connection and share the job diagnostic with the site administrator.",
  },
};

/** Privacy-safe preparation-stage messages. Only these fixed codes appear in UI;
 * never surface Google's raw error bodies, file URLs, or API credentials. */
export const recapStageDescriptions:Record<string,string>={
  gemini_key_unavailable:"TWE could not access the saved Gemini key. Test your key in Account.",
  drive_file_unavailable:"TWE could not find or use the original Drive audio file.",
  drive_permission_unavailable:"Google Drive access could not be refreshed. Reconnect Drive in Account if needed.",
  gemini_file_start_failed:"Gemini rejected or could not create a temporary file-upload session. Check your API permissions or usage limits.",
  gemini_upload_session_missing:"Gemini did not provide a resumable upload address.",
  gemini_upload_session_expired:"The temporary Gemini upload session expired. Retrying creates a new temporary upload, not a second recap generation.",
  gemini_upload_session_invalid:"Gemini returned an unexpected upload destination. TWE blocked the transfer.",
  gemini_upload_offset_unknown:"Gemini did not report a trustworthy accepted byte offset. TWE stopped rather than risk corrupting the upload.",
  drive_range_unavailable:"TWE could not read the next audio chunk from Google Drive.",
  drive_range_invalid:"The Drive audio bytes did not match the requested chunk range.",
  gemini_chunk_rejected:"Gemini rejected an audio chunk. The original recording is unaffected.",
  gemini_chunk_network_error:"The temporary audio transfer to Gemini was interrupted.",
  gemini_upload_receipt_invalid:"Gemini did not return a valid receipt for the completed audio upload.",
  staging_data_unavailable:"TWE could not resume its saved transfer state. The audio remains in Google Drive.",
};
