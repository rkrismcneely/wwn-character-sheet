/** Strict format sniffing for Craig tracks before sending audio to Groq. */
export type CraigGroqFormat={extension:"flac"|"m4a";mimeType:"audio/flac"|"audio/mp4"};
export function sniffCraigGroqFormat(
  filename:string,declaredMime:string|null,prefix:Uint8Array,
):CraigGroqFormat|null {
  if(prefix.byteLength<12)return null;
  const ext=/\.([a-z0-9]{1,5})$/iu.exec(filename)?.[1]?.toLowerCase();
  const tag=(from:number,to:number)=>String.fromCharCode(...prefix.subarray(from,to));
  if(ext==="flac"&&declaredMime==="audio/flac"&&tag(0,4)==="fLaC")
    return {extension:"flac",mimeType:"audio/flac"};
  if((ext==="m4a"||ext==="aac")&&declaredMime==="audio/aac"){
    const view=new DataView(prefix.buffer,prefix.byteOffset,prefix.byteLength);
    const atomSize=view.getUint32(0,false);
    if(atomSize>=12&&atomSize<=4096&&tag(4,8)==="ftyp")
      return {extension:"m4a",mimeType:"audio/mp4"};
  }
  return null;
}
