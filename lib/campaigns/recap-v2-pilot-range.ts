import {validateAudioRangeHeader} from "./recap-drive-playback-range.ts";
/** An HTTP byte-range over the virtual [MP4 header][original AAC packets].
 * Pure: tested independently of Cloudflare and Google Drive.
 */
export function excerptRequestedRange(value:string|null,size:number):{
  start:number;end:number;status:200|206;
}{
  const normal=validateAudioRangeHeader(value,size);
  if(!normal)return {start:0,end:size-1,status:200};
  const suffix=/^bytes=-(\d+)$/u.exec(normal);
  if(suffix){
    const count=Number(suffix[1]);
    return {start:Math.max(0,size-count),end:size-1,status:206};
  }
  const match=/^bytes=(\d+)-(\d*)$/u.exec(normal);
  if(!match)throw new RangeError("Unsupported byte range.");
  return {start:Number(match[1]),end:match[2]?Number(match[2]):size-1,status:206};
}
