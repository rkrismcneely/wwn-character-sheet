import {summarizeRecapGeminiFailure} from "./recap-gemini-failure-diagnosis.ts";

/** A failed interaction is safe to resubmit only after Google confirms it is
 * terminal and identifies an actual transient service error. Quota, content,
 * invalid-input and ambiguous transport errors must never be auto-replayed.
 */
export const AUTO_RETRY_MARKER="auto_retry_after_confirmed_internal";
export const AUTO_RETRY_WAIT_MS=20*60_000;
export const AUTO_RETRY_MAX_PER_SECTION=1;

export function confirmedTransientGeminiError(value:unknown):boolean{
  if(!value||typeof value!=="object"||Array.isArray(value))return false;
  const result=value as Record<string,unknown>;
  if(result.status!=="failed")return false;
  const diagnosis=summarizeRecapGeminiFailure(result);
  return diagnosis.kind==="server_error"&&
    ["internal","internal_error","api_error","service_unavailable","unavailable"].includes(
      diagnosis.providerCode??"");
}

export function recoveryDueAt(timestamp:string):string{
  const parsed=Date.parse(timestamp);
  if(!Number.isFinite(parsed))throw Error("Invalid Gemini recovery time.");
  return new Date(parsed+AUTO_RETRY_WAIT_MS).toISOString();
}
