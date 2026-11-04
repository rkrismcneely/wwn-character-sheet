/** Supported *file* transcription choices. Live and TTS models are deliberately excluded.
 * Do not display speculative quota numbers: Google assigns limits by model, tier and project.
 */
export const GEMINI_TRANSCRIPTION_MODELS = [
  {id:"gemini-3.5-transcribe", name:"Gemini 3.5 Transcribe", recommended:true,
    description:"Dedicated speech-to-text; word timestamps for clickable audio references.",
    timing:"word", note:"Up to 30 minutes per clip with word timestamps. Recommended."},
  {id:"gemini-3.5-flash-lite", name:"Gemini 3.5 Flash-Lite", recommended:false,
    description:"Lower-cost general-purpose audio model, useful when avoiding higher-tier quota.",
    timing:"section", note:"Economy fallback; accuracy and timestamp precision may be lower."},
  {id:"gemini-3.6-flash", name:"Gemini 3.6 Flash", recommended:false,
    description:"Balanced general-purpose audio model; separate model-specific quota.",
    timing:"section", note:"Full transcript requested without guaranteed word timestamps."},
  {id:"gemini-3.8-flash", name:"Gemini 3.8 Flash", recommended:false,
    description:"General audio understanding fallback when Transcribe quota is exhausted.",
    timing:"section", note:"Full transcription requested; precise word timestamps aren't guaranteed."},
] as const;
export type GeminiTranscriptionModel=(typeof GEMINI_TRANSCRIPTION_MODELS)[number]["id"];
export const DEFAULT_GEMINI_TRANSCRIPTION_MODEL:GeminiTranscriptionModel="gemini-3.5-transcribe";
export function parseGeminiTranscriptionModel(value:unknown):GeminiTranscriptionModel {
  if(typeof value==="string" && GEMINI_TRANSCRIPTION_MODELS.some(m=>m.id===value))
    return value as GeminiTranscriptionModel;
  throw Error("Choose a supported Gemini transcription model.");
}
