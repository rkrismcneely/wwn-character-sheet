/** Craig's extracted original audio can be far larger than a transcription clip.
 * Stream only small, authenticated byte windows, never a whole multi-hour file
 * into Worker/browser memory.
 */
export const CRAIG_RANGE_WINDOW_BYTES=1024*1024;
export const CRAIG_RANGE_MAX_SOURCE_BYTES=256*1024*1024;
export const CRAIG_RANGE_MAX_PAGES=Math.ceil(CRAIG_RANGE_MAX_SOURCE_BYTES/CRAIG_RANGE_WINDOW_BYTES);
export type CraigByteRange={start:number;end:number;length:number;total:number};
export function parseCraigRequestedRange(header:string|null,total:number):CraigByteRange{
  if(!Number.isSafeInteger(total)||total<128||total>CRAIG_RANGE_MAX_SOURCE_BYTES)
    throw new Error("Long Craig track exceeds supported size bounds.");
  if(!header)throw new Error("A bounded byte range is required.");
  const match=/^bytes=(0|[1-9][0-9]*)-(0|[1-9][0-9]*)$/u.exec(header);
  if(!match)throw new Error("Choose one explicit byte range; suffix, open-ended and multi-range requests are unavailable.");
  const start=Number(match[1]),end=Number(match[2]);
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||
    start>=total||end>=total||end<start||end-start+1>CRAIG_RANGE_WINDOW_BYTES)
    throw new Error("The requested Craig range exceeds the one-megabyte transfer limit.");
  return {start,end,length:end-start+1,total};
}
export function craigRangeHeaders(part:CraigByteRange,etag:string,mime:string){
  return {
    "content-type":mime,
    "content-length":String(part.length),
    "content-range":"bytes "+part.start+"-"+part.end+"/"+part.total,
    "accept-ranges":"bytes",
    "etag":etag,
    "cache-control":"private, no-store",
    "x-content-type-options":"nosniff",
    "cross-origin-resource-policy":"same-origin",
  };
}
export function validateCraigRangeMime(filename:string,mime:string|null):"audio/flac"|"audio/mp4"{
  const lower=filename.toLowerCase();
  if(lower.endsWith(".flac")&&mime==="audio/flac")return "audio/flac";
  if(/\.(?:m4a|aac)$/u.test(lower)&&mime==="audio/aac")return "audio/mp4";
  throw new Error("Only extracted Craig FLAC and MPEG-4 AAC recordings are supported.");
}
export function parseCraigContentRange(value:string|null,expected:CraigByteRange):void{
  const match=/^bytes (0|[1-9][0-9]*)-(0|[1-9][0-9]*)\/(0|[1-9][0-9]*)$/u.exec(value??"");
  if(!match||Number(match[1])!==expected.start||Number(match[2])!==expected.end||
    Number(match[3])!==expected.total)
    throw new Error("The Craig server returned an inconsistent audio byte range.");
}
export function craigReadPlan(total:number,windowBytes=CRAIG_RANGE_WINDOW_BYTES):CraigByteRange[]{
  if(!Number.isSafeInteger(total)||total<128||total>CRAIG_RANGE_MAX_SOURCE_BYTES||
    !Number.isSafeInteger(windowBytes)||windowBytes<1024||windowBytes>CRAIG_RANGE_WINDOW_BYTES)
    throw new Error("Craig source is outside bounded transfer limits.");
  const result:CraigByteRange[]=[];
  for(let start=0;start<total;start+=windowBytes){
    const end=Math.min(total-1,start+windowBytes-1);
    result.push({start,end,length:end-start+1,total});
  }
  if(result.length>CRAIG_RANGE_MAX_PAGES)throw new Error("Craig source needs too many read requests.");
  return result;
}
