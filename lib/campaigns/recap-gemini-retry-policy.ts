import {summarizeRecapGeminiFailure} from "./recap-gemini-failure-diagnosis.ts";

/** Only a completed, terminal failed provider interaction may be retried.
 * One automatic reattempt, delayed 30 minutes, of a transient INTERNAL error.
 * Ambiguous submissions, rate/quota errors, rejected inputs and later failures
 * always require GM intervention; no audio analysis is re-run for ready sections.
 */
export const GEMINI_CONFIRMED_RETRY_MARKER="auto_retry_after_confirmed_internal";
export const GEMINI_CONFIRMED_RETRY_DELAY_MS=30*60_000;

export function canAutoRetryGeminiSection(raw:Record<string,unknown>,previousError:string|null):boolean{
  if(raw.status!=="failed"||previousError!==null)return false;
  const result=summarizeRecapGeminiFailure(raw);
  return result.kind==="server_error"&&
    ["internal","internal_error","api_error","unavailable","service_unavailable"].includes(result.providerCode??"");
}
export function isGeminiSectionCoolingDown(errorCode:string|null,updatedAt:string,clockMs=Date.now()):boolean{
  if(errorCode!==GEMINI_CONFIRMED_RETRY_MARKER)return false;
  const when=Date.parse(updatedAt);
  return Number.isFinite(when)&&clockMs-when<GEMINI_CONFIRMED_RETRY_DELAY_MS;
}
