/** Format-aware segmentation for long GM-owned Drive recordings.
 * Source bytes stay in Drive; segments are virtual, independently decodable
 * audio files assembled during the existing resumable Files upload.
 *
 * Only support formats we can split without decoding/transcoding in Workers
 * Free's 10ms CPU budget. Never guess playable byte boundaries for M4A/FLAC.
 */
export const LONG_AUDIO_THRESHOLD_MS=60*60_000;
export const SEGMENT_TARGET_MS=60*60_000;
export const SEGMENT_MAX_MS=60*60_000;
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
function format(start:number,byteCount:number,channels:number,rate:number,
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
    if(!f||(required&&(f.sampleRate!==required.sampleRate)))continue;
    const next=mp3Frame(data,off+f.bytes);
    if(!next||next.sampleRate!==f.sampleRate)continue;
    const third=mp3Frame(data,off+f.bytes+next.bytes);
    if(!third||third.sampleRate!==f.sampleRate)continue;
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
  let first=firstOffset+relative;
  const frame=mp3Frame(head,first)!;
  // LAME/FFmpeg often writes Xing/Info duration metadata into a first, non-
  // audible MP3 frame. Its duration describes the FULL recording, not the
  // virtual first segment. Exclude that metadata frame so the first section
  // is independently timed and playable without lying about its duration.
  const firstFrame=head.subarray(first,first+frame.bytes);
  const ascii=new TextDecoder("latin1").decode(firstFrame);
  if(ascii.includes("Xing")||ascii.includes("Info")){
    first+=frame.bytes;
    const audio=mp3Frame(head,first);
    if(!audio||audio.rate!==frame.rate||audio.sampleRate!==frame.sampleRate)
      throw new LongAudioFormatError("format_unsupported");
  }
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
    // MP3 frames do not reveal decoded silence. For VBR files, sustained
    // low-bitrate frames can indicate a pause; sample a bounded neighborhood
    // and prefer it only when the evidence is substantially below baseline.
    // CBR files retain the technically valid, balanced frame boundary.
    let boundary:number|null=null;
    const candidateScores:{position:number;rate:number}[]=[];
    for(const delta of [-120_000,-60_000,0,60_000,120_000]){
      const estimate=Math.max(first+4096,Math.min(source.byteSize-16384,
        guess+Math.round(delta/1000*frame.rate/8)));
      const lo=Math.max(first,estimate-2048);
      const window=await read(lo,Math.min(8192,source.byteSize-lo));
      const match=frameAt(window,estimate-lo,frame);
      if(match===null)continue;
      let sum=0,seen=0,offset=match;
      while(offset+4<window.length&&seen<12){
        const packet=mp3Frame(window,offset);
        if(!packet||packet.sampleRate!==frame.sampleRate)break;
        sum+=packet.rate;seen++;offset+=packet.bytes;
      }
      if(seen>=6)candidateScores.push({position:lo+match,rate:sum/seen});
    }
    if(!candidateScores.length)throw new LongAudioFormatError("format_unsupported");
    const baseline=candidateScores.reduce((sum,v)=>sum+v.rate,0)/candidateScores.length;
    const quiet=candidateScores.filter(v=>v.rate<baseline*0.65);
    boundary=(quiet.length?quiet:candidateScores).reduce((best,v)=>
      Math.abs(v.position-guess)<Math.abs(best.position-guess)?v:best).position;
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
  // WAV can measure actual PCM amplitude, unlike compressed AAC. Restrict
  // the entire planning invocation to at most 24 metadata/quietness probes,
  // comfortably below Workers Free's 50-subrequest hard ceiling.
  const edges=[meta.start];
  const totalBudget=24;
  const sampleWindow=Math.min(meta.rate*meta.align,16*1024);
  for(let i=1;i<count;i++){
    const idealFrame=Math.floor(frames*i/count);
    let chosen=idealFrame;
    if(meta.codec===1&&meta.align/meta.channels===2){
      const previous=Math.floor((edges[i-1]-meta.start)/meta.align);
      const earliest=previous+meta.rate*15*60;
      const latest=Math.min(frames-(count-i)*meta.rate*15*60,
        previous+meta.rate*60*60);
      const lo=Math.max(earliest,idealFrame-meta.rate*12*60);
      const hi=Math.min(latest,idealFrame+meta.rate*12*60);
      const probes=Math.floor(totalBudget/(count-1));
      if(hi>lo&&probes>=5){
        const results:{frame:number;rms:number}[]=[];
        for(let n=0;n<probes;n++){
          const frame=lo+Math.floor((hi-lo)*n/(probes-1));
          const position=meta.start+frame*meta.align;
          const len=Math.min(sampleWindow,meta.start+meta.dataBytes-position);
          if(len<meta.align*100)continue;
          const audio=await read(position,len);
          if(audio.byteLength!==len)throw new LongAudioFormatError("metadata_invalid");
          const view=new DataView(audio.buffer,audio.byteOffset,audio.byteLength);
          let energy=0,measured=0;
          for(let k=0;k+1<len;k+=32){
            const amplitude=view.getInt16(k,true)/32768;
            energy+=amplitude*amplitude;
            measured++;
          }
          results.push({frame,rms:Math.sqrt(energy/Math.max(1,measured))});
        }
        const values=results.map(v=>v.rms).sort((a,b)=>a-b);
        const baseline=values[Math.floor(values.length/2)]??0;
        let score=Infinity;
        for(let k=1;k+1<results.length;k++){
          // At least three consecutive minute-scale quiet probes are needed.
          const group=results.slice(k-1,k+2);
          const quiet=Math.max(...group.map(v=>v.rms));
          if(baseline<=0.003||quiet>0.05||quiet>baseline*0.35)continue;
          const candidate=group[1].frame;
          const value=quiet+Math.abs(candidate-idealFrame)/meta.rate/60*0.00005;
          if(value<score){score=value;chosen=candidate;}
        }
      }
    }
    const minFrame=Math.floor((edges[i-1]-meta.start)/meta.align)+meta.rate*15*60;
    const maxFrame=Math.min(frames-(count-i)*meta.rate*15*60,
      Math.floor((edges[i-1]-meta.start)/meta.align)+meta.rate*60*60);
    if(minFrame>maxFrame)throw new LongAudioFormatError("metadata_invalid");
    chosen=Math.max(minFrame,Math.min(maxFrame,chosen));
    edges.push(meta.start+chosen*meta.align);
  }
  edges.push(meta.start+meta.dataBytes);
  return edges.slice(0,-1).map((start,i)=>{
    const dataSize=edges[i+1]-start;
    return {
      index:i,startMs:Math.round((start-meta.start)/byteRate*1000),
      endMs:Math.round((edges[i+1]-meta.start)/byteRate*1000),
      sourceStart:start,sourceEnd:edges[i+1],
      prefixBase64:format(meta.codec,dataSize,meta.channels,meta.rate,meta.align),
      mimeType:"audio/wav",
    };
  });
}
/** Recover a missing recording duration from small Drive metadata ranges.
 * The upload UI historically saved duration_ms=null. This avoids silently
 * sending a multi-hour MP3/WAV as one over-limit Gemini request.
 */
export async function estimateAudioDurationMs(source:Source,read:Reader):Promise<number|null>{
  try{
    const head=await read(0,Math.min(source.byteSize,64*1024));
    if(source.mimeType==="audio/wav"){
      const info=wavInfo(head,source.byteSize);
      return Math.round(info.dataBytes/(info.rate*info.align)*1000);
    }
    if(source.mimeType==="audio/mpeg"||source.mimeType==="audio/mp3"){
      let first=0;
      if(head.length>=10&&String.fromCharCode(...head.subarray(0,3))==="ID3"){
        first=10+((head[6]&127)<<21)+((head[7]&127)<<14)+((head[8]&127)<<7)+(head[9]&127);
        if(head[5]&16)first+=10;
      }
      if(first>=head.length-3000)return null;
      const frameIndex=frameAt(head.subarray(first),0,null);
      if(frameIndex===null)return null;
      first+=frameIndex;
      const frame=mp3Frame(head,first);
      if(!frame)return null;
      return Math.round((source.byteSize-first)*8/frame.rate);
    }
  }catch{
    return null;
  }
  return null;
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
