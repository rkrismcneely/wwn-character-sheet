/** Google documents approximately 32 input tokens per second of audio.
 * This is an estimate, not a retrieved project rate limit or remaining quota.
 * Journal context and generated output consume additional tokens.
 */
export const GEMINI_AUDIO_TOKENS_PER_SECOND=32;
export function estimatedRecapAudioTokens(durationMs:number|null|undefined):number|null{
  if(typeof durationMs!=="number"||!Number.isFinite(durationMs)||durationMs<=0||
    durationMs>8*60*60*1000)return null;
  return Math.ceil(durationMs/1000*GEMINI_AUDIO_TOKENS_PER_SECOND);
}
export function recapQuotaNotice(durationMs:number|null|undefined):{
  estimatedTokens:number|null;size:"unknown"|"ordinary"|"large";message:string;
}{
  const estimatedTokens=estimatedRecapAudioTokens(durationMs);
  if(estimatedTokens===null)return {
    estimatedTokens:null,size:"unknown",
    message:"TWE could not determine the recording duration. Check your model's input-token limits in Google AI Studio before approving this full-length request.",
  };
  if(estimatedTokens>=200000)return{
    estimatedTokens,size:"large",
    message:"This long recording may exceed your project's input-tokens-per-minute limit even when the model's context window is large. TWE cannot read your remaining free allowance or guarantee acceptance.",
  };
  return{estimatedTokens,size:"ordinary",
    message:"This is only the estimated audio portion; journal context and output require additional tokens. Your own project's rate limits still apply.",
  };
}
