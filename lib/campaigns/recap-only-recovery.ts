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
  writer_connection_missing:{
    title:"Groq writer is not connected",
    description:"TWE saved the completed audio analysis, but could not access your Groq API key.",
    action:"Connect or test Groq in Account. The Gemini scene notes are retained; no new audio analysis is needed.",
  },
  writer_input_too_large:{
    title:"Groq free-tier input needs smaller sections",
    description:"The saved scene notes exceeded the safe Groq request budget. No oversized writing request was sent.",
    action:"Keep this job for a smaller writer batch or a higher-tier model. Your Gemini scene notes remain saved.",
  },
  writer_submission_uncertain:{
    title:"Groq writer request could not be confirmed",
    description:"Groq may have processed the current writing section. TWE stopped instead of repeating a potentially chargeable request.",
    action:"Check Groq usage and retain the job ID. Completed writing sections and Gemini scene notes remain saved.",
  },
  writer_http_400:{
    title:"Groq rejected the writing request (400)",
    description:"The request was invalid. TWE preserved all scene notes; retrying without changing the request may fail again.",
    action:"Check GroqCloud Logs for the request error. No Gemini audio reprocessing is needed.",
  },
  writer_http_401:{
    title:"Groq API key was rejected (401)",
    description:"Groq returned an authentication rejection. Gemini scene notes are saved.",
    action:"Verify and reconnect Groq under Account before resuming writing.",
  },
  writer_http_403:{
    title:"Groq writer access denied (403)",
    description:"The Groq project or key cannot use the selected writer model.",
    action:"Review GroqCloud model permissions and Account connection.",
  },
  writer_http_404:{
    title:"Groq writer model was not found (404)",
    description:"Groq rejected the configured model or API endpoint.",
    action:"Check the model choice and availability before another attempt.",
  },
  writer_http_408:{
    title:"Groq returned request timeout (408)",
    description:"Groq explicitly rejected the request as timed out.",
    action:"Review GroqCloud Logs and try writing only when ready.",
  },
  writer_http_409:{
    title:"Groq reported a conflict (409)",
    description:"Groq returned a request-state conflict, not a completed draft.",
    action:"Review GroqCloud Logs before trying again.",
  },
  writer_http_413:{
    title:"Groq prompt was too large (413)",
    description:"Groq rejected the prompt because its request body exceeded a limit.",
    action:"Use smaller writing sections; Gemini scene notes are safe.",
  },
  writer_http_422:{
    title:"Groq could not process the request (422)",
    description:"Groq rejected the request with a semantic/validation error.",
    action:"Check GroqCloud Logs and adjust the request before trying again.",
  },
  writer_http_424:{
    title:"Groq dependency failure (424)",
    description:"Groq reported a dependency failure.",
    action:"Review GroqCloud Logs; the existing Gemini notes are preserved.",
  },
  writer_http_429:{
    title:"Groq rate limit reached (429)",
    description:"Groq rejected a writing request because the project reached a rate limit; this isn't an unknown response.",
    action:"Check GroqCloud usage and limits. Resume Groq writing from saved Gemini notes after capacity resets.",
  },
  writer_http_498:{
    title:"Groq capacity unavailable (498)",
    description:"Groq reported Flex capacity exceeded. The request was not processed.",
    action:"Wait for provider capacity and review your Groq plan before resuming.",
  },
  writer_http_500:{
    title:"Groq internal service error (500)",
    description:"Groq returned a server-side error. Your saved notes and completed writing sections are retained.",
    action:"Review GroqCloud Logs, then resume writing if appropriate.",
  },
  writer_http_502:{
    title:"Groq gateway failure (502)",
    description:"Groq returned a server gateway error, not a successful draft.",
    action:"Check GroqCloud service and resume when available.",
  },
  writer_http_503:{
    title:"Groq temporarily unavailable (503)",
    description:"Groq returned a service-unavailable response; the original recording isn't affected.",
    action:"Check GroqCloud service and resume after capacity returns.",
  },
  writer_http_504:{
    title:"Groq gateway timed out (504)",
    description:"Groq returned a gateway timeout; no usable draft was returned.",
    action:"Check GroqCloud Logs and resume after capacity returns.",
  },
  writer_http_rejected:{
    title:"Groq rejected the request",
    description:"Groq explicitly responded with an unexpected non-success status.",
    action:"Check GroqCloud Logs before a new attempt.",
  },
  writer_timeout_uncertain:{
    title:"Groq did not respond before timeout",
    description:"The writing request waited for a response but timed out. Groq may have processed or charged it.",
    action:"Check GroqCloud Logs before choosing another writing request.",
  },
  writer_network_uncertain:{
    title:"Groq network result unknown",
    description:"TWE couldn't receive a reliable Groq response. The request may have been processed.",
    action:"Check GroqCloud Logs before choosing another writing request.",
  },
  writer_response_unavailable:{
    title:"Groq answer could not be received",
    description:"Groq acknowledged the request, but TWE lost the response body.",
    action:"A repeat may use quota. Check GroqCloud Logs before resuming.",
  },
  writer_response_invalid:{
    title:"Groq answer was invalid",
    description:"Groq responded successfully but returned an unusable or oversized body.",
    action:"Saved Gemini notes remain available for a manually approved new writing attempt.",
  },
  writer_output_invalid:{
    title:"Groq produced unusable text",
    description:"Groq returned an empty or invalid summary after processing. The request may have used quota.",
    action:"Check GroqCloud Logs. Existing notes and completed sections are preserved.",
  },
  writer_output_truncated:{
    title:"Groq answer exceeded its token budget",
    description:"Groq stopped generation at its completion-token limit instead of returning a complete answer.",
    action:"Reduce response length or adjust model limits before requesting another recap draft.",
  },
  writer_checkpoint_uncertain:{
    title:"Groq writer checkpoint could not be saved",
    description:"Groq may have generated a response, but TWE could not finish saving the writing stage.",
    action:"Review saved progress before retrying. The original Gemini scene notes remain.",
  },
  audio_notes_invalid:{
    title:"Gemini audio notes failed validation",
    description:"Gemini finished audio processing but did not return enough reliable scene notes for the recap writer.",
    action:"The original recording remains saved. TWE did not send any writing request to Groq.",
  },
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
    description:"TWE can automatically divide verified AAC M4A, CBR MP3, and PCM WAV recordings. This recording has an unsupported codec or non-contiguous media layout.",
    action:"Keep the recording in Drive. This unsupported audio needs a different remuxing/decoding pathway; no Gemini request was submitted by this attempt.",
  },
  long_audio_metadata_invalid:{
    title:"Recording could not be safely divided",
    description:"The audio's timing or container structure did not match what TWE can verify without decoding the entire recording.",
    action:"Keep the original Drive file. TWE could not verify this recording's sample boundaries and stopped without submitting a Gemini request.",
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
  gemini_file_start_failed:"Gemini did not create the temporary upload session, but its response did not identify a supported cause. The audio is still in Drive.",
  gemini_file_start_network_error:"TWE could not reach Gemini to start the file upload. No audio bytes or model request were sent. Check for a Google outage or retry later.",
  gemini_file_start_timeout:"Gemini's upload-session request timed out. No model generation started. Wait briefly before trying again.",
  gemini_file_start_http_400:"Gemini returned HTTP 400 at upload-session creation. TWE's request or the recording metadata may be invalid; retrying unchanged may fail again.",
  gemini_file_start_http_401:"Gemini returned HTTP 401. Reconnect or verify your Google AI Studio API key under Account; no model generation started.",
  gemini_file_start_http_403:"Gemini returned HTTP 403. Check that the API key and its project allow Gemini Files API uploads, including any key restrictions. No model generation started.",
  gemini_file_start_http_404:"Gemini returned HTTP 404 for upload-session creation. The Files API endpoint may be unavailable; this is not an audio-content failure.",
  gemini_file_start_http_409:"Gemini returned HTTP 409 while creating an upload session. Wait briefly, then retry this preparation step.",
  gemini_file_start_http_413:"Gemini returned HTTP 413 before uploading any audio. Check the file size against the Gemini Files API maximum.",
  gemini_file_start_http_429:"Gemini returned HTTP 429: your project may have reached a file-upload or API rate limit. Check Google AI Studio usage and wait for capacity before retrying; no audio analysis began.",
  gemini_file_start_http_500:"Gemini returned HTTP 500 while opening the upload session. This is a provider-side failure; retry later.",
  gemini_file_start_http_502:"Gemini returned HTTP 502 while opening the upload session. This is a temporary provider/gateway failure; retry later.",
  gemini_file_start_http_503:"Gemini returned HTTP 503 while opening the upload session. The provider may be temporarily unavailable; retry later.",
  gemini_file_start_http_504:"Gemini returned HTTP 504 while opening the upload session. The provider timed out; retry later.",
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
