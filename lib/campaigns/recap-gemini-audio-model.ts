/**
 * Audio interpretation is separate from recap writing. A manually approved
 * alternate model is reserved for a previously retried section whose Gemini
 * 3.8 Flash background interaction failed with a provider INTERNAL code.
 * This cannot be selected by a new job or silently applied to another part.
 */
export const GEMINI_AUDIO_DEFAULT_MODEL="gemini-3.8-flash";
export const GEMINI_AUDIO_ALTERNATE_MODEL="gemini-3.6-flash";
export const GEMINI_AUDIO_FIRST_RETRY="manual_retry_after_confirmed_failure";
export const GEMINI_AUDIO_ALTERNATE_RETRY="manual_retry_alternate_3_6";

export function geminiModelForAudioSection(errorCode:string|null):string{
  return errorCode===GEMINI_AUDIO_ALTERNATE_RETRY?
    GEMINI_AUDIO_ALTERNATE_MODEL:GEMINI_AUDIO_DEFAULT_MODEL;
}

/** Only the provider's whitelisted code can enable the alternate pathway. */
export function isGeminiInternalAudioFailure(providerCode:string|null):boolean{
  return providerCode==="internal"||providerCode==="internal_error"||
    providerCode==="api_error";
}
