import type {CraigFlacSource} from "./recap-craig-flac-stream.ts";

/** Craig MP4/M4A AAC metadata and packet demuxer. No audio decoding here.
 * Skip mdat with byte offsets: only the bounded moov metadata is materialized.
 */
export const CRAIG_AAC_MAX_MOOV_BYTES=8*1024*1024;
export const CRAIG_AAC_INDEX_READ_BYTES=512*1024;
export const CRAIG_AAC_MAX_SAMPLES=1500000;

type Box={type:string;start:number;end:number;data:number};
type SampleRun={firstChunk:number;samplesPerChunk:number;descriptionIndex:number};
type TimeRun={count:number;delta:number};
export type CraigAacSample={offset:number;length:number;timestampUs:number;durationUs:number};
export type CraigAacIndex={
  durationMs:number;sampleRate:number;channels:number;sampleCount:number;
  totalFrames:number;
  codec:"mp4a.40.2";description:Uint8Array;
  /** New iterator per attempt. Packets reference original private source ranges. */
  samples:()=>IterableIterator<CraigAacSample>;
};
const invalid=(message:string):never=>{throw new Error("Craig AAC/M4A: "+message);};
const code=(bytes:Uint8Array,at:number)=>String.fromCharCode(...bytes.subarray(at,at+4));
const u32=(bytes:Uint8Array,at:number)=>new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(at,false);
const u16=(bytes:Uint8Array,at:number)=>new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint16(at,false);
const u64=(bytes:Uint8Array,at:number)=>{
  const value=u32(bytes,at)*4294967296+u32(bytes,at+4);
  if(!Number.isSafeInteger(value))invalid("64-bit size or offset exceeds safe browser precision.");
  return value;
};
function parseBox(bytes:Uint8Array,at:number,end:number,origin=0):Box{
  if(!Number.isSafeInteger(at)||at<0||end-at<8||at+8>bytes.length)
    return invalid("incomplete MP4 atom header.");
  const type=code(bytes,at+4);
  let size=u32(bytes,at),header=8;
  if(size===1){
    if(end-at<16||at+16>bytes.length)return invalid("truncated extended MP4 atom.");
    size=u64(bytes,at+8);header=16;
  } else if(size===0){size=end-at;}
  if(size<header||!Number.isSafeInteger(size)||at+size>end)
    return invalid("atom size exceeds its parent.");
  return {type,start:origin+at,end:origin+at+size,data:origin+at+header};
}
function children(bytes:Uint8Array,parent:Box,origin=0):Box[]{
  const result:Box[]=[];
  if(parent.data<origin||parent.end>origin+bytes.length)return invalid("atom outside inspected metadata.");
  for(let at=parent.data-origin;at<parent.end-origin;){
    const b=parseBox(bytes,at,parent.end-origin,origin);result.push(b);at=b.end-origin;
  }
  return result;
}
function one(items:Box[],type:string,required=true):Box|undefined{
  const candidates=items.filter(x=>x.type===type);
  if(candidates.length>1)invalid("ambiguous "+type+" boxes.");
  if(required&&candidates.length!==1)invalid("missing "+type+" box.");
  return candidates[0];
}
function table(bytes:Uint8Array,b:Box,origin:number,stride:number,max:number){
  const at=b.data-origin;
  if(at<0||at+8>bytes.length||b.end-origin<at+8)invalid("truncated "+b.type+" table.");
  if(bytes[at]!==0)invalid("unsupported "+b.type+" table version.");
  const count=u32(bytes,at+4);
  if(count>max||at+8+count*stride!==b.end-origin)
    invalid("unsafe "+b.type+" table length.");
  return {at:at+8,count};
}
function parseEsds(bytes:Uint8Array,box:Box,origin:number):Uint8Array{
  const start=box.data-origin;
  if(bytes[start]!==0)return invalid("unsupported AAC esds version.");
  let p=start+4;
  function readLength(){
    let length=0;
    for(let i=0;i<4;i++){
      if(p>=box.end-origin)invalid("truncated AAC descriptor length.");
      const v=bytes[p++];length=length*128+(v&127);
      if((v&128)===0)return length;
    }
    return invalid("oversized AAC descriptor length.");
  }
  function parse(limit:number,depth:number):Uint8Array|null{
    if(depth>5)invalid("AAC descriptors nested too deeply.");
    while(p<limit){
      const tag=bytes[p++],size=readLength(),end=p+size;
      if(end>limit)invalid("AAC descriptor exceeds parent.");
      if(tag===5){
        const asc=bytes.slice(p,end);
        p=end;
        return asc;
      }
      let nestedStart:number|null=null;
      if(tag===3){
        if(p+3>end)invalid("incomplete ES descriptor.");
        const flags=bytes[p+2];nestedStart=p+3;
        if(flags&128){if(nestedStart+2>end)invalid("bad stream dependency.");nestedStart+=2;}
        if(flags&64){if(nestedStart+1>end)invalid("bad URL descriptor.");nestedStart+=1+bytes[nestedStart];}
        if(flags&32)nestedStart+=2;
      }else if(tag===4){
        nestedStart=p+13; // DecoderConfigDescriptor: objectType, streamType, buffer/max/avg bitrates
      }
      if(nestedStart!==null){
        if(nestedStart>end)invalid("invalid nested AAC descriptor.");
        p=nestedStart;
        const found=parse(end,depth+1);
        if(found)return found;
      }
      p=end;
    }
    return null;
  }
  const config=parse(box.end-origin,0);
  if(!config||config.length<2||config.length>64)return invalid("missing compact AAC decoder configuration.");
  const objectType=config[0]>>3;
  if(objectType!==2)return invalid("only AAC-LC (not HE-AAC or encrypted audio) is supported.");
  const frequencyIndex=((config[0]&7)<<1)|(config[1]>>7);
  const channelConfig=(config[1]>>3)&15;
  if(frequencyIndex>=13||frequencyIndex===15||channelConfig<1||channelConfig>2)
    invalid("unsupported AAC channel or frequency configuration.");
  return config;
}
function parseAudioEntry(bytes:Uint8Array,stsd:Box,origin:number){
  const at=stsd.data-origin;
  if(bytes[at]!==0||u32(bytes,at+4)!==1)
    return invalid("requires one ordinary AAC audio sample description.");
  const entry=parseBox(bytes,at+8,stsd.end-origin,origin);
  if(entry.type!=="mp4a"||entry.end!==stsd.end)
    return invalid("not an unencrypted MPEG-4 AAC audio track.");
  const value=entry.data-origin;
  if(value+28>bytes.length||entry.end-entry.data<28)
    invalid("incomplete AAC audio sample entry.");
  const channels=u16(bytes,value+16),sampleRate=u32(bytes,value+24)/65536;
  if(![1,2].includes(channels)||!Number.isInteger(sampleRate)||
    sampleRate<16000||sampleRate>96000)
    invalid("requires one or two 16–96 kHz channels.");
  const nested={...entry,data:entry.data+28};
  const esds=one(children(bytes,nested,origin),"esds")!;
  const description=parseEsds(bytes,esds,origin);
  const specifiedIndex=((description[0]&7)<<1)|(description[1]>>7);
  const rates=[96000,88200,64000,48000,44100,32000,24000,22050,16000,12000,11025,8000,7350];
  if(rates[specifiedIndex]!==sampleRate||((description[1]>>3)&15)!==channels)
    invalid("AAC decoder config and sample entry disagree.");
  return {channels,sampleRate,description};
}
async function readHeader(source:CraigFlacSource,at:number,outerEnd:number){
  const len=Math.min(16,outerEnd-at);
  if(len<8)invalid("trailing incomplete MP4 atom header.");
  const b=await source.read(at,len);
  const b0=parseBox(b,0,outerEnd-at,at);
  return b0;
}
export async function inspectCraigAacMp4(source:CraigFlacSource):Promise<CraigAacIndex>{
  if(source.metadata.mimeType!=="audio/mp4")invalid("not a private MPEG-4 AAC track.");
  const size=source.metadata.bytes;
  if(!Number.isSafeInteger(size)||size<128||size>256*1024*1024)
    invalid("source exceeds bounded private recording limits.");
  const boxes:Box[]=[];
  for(let at=0;at<size;){
    const b=await readHeader(source,at,size);boxes.push(b);at=b.end;
    if(boxes.length>32)invalid("too many top-level MP4 atoms.");
  }
  if(!boxes.some(x=>x.type==="ftyp")||!boxes.some(x=>x.type==="mdat"))
    invalid("expected a complete M4A with ftyp and mdat.");
  if(boxes.some(b=>b.type==="moof"))invalid("fragmented MP4 is not yet supported.");
  const moov=one(boxes,"moov")!;
  if(moov.end-moov.start>CRAIG_AAC_MAX_MOOV_BYTES)
    invalid("metadata index exceeds the 8 MiB browser safety cap.");
  const metadata=new Uint8Array(moov.end-moov.start);
  for(let at=0;at<metadata.length;at+=CRAIG_AAC_INDEX_READ_BYTES){
    const n=Math.min(CRAIG_AAC_INDEX_READ_BYTES,metadata.length-at);
    metadata.set(await source.read(moov.start+at,n),at);
  }
  const root=parseBox(metadata,0,metadata.length,moov.start);
  const tracks=children(metadata,root,moov.start).filter(b=>b.type==="trak");
  const audio: {mdia:Box;mdhd:Box;stbl:Box}[]=[];
  for(const track of tracks){
    const trackBoxes=children(metadata,track,moov.start);
    if(trackBoxes.some(b=>b.type==="edts"))
      invalid("MP4 edit lists require an audio timeline correction not yet supported.");
    const mdia=one(trackBoxes,"mdia")!;
    const mdiaChildren=children(metadata,mdia,moov.start);
    const hdlr=one(mdiaChildren,"hdlr")!;
    const handler=code(metadata,hdlr.data-moov.start+8);
    if(handler!=="soun")continue;
    const minf=one(mdiaChildren,"minf")!;
    const stbl=one(children(metadata,minf,moov.start),"stbl")!;
    audio.push({mdia,mdhd:one(mdiaChildren,"mdhd")!,stbl});
  }
  if(audio.length!==1)invalid("requires exactly one audio track.");
  const {mdhd,stbl}=audio[0],o=moov.start;
  const md=mdhd.data-o;
  const version=metadata[md];
  const timeScale=version===0?u32(metadata,md+12):version===1?u32(metadata,md+20):0;
  const totalTime=version===0?u32(metadata,md+16):version===1?u64(metadata,md+24):0;
  const duration=totalTime/timeScale;
  if(!Number.isSafeInteger(timeScale)||timeScale<1||timeScale>1000000||
    !Number.isFinite(duration)||duration<1||duration>8*3600)
    invalid("missing or out-of-bounds audio duration.");
  const parts=children(metadata,stbl,o);
  if(parts.some(b=>b.type==="ctts"))
    invalid("unexpected AAC composition timing offsets.");
  const {channels,sampleRate,description}=parseAudioEntry(metadata,one(parts,"stsd")!,o);
  const stsz=one(parts,"stsz")!;
  const stszAt=stsz.data-o;
  if(metadata[stszAt]!==0)invalid("unsupported AAC sample-size table.");
  const constantSize=u32(metadata,stszAt+4),sampleCount=u32(metadata,stszAt+8);
  if(sampleCount<1||sampleCount>CRAIG_AAC_MAX_SAMPLES||
    stsz.end-o!==stszAt+12+(constantSize===0?sampleCount*4:0))
    invalid("unsafe AAC sample-size table.");
  const sizes=constantSize===0?metadata.subarray(stszAt+12,stsz.end-o):null;
  if(constantSize>1024*1024)invalid("AAC sample is larger than one private read.");
  const tts=table(metadata,one(parts,"stts")!,o,8,CRAIG_AAC_MAX_SAMPLES);
  const timeRuns:TimeRun[]=[];let timedSamples=0,timedUnits=0;
  for(let i=0;i<tts.count;i++){
    const count=u32(metadata,tts.at+i*8),delta=u32(metadata,tts.at+i*8+4);
    if(count<1||delta<1||delta>timeScale||timedSamples+count>CRAIG_AAC_MAX_SAMPLES)
      invalid("invalid AAC packet timing.");
    timeRuns.push({count,delta});timedSamples+=count;timedUnits+=count*delta;
  }
  if(timedSamples!==sampleCount||Math.abs(timedUnits-totalTime)>timeScale)
    invalid("AAC packet count or duration differs from media timeline.");
  // AAC codec output must have an exact PCM sample timeline. Reject packet
  // durations with fractional sample counts rather than shifting captions.
  if(timeRuns.some(run=>(run.delta*sampleRate)%timeScale!==0)||
    (timedUnits*sampleRate)%timeScale!==0)
    invalid("AAC packet timing cannot be mapped to exact PCM frames.");
  const totalFrames=timedUnits*sampleRate/timeScale;
  if(!Number.isSafeInteger(totalFrames)||totalFrames<sampleRate||
    totalFrames>sampleRate*8*3600)
    invalid("AAC frame timeline exceeds the supported session limit.");
  const stsc=table(metadata,one(parts,"stsc")!,o,12,CRAIG_AAC_MAX_SAMPLES);
  const chunkRuns:SampleRun[]=[];
  for(let i=0;i<stsc.count;i++){
    const at=stsc.at+i*12;
    const run={firstChunk:u32(metadata,at),samplesPerChunk:u32(metadata,at+4),
      descriptionIndex:u32(metadata,at+8)};
    if(run.firstChunk<1||(i===0&&run.firstChunk!==1)||
      (i>0&&run.firstChunk<=chunkRuns[i-1].firstChunk)||
      run.samplesPerChunk<1||run.descriptionIndex!==1)
      invalid("unsafe AAC chunk-to-sample mapping.");
    chunkRuns.push(run);
  }
  const co=one(parts,"stco",false)??one(parts,"co64",false);
  if(!co)return invalid("requires one non-fragmented chunk offset table.");
  if(parts.some(x=>x.type===(co.type==="stco"?"co64":"stco")))
    return invalid("conflicting chunk offset tables.");
  const offsets=table(metadata,co,o,co.type==="stco"?4:8,CRAIG_AAC_MAX_SAMPLES);
  const readOffset=(i:number)=>co.type==="stco"?
    u32(metadata,offsets.at+i*4):u64(metadata,offsets.at+i*8);
  const sizeView=sizes?new DataView(sizes.buffer,sizes.byteOffset,sizes.byteLength):null;
  function* samples():IterableIterator<CraigAacSample>{
    let ordinal=0,ticks=0,runIndex=0,timeIndex=0,timeLeft=timeRuns[0]?.count??0;
    for(let chunk=1;chunk<=offsets.count;chunk++){
      if(runIndex+1<chunkRuns.length&&chunk>=chunkRuns[runIndex+1].firstChunk)runIndex++;
      let packetOffset=readOffset(chunk-1);
      for(let i=0;i<chunkRuns[runIndex].samplesPerChunk;i++){
        if(ordinal>=sampleCount)invalid("AAC chunk map exceeds declared sample count.");
        const length=constantSize||sizeView!.getUint32(ordinal*4,false);
        if(length<1||length>1024*1024||packetOffset+length>size||
          !boxes.some(b=>b.type==="mdat"&&packetOffset>=b.data&&packetOffset+length<=b.end))
          invalid("AAC packet points outside a bounded media-data atom.");
        const delta=timeRuns[timeIndex].delta;
        yield {offset:packetOffset,length,
          timestampUs:Math.round(ticks*1000000/timeScale),
          durationUs:Math.round(delta*1000000/timeScale)};
        ordinal++;packetOffset+=length;ticks+=delta;timeLeft--;
        if(timeLeft===0&&ordinal<sampleCount){timeIndex++;timeLeft=timeRuns[timeIndex]?.count??0;}
      }
    }
    if(ordinal!==sampleCount||ticks!==timedUnits)
      invalid("AAC index does not describe every packet.");
  }
  // Preflight every offset before reporting readiness. Generator keeps no per-packet objects.
  for(const _ of samples()){void _;}
  return {durationMs:Math.round(totalFrames/sampleRate*1000),sampleRate,channels,
    sampleCount,totalFrames,codec:"mp4a.40.2",description,samples};
}
