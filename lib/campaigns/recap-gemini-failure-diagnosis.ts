/** Only return whitelisted, privacy-safe Gemini failure categories.
 * Never expose arbitrary model output, provider error messages, audio metadata,
 * Gemini interaction IDs or API credentials in a GM diagnostic response.
 */
export type RecapFailureDiagnosis={
  kind:"input_limit"|"minute_rate_limit"|"daily_quota"|"server_error"|
    "request_rejected"|"permission"|"content_blocked"|"unknown";
  title:string;
  explanation:string;
  inputTokens:number|null;
  providerCode:string|null;
  diagnosticFingerprint:string;
};

type GeminiDiagnostic={
  response?:unknown;
  details?:unknown;
  failure?:unknown;
  output?:unknown;
  status?:unknown;
  errors?:unknown;
  error?:unknown;
  usage?:unknown;
};
const safeCodes=new Set([
  "rate_limit_exceeded","too_many_requests","resource_exhausted","quota_exceeded",
  "out_of_range","invalid_argument","api_error","unavailable","service_unavailable",
  "internal","internal_error","server_error","deadline_exceeded","permission_denied",
  "unauthenticated","authentication","payment_required","failed_precondition",
  "safety_blocked","blocked","content_filtered","invalid_request",
  "parameter_unknown","model_not_found","cancelled","canceled","incomplete",
]);
function errorObjects(raw:GeminiDiagnostic):Record<string,unknown>[]{
  const results:Record<string,unknown>[]=[];
  const add=(value:unknown,depth:number)=>{
    if(depth>3||results.length>=24||!value||typeof value!=="object")return;
    if(Array.isArray(value)){for(const item of value.slice(0,8))add(item,depth+1);return;}
    const item=value as Record<string,unknown>;
    results.push(item);
    for(const key of ["errors","error","failure","details","response","output","cause","statusDetails"])
      if(key in item)add(item[key],depth+1);
  };
  add(raw,0);
  return results;
}
function errorCodes(raw:GeminiDiagnostic):string[]{
  return errorObjects(raw).flatMap(value=>["code","reason","status"].map(key=>{
    const code=value[key];
    if(typeof code!=="string"||code.length>240)return "";
    const normalized=code.toLowerCase().split(/[/?#]/u).filter(Boolean).at(-1)??"";
    return safeCodes.has(normalized)?normalized:"";
  })).filter(Boolean);
}
function mentioned(raw:GeminiDiagnostic,pattern:RegExp):boolean{
  return errorObjects(raw).some(value=>typeof value.message==="string"&&
    value.message.length<=4000&&pattern.test(value.message));
}
function usageTokens(raw:GeminiDiagnostic):number|null{
  const data=raw.usage as {total_input_tokens?:unknown}|null;
  const value=data?.total_input_tokens;
  return typeof value==="number"&&Number.isSafeInteger(value)&&value>=0&&value<=100_000_000
    ?value:null;
}
export function summarizeRecapGeminiFailure(raw:unknown):RecapFailureDiagnosis{
  const result=raw&&typeof raw==="object"?raw as GeminiDiagnostic:{};
  const codes=errorCodes(result);
  const has=(...values:string[])=>codes.some(code=>values.includes(code));
  const inputTokens=usageTokens(result);
  // Fingerprint includes only recognized code names and schema presence, never raw messages.
  const providerCode=codes[0]??null;
  const fingerprint="gemini-v2:"+[providerCode??"none",
    ...["errors","error","failure","details","response","output"].filter(key=>key in result),
    inputTokens===null?"no-usage":"has-usage"].join(":");
  const describe=(kind:RecapFailureDiagnosis["kind"],title:string,explanation:string):RecapFailureDiagnosis=>
    ({kind,title,explanation,inputTokens,providerCode,diagnosticFingerprint:fingerprint});
  if(has("rate_limit_exceeded","too_many_requests","resource_exhausted")||
    mentioned(result,/tokens? per minute|per-minute (?:token|input)|tpm\b/iu))
    return describe("minute_rate_limit","Gemini per-minute limit",
      "Gemini indicates a rate or token-per-minute limit. Verify this project's current limits in Google AI Studio. A long recording may require processing in smaller segments.");
  if(has("quota_exceeded")||mentioned(result,/daily quota|requests? per day|rpd\b/iu))
    return describe("daily_quota","Gemini daily quota",
      "Gemini indicates that the daily quota was exceeded. Check your project's daily request allowance and reset time.");
  if(has("out_of_range")||
    mentioned(result,/(?:input|context|prompt|audio).{0,48}(?:too large|exceed|token limit|maximum tokens)|(?:too many|exceeded).{0,30}(?:input |context )?tokens/iu))
    return describe("input_limit","Recording or input too large",
      "Gemini indicates that the request exceeds an input limit. Splitting the recording into smaller analyzed sections may be required.");
  if(has("api_error","unavailable","service_unavailable","internal","internal_error","server_error","deadline_exceeded"))
    return describe("server_error","Gemini service failure",
      "Gemini reported a service-side error. Eligible jobs may receive one delayed, verified recovery attempt; otherwise processing remains stopped.");
  if(has("permission_denied","unauthenticated","authentication","payment_required","failed_precondition"))
    return describe("permission","Gemini account or billing restriction",
      "Gemini reported an authorization, account, or billing restriction. Review the connected project in Google AI Studio.");
  if(has("safety_blocked","blocked","content_filtered")||
    mentioned(result,/blocked by safety|safety filter|content policy/iu))
    return describe("content_blocked","Gemini content restriction",
      "Gemini indicates that its safety or content filtering prevented processing.");
  if(has("invalid_request","invalid_argument","parameter_unknown","model_not_found"))
    return describe("request_rejected","Gemini request rejected",
      "Gemini reported an invalid or unsupported request. TWE's provider integration may need correction.");
  return describe("unknown","Gemini did not provide a specific failure reason",
    "Gemini reported that this interaction failed but did not return a recognized diagnostic. The original audio remains in Google Drive.");
}
