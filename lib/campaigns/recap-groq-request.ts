import {boundedGroqResponse} from "./recap-groq-writer.ts";

/** Fixed, privacy-safe error codes. Never include provider bodies or API keys. */
export class GroqWriterFailure extends Error {
  readonly code:string;
  constructor(code:string){
    super(code);this.code=code;this.name="GroqWriterFailure";
  }
}
const knownHttp=new Set([400,401,403,404,408,409,413,422,424,429,498,500,502,503,504]);
export function groqHttpError(status:number):string{
  return knownHttp.has(status)?"writer_http_"+status:"writer_http_rejected";
}
/**
 * A definitive HTTP rejection is different from a request whose response was
 * lost. Neither is retried automatically. GM-specific quota/permission errors
 * should never be presented as an unconfirmed chargeable response.
 */
export async function requestGroqWriter(
  key:string,model:string,prompt:string,maxTokens:number,
):Promise<string>{
  let response:Response;
  try{
    response=await fetch("https://api.groq.com/openai/v1/chat/completions",{
      method:"POST",redirect:"manual",signal:AbortSignal.timeout(55_000),
      headers:{Authorization:"Bearer "+key,"content-type":"application/json"},
      body:JSON.stringify({
        model,temperature:0.35,reasoning_effort:"low",
        include_reasoning:false,stream:false,
        messages:[{role:"user",content:prompt}],max_completion_tokens:maxTokens,
      }),
    });
  }catch(error){
    if(error instanceof Error&&["TimeoutError","AbortError"].includes(error.name))
      throw new GroqWriterFailure("writer_timeout_uncertain");
    throw new GroqWriterFailure("writer_network_uncertain");
  }
  if(!response.ok||response.redirected)
    throw new GroqWriterFailure(response.redirected?"writer_http_rejected":groqHttpError(response.status));
  if(Number(response.headers.get("content-length")??"0")>125_000)
    throw new GroqWriterFailure("writer_response_invalid");
  let raw:string;
  try{raw=await response.text();}
  catch{throw new GroqWriterFailure("writer_response_unavailable");}
  if(raw.length>125_000)throw new GroqWriterFailure("writer_response_invalid");
  let parsed:unknown;
  try{parsed=JSON.parse(raw);}
  catch{throw new GroqWriterFailure("writer_response_invalid");}
  if(parsed&&typeof parsed==="object"){
    const data=parsed as {
      choices?:{finish_reason?:string;message?:{content?:unknown}}[];
      usage?:{completion_tokens?:number;completion_tokens_details?:{reasoning_tokens?:number}};
    };
    if(data.choices?.[0]?.finish_reason==="length")
      throw new GroqWriterFailure("writer_output_truncated");
    const content=data.choices?.[0]?.message?.content;
    if(data.choices?.[0]?.message&&
      (content==null||(typeof content==="string"&&!content.trim()))){
      const used=data.usage?.completion_tokens;
      const reasoning=data.usage?.completion_tokens_details?.reasoning_tokens;
      // Usage metadata is safe to inspect; never store reasoning or raw provider text.
      if(typeof used==="number"&&used>0&&typeof reasoning==="number"&&reasoning>=used)
        throw new GroqWriterFailure("writer_reasoning_only");
      throw new GroqWriterFailure("writer_output_empty");
    }
  }
  try{return boundedGroqResponse(parsed);}
  catch{throw new GroqWriterFailure("writer_output_invalid");}
}

/** The GM must separately approve these cases; request may have consumed quota. */
export const manualGroqWriterErrors=new Set([
  "writer_submission_uncertain", // Historical generic error cannot be reconstructed.
  "writer_timeout_uncertain","writer_network_uncertain",
  "writer_response_unavailable","writer_response_invalid","writer_output_invalid",
  "writer_output_empty","writer_reasoning_only",
  "writer_section_too_short","writer_section_too_long",
  "writer_output_truncated","writer_checkpoint_uncertain",
  "writer_http_429","writer_http_500","writer_http_502","writer_http_503","writer_http_504",
]);
