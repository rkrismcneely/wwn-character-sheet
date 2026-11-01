/** The only cases which may be resumed without risking a second
 * Gemini Interactions submission. Provider/Drive preparation failed before the
 * submission call, or a stale transfer is known not to have submitted.
 */
export type RecapRetryRecord = {
  status:string;
  errorCode:string|null;
  stageErrorCode?:string|null;
  fileUri:string|null;
  fileName:string|null;
  interactionId:string|null;
};
export type RecapRetryTarget = "pending_upload" | "uploaded";
export function safeRecapRetryTarget(job:RecapRetryRecord):RecapRetryTarget|null {
  if(job.status!=="needs_attention"||job.interactionId)return null;
  if(job.errorCode==="provider_or_storage_error"){
    // These temporary Google files have expired or failed preparation.
    // Re-stage the same original Drive recording, not a new interaction.
    if(job.stageErrorCode==="gemini_file_expired"||
      job.stageErrorCode==="gemini_file_processing_failed")return "pending_upload";
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
  interaction_result_unavailable:{
    title:"Gemini result no longer available",
    description:"The interaction ID can no longer be retrieved from Google. It may already have consumed quota.",
    action:"TWE has stopped polling and will not automatically submit another AI request. Keep the original job diagnostics.",
  },
  long_audio_format_unsupported:{
    title:"This recording needs a supported audio format",
    description:"TWE can automatically divide long MP3 recordings and standard PCM WAV files. This recording uses an audio format that cannot yet be safely divided in the background on Cloudflare's free plan.",
    action:"Keep the recording in Drive. Convert a copy to MP3 or standard PCM WAV, then attach that version for summarization. No Gemini request was submitted by this attempt.",
  },
  long_audio_metadata_invalid:{
    title:"Recording could not be safely divided",
    description:"The audio's timing or container structure did not match what TWE can verify without decoding the entire recording.",
    action:"Keep the original Drive file. Try an MP3 export with constant bitrate. No Gemini request was submitted.",
  },
  long_audio_too_many_segments:{
    title:"Recording is too long for automatic division",
    description:"This recording exceeds the bounded background section count.",
    action:"Divide it into shorter recordings before requesting a recap. TWE did not submit a Gemini model request.",
  },
  segment_submission_uncertain:{
    title:"One Gemini section submission could not be verified",
    description:"Gemini may already have started analyzing a section. TWE stopped rather than silently making a duplicate provider request.",
    action:"Check Google AI Studio usage and preserve this job ID. Completed sections are retained.",
  },
  segment_interaction_failed:{
    title:"Gemini failed to summarize one audio section",
    description:"The recording was divided successfully, but Gemini returned a failed result for one section.",
    action:"Check Google AI Studio limits and the job ID. TWE stopped without resubmitting the section or discarding earlier section notes.",
  },
  segment_result_unavailable:{
    title:"A section's Gemini result expired",
    description:"The saved interaction could no longer be retrieved from Gemini.",
    action:"Completed sections remain saved. The missing result cannot safely be regenerated automatically.",
  },
  segment_invalid_output:{
    title:"Gemini returned invalid section notes",
    description:"One section did not produce enough usable information to assemble a reliable recap.",
    action:"No final recap was created or published. Completed sections remain saved.",
  },
  interaction_failed:{
    title:"Gemini reported a failed summary",
    description:"The AI generation ended with a failure. TWE will not submit it again automatically.",
    action:"Check Google AI Studio usage and this job's diagnostics before requesting another attempt.",
  },
  interaction_cancelled:{
    title:"Gemini cancelled the summary",
    description:"The provider ended the interaction without a completed recap.",
    action:"Check Google AI Studio. TWE will not submit a second request without approval.",
  },
  interaction_incomplete:{
    title:"Gemini returned a partial summary",
    description:"The provider ended before completing the full recap. Partial generated text may be available below.",
    action:"Review the available partial text; do not treat it as a complete session recap.",
  },
  interaction_requires_action:{
    title:"Gemini requires additional action",
    description:"The model has paused and is waiting for additional input that TWE cannot safely supply automatically.",
    action:"Keep the original interaction ID and review technical details; no new generation was submitted.",
  },
  interaction_requires_continuation:{
    title:"Gemini needs a continuation request",
    description:"Gemini generated some content but requires a further request to continue, which may consume more quota.",
    action:"TWE will not automatically issue a potentially billable continuation.",
  },
  interaction_unknown_status:{
    title:"Unexpected Gemini interaction state",
    description:"The provider returned a state TWE does not recognize.",
    action:"Copy diagnostics so the request can be investigated without submitting another job.",
  },
  interaction_invalid_output:{
    title:"Gemini summary failed validation",
    description:"Gemini reported completion, but the text was empty, malformed, or too large for TWE's private recap.",
    action:"Inspect diagnostics; no draft was published.",
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
  gemini_chunk_granularity_mismatch:"Gemini requires an unsupported upload chunk alignment. TWE stopped before sending any audio; report this to the site owner.",
  gemini_upload_offset_unknown:"Gemini did not report a trustworthy accepted byte offset. TWE stopped rather than risk corrupting the upload.",
  drive_range_unavailable:"TWE could not read the next audio chunk from Google Drive.",
  drive_range_invalid:"The Drive audio bytes did not match the requested chunk range.",
  gemini_chunk_rejected:"Gemini rejected an audio chunk. The original recording is unaffected.",
  gemini_chunk_http_400:"Gemini returned HTTP 400 (invalid upload request). TWE will check the upload headers and file format; the original recording remains in Drive.",
  gemini_chunk_http_401:"Gemini returned HTTP 401 (unauthorized upload). Test your saved Gemini API key under Account.",
  gemini_chunk_http_403:"Gemini returned HTTP 403 (permission denied). Check Gemini API access and API-key restrictions in Google AI Studio.",
  gemini_chunk_http_404:"Gemini returned HTTP 404 (upload session not found or expired). Retry safely starts a fresh temporary Gemini upload.",
  gemini_chunk_http_409:"Gemini returned HTTP 409 (upload state or byte offset conflict). TWE stopped to avoid corrupting the temporary transfer.",
  gemini_chunk_http_413:"Gemini returned HTTP 413 (request too large). A chunk exceeded Google's accepted size.",
  gemini_chunk_http_429:"Gemini returned HTTP 429 (quota or rate limit reached). Check your project's Gemini usage limits before retrying.",
  gemini_chunk_http_500:"Gemini returned HTTP 500 (temporary server failure). Retry later.",
  gemini_chunk_http_502:"Gemini returned HTTP 502 (temporary gateway failure). Retry later.",
  gemini_chunk_http_503:"Gemini returned HTTP 503 (service unavailable). Retry later.",
  gemini_chunk_http_504:"Gemini returned HTTP 504 (gateway timeout). Retry later.",
  gemini_chunk_network_error:"The temporary audio transfer to Gemini was interrupted.",
  gemini_upload_receipt_invalid:"Gemini did not return a valid receipt for the completed audio upload.",
  gemini_upload_finalization_uncertain:"Gemini may have accepted the entire temporary recording, but TWE could not uniquely verify the completed file. Retry only the original job to check again; the Drive recording is untouched.",
  gemini_file_processing_failed:"Gemini received the audio but could not finish preparing it. This temporary file cannot be used for a recap.",
  gemini_file_expired:"The temporary Gemini audio file expired. Your original recording remains in Drive. Retry to create a fresh temporary upload without restarting a previously submitted AI generation.",
  gemini_file_not_active:"Gemini did not report an active audio file. TWE will not submit a summary using it.",
  staging_data_unavailable:"TWE could not resume its saved transfer state. The audio remains in Google Drive.",
};
