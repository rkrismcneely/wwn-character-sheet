import {
  CRAIG_RANGE_MAX_SOURCE_BYTES,CRAIG_RANGE_WINDOW_BYTES,
  parseCraigContentRange,type CraigByteRange,
} from "./recap-craig-audio-ranges.ts";

export type CraigLongSourceMetadata={
  bytes:number;mimeType:"audio/flac"|"audio/mp4";etag:string;
  maxRangeBytes:number;
};
export type CraigLongSourceProgress={
  receivedBytes:number;requestedBytes:number;totalSourceBytes:number;
};
const ETAG=/^"[^"\r\n]{1,200}"$/u;
const format=(raw:string|null):"audio/flac"|"audio/mp4"=>{
  if(raw==="audio/flac"||raw==="audio/mp4")return raw;
  throw new Error("Craig source is not a supported original FLAC/MPEG-4 AAC track.");
};
function parseMetadata(headers:Headers):CraigLongSourceMetadata{
  const bytes=Number(headers.get("content-length"));
  const maxRangeBytes=Number(headers.get("x-twe-max-range-bytes"));
  const etag=headers.get("etag")??"";
  if(!Number.isSafeInteger(bytes)||bytes<128||bytes>CRAIG_RANGE_MAX_SOURCE_BYTES||
    maxRangeBytes!==CRAIG_RANGE_WINDOW_BYTES||!ETAG.test(etag))
    throw new Error("Craig streaming source returned invalid size or change token.");
  return {bytes,maxRangeBytes,etag,mimeType:format(headers.get("content-type"))};
}
/**
 * Same-origin, GM-authenticated private range reader.
 * Consumers request one <=1MiB window at a time and can process/evict it
 * immediately without materializing the entire compressed recording.
 */
export async function openPrivateCraigRangeReader(
  campaignId:string,importId:string,trackIndex:number,
  options:{fetcher?:typeof fetch;signal?:AbortSignal;
    onProgress?:(progress:CraigLongSourceProgress)=>void}={},
){
  if(!/^[a-zA-Z0-9_-]{5,128}$/u.test(campaignId)||
    !/^[a-zA-Z0-9_-]{5,128}$/u.test(importId)||
    !Number.isSafeInteger(trackIndex)||trackIndex<0||trackIndex>127)
    throw new Error("Invalid private Craig recording identity.");
  const fetcher=options.fetcher??fetch;
  const endpoint="/api/campaigns/"+encodeURIComponent(campaignId)+
    "/recap-imports/craig-track-range?importId="+encodeURIComponent(importId)+
    "&entryIndex="+trackIndex;
  const start=await fetcher(endpoint,{method:"HEAD",cache:"no-store",
    credentials:"same-origin",signal:options.signal});
  if(!start.ok)throw new Error("The Craig source is unavailable or you lack GM access.");
  const metadata=parseMetadata(start.headers);
  let bytesRead=0;
  async function read(offset:number,length:number):Promise<Uint8Array<ArrayBuffer>>{
    if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(length)||
      length<1||length>metadata.maxRangeBytes||offset+length>metadata.bytes)
      throw new Error("Requested Craig source read exceeds its bounded window.");
    const part:CraigByteRange={start:offset,end:offset+length-1,length,total:metadata.bytes};
    const response=await fetcher(endpoint,{method:"GET",cache:"no-store",
      credentials:"same-origin",signal:options.signal,
      headers:{"range":"bytes="+part.start+"-"+part.end,"if-match":metadata.etag}});
    if(response.status===412)throw new Error("Craig source changed; restart preparation from the original audio.");
    if(response.status!==206||response.redirected)
      throw new Error("Craig server rejected the private bounded range.");
    parseCraigContentRange(response.headers.get("content-range"),part);
    if(response.headers.get("etag")!==metadata.etag)
      throw new Error("Craig source changed while reading.");
    const declared=Number(response.headers.get("content-length"));
    if(declared!==length)
      throw new Error("Craig source response length does not match the requested bytes.");
    // The response is at most 1MiB; no giant Blob or unbounded arrayBuffer.
    const body=new Uint8Array(await response.arrayBuffer());
    if(body.byteLength!==length)
      throw new Error("Private Craig source returned a truncated or oversized chunk.");
    bytesRead+=length;
    options.onProgress?.({receivedBytes:bytesRead,
      requestedBytes:length,totalSourceBytes:metadata.bytes});
    return body;
  }
  return {metadata,read};
}
export type CraigFlacStreamInfo={
  sampleRate:number;channels:number;bitsPerSample:number;
  totalSamples:number|null;durationMs:number|null;
};
/** Read only the 42-byte FLAC header and STREAMINFO, never decode full audio. */
export function inspectCraigFlacStreamInfo(bytes:Uint8Array):CraigFlacStreamInfo{
  if(bytes.length<42||String.fromCharCode(...bytes.subarray(0,4))!=="fLaC"||
    (bytes[4]&0x7f)!==0||((bytes[5]<<16)|(bytes[6]<<8)|bytes[7])!==34)
    throw new Error("Craig FLAC header is not a standard STREAMINFO block.");
  const a=8;
  const sampleRate=(bytes[a+10]<<12)|(bytes[a+11]<<4)|(bytes[a+12]>>4);
  const channels=((bytes[a+12]>>1)&7)+1;
  const bitsPerSample=(((bytes[a+12]&1)<<4)|(bytes[a+13]>>4))+1;
  const totalSamples=(bytes[a+13]&15)*4294967296+
    ((bytes[a+14]*16777216)+(bytes[a+15]<<16)+(bytes[a+16]<<8)+bytes[a+17]);
  if(sampleRate<8000||sampleRate>192000||channels<1||channels>8||
    bitsPerSample<4||bitsPerSample>32||!Number.isSafeInteger(totalSamples))
    throw new Error("Craig FLAC stream reports unsafe audio metadata.");
  return {sampleRate,channels,bitsPerSample,
    totalSamples:totalSamples>0?totalSamples:null,
    durationMs:totalSamples>0?Math.round(totalSamples/sampleRate*1000):null};
}
