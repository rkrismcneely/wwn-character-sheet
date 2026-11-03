import {M4A_PILOT_MAX_BYTES,M4A_PILOT_TARGET_MS} from "./recap-m4a-remux.ts";
import type {AudioSegmentPlan} from "./recap-long-audio-plan.ts";

/** GM browser inspects the existing private Drive recording using bounded Range
 * reads. The Cloudflare Free Worker validates only a small ready-made MP4
 * prefix; it does NOT parse 90+ minutes of AAC sample tables on every GET.
 */
export const M4A_PILOT_MAX_PREFIX_BYTES=256*1024;
export function validatePilotM4aPlan(value:unknown,sourceSize:number,
 sourceDurationMs:number|null):{clip:AudioSegmentPlan;bytes:number}{
 if(!value||typeof value!=="object"||Array.isArray(value)||
  !Number.isSafeInteger(sourceSize)||sourceSize<128||
  (sourceDurationMs!==null&&(!Number.isSafeInteger(sourceDurationMs)||
    sourceDurationMs<20_000)))throw Error("Invalid pilot recording metadata.");
 const raw=value as Record<string,unknown>;
 if(raw.index!==0||raw.mimeType!=="audio/mp4"||raw.startMs!==0||
  !Number.isSafeInteger(raw.endMs)||(raw.endMs as number)<20_000||
  (raw.endMs as number)>M4A_PILOT_TARGET_MS+1000||
  (sourceDurationMs!==null&&(raw.endMs as number)>sourceDurationMs+1000)||
  !Number.isSafeInteger(raw.sourceStart)||!Number.isSafeInteger(raw.sourceEnd)||
  (raw.sourceStart as number)<=0||(raw.sourceEnd as number)<=(raw.sourceStart as number)||
  (raw.sourceEnd as number)>sourceSize||
  typeof raw.prefixBase64!=="string"||
  raw.prefixBase64.length>Math.ceil(M4A_PILOT_MAX_PREFIX_BYTES*4/3)+4||
  raw.prefixBase64.length<28||!/^[A-Za-z0-9+/]+={0,2}$/u.test(raw.prefixBase64))
  throw Error("Invalid pilot excerpt boundaries.");
 const prefix=Uint8Array.from(atob(raw.prefixBase64),c=>c.charCodeAt(0));
 const type=String.fromCharCode(...prefix.subarray(4,8));
 const tail=String.fromCharCode(...prefix.subarray(prefix.length-4));
 if(prefix.byteLength<24||prefix.byteLength>M4A_PILOT_MAX_PREFIX_BYTES||
  type!=="ftyp"||tail!=="mdat")throw Error("Invalid standalone MP4 prefix.");
 const bytes=prefix.byteLength+(raw.sourceEnd as number)-(raw.sourceStart as number);
 if(bytes<128||bytes>M4A_PILOT_MAX_BYTES)throw Error("Pilot excerpt exceeds the safe free-tier size.");
 return {clip:{
  index:0,startMs:0,endMs:raw.endMs as number,
  sourceStart:raw.sourceStart as number,sourceEnd:raw.sourceEnd as number,
  mimeType:"audio/mp4",prefixBase64:raw.prefixBase64,
 },bytes};
}
