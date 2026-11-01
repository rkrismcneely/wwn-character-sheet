/** Format-aware segmentation for long GM-owned Drive recordings.
 * Source bytes stay in Drive; segments are virtual, independently decodable
 * audio files assembled during the existing resumable Files upload.
 *
 * Only support formats we can split without decoding/transcoding in Workers
 * Free's 10ms CPU budget. Never guess playable byte boundaries for M4A/FLAC.
 */
export const LONG_AUDIO_THRESHOLD_MS=95*60_000;
export const SEGMENT_TARGET_MS=35*60_000;
export const MAX_RECAP_SEGMENTS=16;
type Source={byteSize:number;durationMs:number|null;mimeType:string};
export type AudioSegmentPlan={
  index:number;startMs:number;endMs:number;sourceStart:number;sourceEnd:number;
  prefixBase64:string;mimeType:string;
};
export class LongAudioFormatError extends Error{
  readonly code:"format_unsupported"|"metadata_invalid"|"too_many_segments";
  constructor(code:"format_unsupported"|"metadata_invalid"|"too_many_segments"){
    super("Long audio cannot be safely segmented: "+code);
    this.code=code;
  }
}
type Reader=(start:number,length:number)=>Promise<Uint8Array>;
function format(data:Uint8Array,start:number,byteCount:number,channels:number,rate:number,
  blockAlign:number):string{
  if(byteCount>0xffffffff-36)throw new LongAudioFormatError("metadata_invalid");
  const header=new Uint8Array(44),v=new DataView(header.buffer);
  const label=(pos:number,name:string)=>{for(let i=0;i<name.length;i++)header[pos+i]=name.charCodeAt(i);};
  label(0,"RIFF");v.setUint32(4,36+byteCount,true);label(8,"WAVE");
  label(12,"fmt ");v.setUint32(16,16,true);v.setUint16(20,start,true);
  v.setUint16(22,channels,true);v.setUint32(24,rate,true);
  v.setUint32(28,rate*blockAlign,true);v.setUint16(32,blockAlign,true);
  v.setUint16(34,blockAlign/channels*8,true);
  label(36,"data");v.setUint32(40,byteCount,true);
  // There are exactly 44 bytes; convert without huge spread arguments.
  let raw="";for(const value of header)raw+=String.fromCharCode(value);
  return btoa(raw);
}
function wavInfo(bytes:Uint8Array,total:number){
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const name=(off:number)=>String.fromCharCode(...bytes.subarray(off,off+4));
  if(bytes.length<44||name(0)!=="RIFF"||name(8)!=="WAVE")
    throw new LongAudioFormatError("metadata_invalid");
  let fmt:null|{codec:number;channels:number;rate:number;align:number}=null;
  let start=-1,dataBytes=-1;
  for(let off=12;off+8<=bytes.length;){
    const size=view.getUint32(off+4,true),type=name(off);
    if(type==="fmt "&&size>=16&&off+24<=bytes.length){
      fmt={codec:view.getUint16(off+8,true),channels:view.getUint16(off+10,true),
        rate:view.getUint32(off+12,true),align:view.getUint16(off+20,true)};
    }
    if(type==="data"){start=off+8;dataBytes=size;break;}
    if(size>total||off+8+size<=off)break;
    off+=8+size+(size%2);
  }
  if(!fmt||start<0||dataBytes<=0||start+dataBytes>total||
    ![1,3].includes(fmt.codec)||fmt.channels<1||fmt.channels>8||
    fmt.rate<8000||fmt.rate>192000||fmt.align<1||
    fmt.align%fmt.channels!==0||fmt.align>64||
    dataBytes%fmt.align!==0)
    throw new LongAudioFormatError("format_unsupported");
  return {...fmt,start,dataBytes};
}
type Mp3Frame={rate:number;sampleRate:number;bytes:number};
const BITRATES=[0,32,40,48,56,64,80,96,112,128,160,192,224,256,320,0];
const RATES=[44100,48000,32000];
function mp3Frame(data:Uint8Array,off:number):Mp3Frame|null{
  if(off+4>data.length||data[off]!==0xff||(data[off+1]&0xfe)!==0xfa)return null;
  // MPEG-1 Layer III only; other variants need a real decoder/remuxer.
  const br=BITRATES[(data[off+2]>>4)&15],sr=RATES[(data[off+2]>>2)&3];
  if(!br||!sr)return null;
  const bytes=Math.floor(144000*br/sr)+((data[off+2]>>1)&1);
  return bytes>=100&&bytes<=1500?{rate:br,sampleRate:sr,bytes}:null;
}
function frameAt(data:Uint8Array,estimated:number,required:Mp3Frame|null):number|null{
  let best:{off:number;dist:number}|null=null;
  for(let off=0;off<data.length-2400;off++){
    const f=mp3Frame(data,off);
    if(!f||(required&&(f.rate!==required.rate||f.sampleRate!==required.sampleRate)))continue;
    const next=mp3Frame(data,off+f.bytes);
    if(!next||next.rate!==f.rate||next.sampleRate!==f.sampleRate)continue;
    const third=mp3Frame(data,off+f.bytes+next.bytes);
    if(!third||third.rate!==f.rate||third.sampleRate!==f.sampleRate)continue;
    const dist=Math.abs(off-estimated);
    if(!best||dist<best.dist)best={off,dist};
  }
  return best?.off??null;
}
async function mp3Plan(source:Source,read:Reader):Promise<AudioSegmentPlan[]>{
  const head=await read(0,Math.min(source.byteSize,64*1024));
  let firstOffset=0;
  if(head.length>=10&&String.fromCharCode(...head.subarray(0,3))==="ID3"){
    firstOffset=10+((head[6]&127)<<21)+((head[7]&127)<<14)+((head[8]&127)<<7)+(head[9]&127);
    if(head[5]&16)firstOffset+=10;
  }
  if(firstOffset>=head.length-3000)throw new LongAudioFormatError("format_unsupported");
  const relative=frameAt(head.subarray(firstOffset),0,null);
  if(relative===null)throw new LongAudioFormatError("format_unsupported");
  const first=firstOffset+relative,frame=mp3Frame(head,first)!;
  const inferredMs=Math.round((source.byteSize-first)*8/frame.rate);
  const duration=source.durationMs??inferredMs;
  if(!Number.isSafeInteger(duration)||duration<1||
    Math.abs(duration-inferredMs)/duration>0.15)
    throw new LongAudioFormatError("format_unsupported");
  const count=Math.ceil(duration/SEGMENT_TARGET_MS);
  if(count>MAX_RECAP_SEGMENTS)throw new LongAudioFormatError("too_many_segments");
  const edges=[first];
  for(let i=1;i<count;i++){
    const guess=first+Math.floor((source.byteSize-first)*i/count);
    const lo=Math.max(first,guess-4096);
    const window=await read(lo,Math.min(12288,source.byteSize-lo));
    const match=frameAt(window,guess-lo,frame);
    if(match===null)throw new LongAudioFormatError("format_unsupported");
    const boundary=lo+match;
    if(boundary<=edges[i-1])throw new LongAudioFormatError("metadata_invalid");
    edges.push(boundary);
  }
  edges.push(source.byteSize);
  return edges.slice(0,-1).map((start,i)=>({
    index:i,startMs:Math.round((start-first)/(source.byteSize-first)*duration),
    endMs:i===count-1?duration:
      Math.round((edges[i+1]-first)/(source.byteSize-first)*duration),
    sourceStart:start,sourceEnd:edges[i+1],prefixBase64:"",
    mimeType:"audio/mpeg",
  }));
}
async function wavPlan(source:Source,read:Reader):Promise<AudioSegmentPlan[]>{
  const first=await read(0,Math.min(source.byteSize,64*1024));
  const meta=wavInfo(first,source.byteSize);
  const byteRate=meta.rate*meta.align;
  const duration=Math.round(meta.dataBytes/byteRate*1000);
  if(source.durationMs!==null&&Math.abs(source.durationMs-duration)>30_000)
    throw new LongAudioFormatError("metadata_invalid");
  const count=Math.ceil(duration/SEGMENT_TARGET_MS);
  if(count>MAX_RECAP_SEGMENTS)throw new LongAudioFormatError("too_many_segments");
  const frames=Math.floor(meta.dataBytes/meta.align);
  const edges=Array.from({length:count+1},(_,i)=>
    meta.start+Math.floor(frames*i/count)*meta.align);
  return edges.slice(0,-1).map((start,i)=>{
    const dataSize=edges[i+1]-start;
    return {
      index:i,startMs:Math.round((start-meta.start)/byteRate*1000),
      endMs:Math.round((edges[i+1]-meta.start)/byteRate*1000),
      sourceStart:start,sourceEnd:edges[i+1],
      prefixBase64:format(first,meta.codec,dataSize,meta.channels,meta.rate,meta.align),
      mimeType:"audio/wav",
    };
  });
}
export async function planLongAudio(source:Source,read:Reader):Promise<AudioSegmentPlan[]>{
  if(!Number.isSafeInteger(source.byteSize)||source.byteSize<=0)
    throw new LongAudioFormatError("metadata_invalid");
  if(source.mimeType==="audio/wav")return wavPlan(source,read);
  if(source.mimeType==="audio/mpeg"||source.mimeType==="audio/mp3")return mp3Plan(source,read);
  throw new LongAudioFormatError("format_unsupported");
}
export function offsetRecapSceneHeadings(markdown:string,offsetMs:number):string{
  return markdown.replace(/(^|\n)(#{1,3}\s+)(\d{2}):(\d{2}):(\d{2})(?=\s*[-—:])/gu,
    (original,breakChar,heading,hour,minute,second)=>{
      const sec=Number(hour)*3600+Number(minute)*60+Number(second)+Math.floor(offsetMs/1000);
      if(sec<0||sec>48*3600)return original;
      const h=String(Math.floor(sec/3600)).padStart(2,"0");
      const m=String(Math.floor(sec%3600/60)).padStart(2,"0");
      const s=String(sec%60).padStart(2,"0");
      return breakChar+heading+h+":"+m+":"+s;
    });
}
