import type {AudioSegmentPlan} from "./recap-long-audio-plan.ts";

export class RecapM4aPlanError extends Error{
  constructor(){super("This M4A recording could not be safely divided. No Gemini request was submitted.");}
}
/** The browser supplies non-billable boundaries from its own metadata parser.
 * Reject malformed, excessively large or provider-injected plans. The backend
 * independently verifies each boundary against Drive when creating its
 * corresponding single-section M4A header, before any Gemini upload.
 */
export function validateBrowserM4aPlan(
  raw:unknown,byteSize:number,durationMs:unknown,
):AudioSegmentPlan[]{
  if(!Array.isArray(raw)||raw.length<2||raw.length>16||
    !Number.isSafeInteger(byteSize)||byteSize<=0||
    typeof durationMs!=="number"||!Number.isSafeInteger(durationMs)||
    durationMs<=100*60_000||durationMs>8*60*60_000)
    throw new RecapM4aPlanError();
  const result:AudioSegmentPlan[]=[];
  let previousEndMs=0,previousEndByte=0;
  for(let i=0;i<raw.length;i++){
    const part=raw[i] as Record<string,unknown>|null;
    if(!part||typeof part!=="object"||Array.isArray(part)||
      part.index!==i||part.mimeType!=="audio/mp4"||
      typeof part.prefixBase64!=="string"||
      !Number.isSafeInteger(part.startMs)||!Number.isSafeInteger(part.endMs)||
      !Number.isSafeInteger(part.sourceStart)||!Number.isSafeInteger(part.sourceEnd))
      throw new RecapM4aPlanError();
    const prefix=part.prefixBase64 as string;
    // The GM's browser remuxed this authenticated Drive audio. Bound the
    // submitted metadata (never original audio) and check container envelope
    // without decoding multi-megabyte base64 on Workers Free.
    if(prefix.length<96||prefix.length>Math.ceil(1250*1024/3)*4||
      prefix.length%4!==0||!/^[A-Za-z0-9+/]+={0,2}$/u.test(prefix))
      throw new RecapM4aPlanError();
    const first=atob(prefix.slice(0,64)),last=atob(prefix.slice(-64));
    if(first.slice(4,8)!=="ftyp"||!last.endsWith("mdat"))
      throw new RecapM4aPlanError();
    const padding=prefix.endsWith("==")?2:prefix.endsWith("=")?1:0;
    const prefixBytes=prefix.length/4*3-padding;
    const startMs=part.startMs as number,endMs=part.endMs as number,
      start=part.sourceStart as number,end=part.sourceEnd as number;
    if(startMs!==previousEndMs||endMs<=startMs||endMs-startMs>100*60_000+1000||
      prefixBytes+end-start>2*1024*1024*1024||
      start<=0||end>byteSize||end<=start||
      (i>0&&start!==previousEndByte)||
      (i===0&&start>byteSize-16))
      throw new RecapM4aPlanError();
    result.push({index:i,startMs,endMs,sourceStart:start,sourceEnd:end,
      mimeType:"audio/mp4",prefixBase64:prefix});
    previousEndMs=endMs;previousEndByte=end;
  }
  if(Math.abs(previousEndMs-durationMs)>1000)throw new RecapM4aPlanError();
  return result;
}
