/** Bounded native M4A/AAC remuxing. No transcoding, no site-owned audio storage.
 * Reads ISO-BMFF metadata from the GM's existing Drive file and creates small
 * independently playable ftyp/moov/mdat prefixes. The mdat payload remains
 * one authenticated, contiguous byte range of the original Drive object.
 *
 * The audio-activity search uses AAC per-frame byte sizes as an inexpensive
 * heuristic, NOT waveform amplitude. CBR recordings may provide no detectable
 * evidence of a break; in that case use safe, balanced timed boundaries.
 */
import {LongAudioFormatError,type AudioSegmentPlan,MAX_RECAP_SEGMENTS} from "./recap-long-audio-plan.ts";
import {Buffer} from "node:buffer";

type Read=(start:number,length:number)=>Promise<Uint8Array>;
type Box={type:string;start:number;end:number;data:number};
const LIMIT_MOOV=6*1024*1024;
const LIMIT_PREFIX=1250*1024; // D1 string parameter + per-job memory bound.
const MAX_PART_MS=100*60_000;
const MIN_PART_MS=15*60_000;
const DEFAULT_FTYP=new Uint8Array([0,0,0,20,102,116,121,112,77,52,65,32,0,0,0,0,105,115,111,109]);

function invalid():never{throw new LongAudioFormatError("format_unsupported");}
function ascii(bytes:Uint8Array,p:number,n=4):string{
  return String.fromCharCode(...bytes.subarray(p,p+n));
}
function dv(bytes:Uint8Array):DataView{
  return new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
}
function u32(bytes:Uint8Array,p:number):number{
  if(p<0||p+4>bytes.length)invalid();
  return dv(bytes).getUint32(p,false);
}
function u64(bytes:Uint8Array,p:number):number{
  if(p<0||p+8>bytes.length)invalid();
  const v=dv(bytes).getBigUint64(p,false);
  if(v>BigInt(Number.MAX_SAFE_INTEGER))invalid();
  return Number(v);
}
function boxes(bytes:Uint8Array,start=0,end=bytes.length):Box[]{
  const found:Box[]=[];
  for(let p=start;p<end;){
    if(p+8>end)invalid();
    const size=u32(bytes,p),type=ascii(bytes,p+4);
    const header=size===1?16:8;
    const length=size===1?u64(bytes,p+8):size===0?end-p:size;
    if(length<header||p+length>end||found.length>100000)invalid();
    found.push({type,start:p,data:p+header,end:p+length});
    p+=length;
  }
  return found;
}
function child(bytes:Uint8Array,parent:Box,name:string):Box{
  const found=boxes(bytes,parent.data,parent.end).filter(v=>v.type===name);
  if(found.length!==1)invalid();
  return found[0];
}
function find(bytes:Uint8Array,parent:Box,name:string):Box|null{
  return boxes(bytes,parent.data,parent.end).find(v=>v.type===name)??null;
}
function range(bytes:Uint8Array,box:Box):Uint8Array{
  return bytes.subarray(box.start,box.end);
}
function fixed(...values:number[]):Uint8Array{return Uint8Array.from(values);}
function encode32(value:number):Uint8Array{
  if(!Number.isSafeInteger(value)||value<0||value>0xffffffff)invalid();
  return fixed(value>>>24,(value>>>16)&255,(value>>>8)&255,value&255);
}
function encode16(value:number):Uint8Array{
  if(!Number.isSafeInteger(value)||value<0||value>65535)invalid();
  return fixed(value>>>8,value&255);
}
function concatenate(parts:Uint8Array[]):Uint8Array{
  let bytes=0;
  for(const part of parts){
    bytes+=part.length;
    if(bytes>LIMIT_MOOV*2)invalid();
  }
  const output=new Uint8Array(bytes);
  let at=0;
  for(const part of parts){output.set(part,at);at+=part.length;}
  return output;
}
function atom(type:string,...parts:Uint8Array[]):Uint8Array{
  if(type.length!==4)invalid();
  const length=8+parts.reduce((n,v)=>n+v.length,0);
  return concatenate([encode32(length),fixed(...type.split("").map(c=>c.charCodeAt(0))),...parts]);
}
function full(type:string,payload:Uint8Array):Uint8Array{
  return atom(type,fixed(0,0,0,0),payload);
}
function unitMatrix():Uint8Array{
  return concatenate([encode32(65536),encode32(0),encode32(0),
    encode32(0),encode32(65536),encode32(0),
    encode32(0),encode32(0),encode32(0x40000000)]);
}
function toBase64(data:Uint8Array):string{
  // Native buffer encoding avoids iterating over hundreds of thousands of
  // metadata bytes in JS within Workers Free's strict CPU allowance.
  return Buffer.from(data.buffer,data.byteOffset,data.byteLength).toString("base64");
}
type Timing={count:number;delta:number};
type Parsed={
  ftyp:Uint8Array;stsd:Uint8Array;sampleSizes:Uint16Array;offsets:Uint32Array;
  timing:Timing[];timeScale:number;durationMs:number;dataStart:number;dataEnd:number;
};
function sampleUnits(runs:Timing[],index:number):number{
  let remaining=index,units=0;
  for(const run of runs){
    const take=Math.min(remaining,run.count);
    units+=take*run.delta;
    remaining-=take;
    if(remaining===0)break;
  }
  if(remaining!==0)invalid();
  return units;
}
function nearestSample(runs:Timing[],units:number):number{
  let remaining=units,index=0;
  for(const run of runs){
    const time=run.count*run.delta;
    if(remaining<time)return index+Math.floor(remaining/run.delta);
    remaining-=time;index+=run.count;
  }
  return index;
}
function trimTiming(runs:Timing[],first:number,last:number):Timing[]{
  let index=0;const result:Timing[]=[];
  for(const run of runs){
    const start=Math.max(index,first),end=Math.min(index+run.count,last);
    if(end>start)result.push({count:end-start,delta:run.delta});
    index+=run.count;
  }
  if(result.reduce((s,r)=>s+r.count,0)!==last-first)invalid();
  return result;
}
async function locate(sourceBytes:number,read:Read):Promise<{moov:Uint8Array;ftyp:Uint8Array;mdat:Box}>{
  let at=0;let ftyp:Uint8Array|null=null,moov:Uint8Array|null=null,mdat:Box|null=null;
  for(let i=0;i<64&&at+8<=sourceBytes;i++){
    const header=await read(at,Math.min(16,sourceBytes-at));
    if(header.byteLength<8)invalid();
    const size=u32(header,0),type=ascii(header,4);
    const headerSize=size===1?16:8;
    const length=size===1?u64(header,8):size===0?sourceBytes-at:size;
    if(length<headerSize||at+length>sourceBytes)invalid();
    if(type==="ftyp"){
      if(ftyp||length>1024)invalid();
      ftyp=await read(at,length);
    }else if(type==="moov"){
      if(moov||length>LIMIT_MOOV)invalid();
      moov=await read(at,length);
    }else if(type==="mdat"){
      if(mdat)invalid(); // Single contiguous media payload only.
      mdat={type,start:at,data:at+headerSize,end:at+length};
    }else if(type==="moof"||type==="sidx")invalid(); // Fragmented input requires a different parser.
    at+=length;
  }
  if(!moov||!mdat)invalid();
  return {moov,ftyp:ftyp??DEFAULT_FTYP,mdat};
}
function parseMeta(meta:Uint8Array,ftyp:Uint8Array,mdat:Box):Parsed{
  const view=dv(meta);
  const root=boxes(meta);
  if(root.length!==1||root[0].type!=="moov")invalid();
  const moov=root[0];
  const tracks=boxes(meta,moov.data,moov.end).filter(v=>v.type==="trak");
  let selected:Box|null=null;
  for(const track of tracks){
    const media=child(meta,track,"mdia");
    const handler=child(meta,media,"hdlr");
    if(ascii(meta,handler.data+8)==="soun"){
      if(selected)invalid();
      selected=track;
    }
  }
  if(!selected)invalid();
  const media=child(meta,selected,"mdia"),header=child(meta,media,"mdhd");
  if(meta[header.data]!==0)invalid();
  const timeScale=u32(meta,header.data+12);
  if(timeScale<8000||timeScale>192000)invalid();
  const minf=child(meta,media,"minf");
  const stbl=child(meta,minf,"stbl");
  // Reject composition offsets, encrypted packets or auxiliary sample mapping.
  if(find(meta,stbl,"ctts")||find(meta,stbl,"senc")||
    find(meta,stbl,"saiz")||find(meta,stbl,"saio"))invalid();
  const stsd=range(meta,child(meta,stbl,"stsd"));
  if(u32(stsd,12)!==1||ascii(stsd,20)!=="mp4a")invalid();
  const sampleDescriptionSize=u32(stsd,16);
  if(sampleDescriptionSize<36||16+sampleDescriptionSize>stsd.length)invalid();
  // A single audio decoder config per recording. Preserve the original esds.
  const times=child(meta,stbl,"stts");
  const nTimes=u32(meta,times.data+4);
  if(nTimes<1||nTimes>64||times.data+8+nTimes*8>times.end)invalid();
  const timing:Timing[]=[];
  let sampleCount=0,totalUnits=0;
  for(let i=0;i<nTimes;i++){
    const count=u32(meta,times.data+8+i*8),delta=u32(meta,times.data+12+i*8);
    if(count<1||delta<1)invalid();
    sampleCount+=count;totalUnits+=count*delta;
    timing.push({count,delta});
  }
  if(sampleCount>1_500_000||sampleCount<2||!Number.isSafeInteger(totalUnits))invalid();
  const sz=find(meta,stbl,"stsz"),compact=find(meta,stbl,"stz2");
  if(Boolean(sz)===Boolean(compact))invalid();
  const sizeBox=(sz??compact)!;
  const compact16=Boolean(compact);
  const fixedSize=sz?u32(meta,sz.data+4):0;
  const nSizes=u32(meta,sizeBox.data+8);
  if(nSizes!==sampleCount||sizeBox.data+12+
    (compact16?nSizes*2:fixedSize===0?nSizes*4:0)>sizeBox.end||
    (compact16&&(u32(meta,sizeBox.data+4)&255)!==16))invalid();
  const sizes=new Uint16Array(sampleCount),offsets=new Uint32Array(sampleCount+1);
  for(let i=0;i<sampleCount;i++){
    const value=compact16?view.getUint16(sizeBox.data+12+i*2,false):
      fixedSize||view.getUint32(sizeBox.data+12+i*4,false);
    if(value<1||value>65535)invalid();
    sizes[i]=value;
    offsets[i+1]=offsets[i]+value;
    if(offsets[i+1]<offsets[i])invalid();
  }
  const co=find(meta,stbl,"stco"),co64=find(meta,stbl,"co64");
  if(Boolean(co)===Boolean(co64))invalid();
  const offsetsBox=(co??co64)!;
  const chunkCount=u32(meta,offsetsBox.data+4);
  const wide=offsetsBox.type==="co64";
  if(chunkCount<1||chunkCount>sampleCount||
    offsetsBox.data+8+chunkCount*(wide?8:4)>offsetsBox.end)invalid();
  const stsc=child(meta,stbl,"stsc"),runs=u32(meta,stsc.data+4);
  if(runs<1||runs>10000||stsc.data+8+runs*12>stsc.end)invalid();
  const patterns:Array<{first:number;count:number}>=[];
  for(let i=0;i<runs;i++){
    const first=view.getUint32(stsc.data+8+i*12,false),
      count=view.getUint32(stsc.data+12+i*12,false),desc=view.getUint32(stsc.data+16+i*12,false);
    if(first<1||first>chunkCount||count<1||desc!==1||
      (i===0&&first!==1)||(i>0&&first<=patterns[i-1].first))invalid();
    patterns.push({first,count});
  }
  let sample=0,expected=-1,ptr=0;
  for(let chunk=0;chunk<chunkCount;chunk++){
    if(ptr+1<patterns.length&&chunk+1>=patterns[ptr+1].first)ptr++;
    const index=chunk+1,offset=wide?u64(meta,offsetsBox.data+8+chunk*8):
      view.getUint32(offsetsBox.data+8+chunk*4,false);
    const count=patterns[ptr].count;
    if(sample+count>sampleCount||offset<mdat.data||
      offset+offsets[sample+count]-offsets[sample]>mdat.end)invalid();
    if(expected>=0&&offset!==expected)invalid(); // No interleaved sample bytes.
    if(expected<0)expected=offset;
    sample+=count;
    expected=offset+offsets[sample]-offsets[sample-count];
    if(index===1&&offset!==expected-(offsets[sample]-offsets[0]))invalid();
  }
  if(sample!==sampleCount)invalid();
  const start=(wide?u64(meta,offsetsBox.data+8):u32(meta,offsetsBox.data+8));
  const durationMs=Math.round(totalUnits/timeScale*1000);
  if(durationMs<1000||durationMs>8*60*60*1000)invalid();
  return {ftyp,stsd,sampleSizes:sizes,offsets,timing,timeScale,durationMs,
    dataStart:start,dataEnd:start+offsets[sampleCount]};
}
export async function inspectM4a(source:{byteSize:number;durationMs:number|null;mimeType:string},
  read:Read):Promise<Parsed>{
  if(source.mimeType!=="audio/mp4"&&source.mimeType!=="audio/x-m4a")invalid();
  const located=await locate(source.byteSize,read);
  const parsed=parseMeta(located.moov,located.ftyp,located.mdat);
  if(source.durationMs!==null&&Math.abs(source.durationMs-parsed.durationMs)>30_000)invalid();
  return parsed;
}
function chooseCuts(parsed:Parsed):number[]{
  const n=parsed.sampleSizes.length;
  const count=Math.ceil(parsed.durationMs/MAX_PART_MS);
  if(count>MAX_RECAP_SEGMENTS)invalid();
  const target=parsed.durationMs/count;
  const cuts=[0];
  const avgBytes=parsed.offsets[n]/n;
  const time=(i:number)=>sampleUnits(parsed.timing,i)/parsed.timeScale*1000;
  for(let section=1;section<count;section++){
    const middle=target*section;
    const remaining=count-section;
    const lower=Math.max(time(cuts[cuts.length-1])+MIN_PART_MS,
      parsed.durationMs-remaining*MAX_PART_MS);
    const upper=Math.min(time(cuts[cuts.length-1])+MAX_PART_MS,
      parsed.durationMs-remaining*MIN_PART_MS);
    if(upper<=lower)invalid();
    let best=nearestSample(parsed.timing,Math.round(middle/1000*parsed.timeScale));
    let bestScore=Infinity;
    const scanFrom=Math.max(lower,middle-25*60_000),
      scanTo=Math.min(upper,middle+25*60_000);
    const probes=40;
    // Require at least two minutes of consistently small AAC packets, not
    // merely a one-second pause in a conversation.
    for(let i=0;i<=probes;i++){
      const center=scanFrom+(scanTo-scanFrom)*i/probes;
      const left=nearestSample(parsed.timing,Math.round((center-60_000)/1000*parsed.timeScale));
      const right=nearestSample(parsed.timing,Math.round((center+60_000)/1000*parsed.timeScale));
      if(left<0||right>n||right<=left)continue;
      const average=(parsed.offsets[right]-parsed.offsets[left])/(right-left);
      const ratio=average/avgBytes;
      if(ratio>0.55)continue;
      const score=ratio+Math.abs(center-middle)/60_000*0.001;
      if(score<bestScore){bestScore=score;best=nearestSample(parsed.timing,
        Math.round(center/1000*parsed.timeScale));}
    }
    // The heuristic is unsuitable for constant-bitrate AAC. In that case a
    // balanced split is safer than a fabricated claim of detected silence.
    const earliest=nearestSample(parsed.timing,Math.ceil(lower/1000*parsed.timeScale));
    const latest=nearestSample(parsed.timing,Math.floor(upper/1000*parsed.timeScale));
    const pick=Math.max(cuts[cuts.length-1]+1,Math.min(n-remaining,best,latest));
    cuts.push(Math.max(earliest,pick));
  }
  cuts.push(n);
  if(cuts.some((v,i)=>i>0&&v<=cuts[i-1]))invalid();
  return cuts;
}
function makeHeader(parsed:Parsed,first:number,last:number):Uint8Array{
  const count=last-first;
  if(count<1)invalid();
  const units=sampleUnits(parsed.timing,last)-sampleUnits(parsed.timing,first);
  const ms=Math.round(units/parsed.timeScale*1000);
  const payloadBytes=parsed.offsets[last]-parsed.offsets[first];
  const sttsRuns=trimTiming(parsed.timing,first,last);
  const times=full("stts",concatenate([encode32(sttsRuns.length),
    ...sttsRuns.flatMap(v=>[encode32(v.count),encode32(v.delta)])]));
  // stz2 with 16-bit entries saves ~50% compared to 32-bit stsz for AAC.
  const sizes=new Uint8Array(count*2),sizeView=dv(sizes);
  for(let i=0;i<count;i++)sizeView.setUint16(i*2,parsed.sampleSizes[first+i],false);
  const stz2=full("stz2",concatenate([fixed(0,0,0,16),encode32(count),sizes]));
  const stsc=full("stsc",concatenate([encode32(1),encode32(1),encode32(count),encode32(1)]));
  const offsetBox=(offset:number)=>full("stco",concatenate([encode32(1),encode32(offset)]));
  const buildMoov=(offset:number)=>{
    const stbl=atom("stbl",parsed.stsd,times,stsc,stz2,offsetBox(offset));
    const smhd=full("smhd",fixed(0,0,0,0));
    const url=atom("url ",fixed(0,0,0,1));
    const dref=full("dref",concatenate([encode32(1),url]));
    const dinf=atom("dinf",dref);
    const minf=atom("minf",smhd,dinf,stbl);
    const mdhd=full("mdhd",concatenate([encode32(0),encode32(0),
      encode32(parsed.timeScale),encode32(units),fixed(0x55,0xc4,0,0)]));
    const hdlr=full("hdlr",concatenate([encode32(0),fixed(115,111,117,110),
      new Uint8Array(12),fixed(...Array.from("SoundHandler\0").map(c=>c.charCodeAt(0)))]));
    const mdia=atom("mdia",mdhd,hdlr,minf);
    const tkhd=atom("tkhd",concatenate([fixed(0,0,0,7),
      encode32(0),encode32(0),encode32(1),encode32(0),encode32(ms),
      new Uint8Array(8),fixed(0,0,0,0,1,0,0,0),unitMatrix(),encode32(0),encode32(0)]));
    const trak=atom("trak",tkhd,mdia);
    const mvhd=full("mvhd",concatenate([encode32(0),encode32(0),
      encode32(1000),encode32(ms),encode32(65536),fixed(1,0),
      new Uint8Array(10),unitMatrix(),new Uint8Array(24),encode32(2)]));
    return atom("moov",mvhd,trak);
  };
  const mock=buildMoov(0);
  const headerSize=parsed.ftyp.length+mock.length+8;
  if(headerSize>LIMIT_PREFIX||headerSize+payloadBytes>2*1024*1024*1024)invalid();
  const moov=buildMoov(headerSize);
  return concatenate([parsed.ftyp,moov,encode32(payloadBytes+8),
    fixed(109,100,97,116)]); // "mdat"
}
export async function planM4a(source:{byteSize:number;durationMs:number|null;mimeType:string},
  read:Read):Promise<AudioSegmentPlan[]>{
  const parsed=await inspectM4a(source,read);
  const cuts=chooseCuts(parsed);
  return cuts.slice(0,-1).map((first,i)=>{
    const last=cuts[i+1],prefix=makeHeader(parsed,first,last);
    return {
      index:i,startMs:Math.round(sampleUnits(parsed.timing,first)/parsed.timeScale*1000),
      endMs:i===cuts.length-2?parsed.durationMs:
        Math.round(sampleUnits(parsed.timing,last)/parsed.timeScale*1000),
      sourceStart:parsed.dataStart+parsed.offsets[first],
      sourceEnd:parsed.dataStart+parsed.offsets[last],
      prefixBase64:toBase64(prefix),mimeType:"audio/mp4",
    };
  });
}
export async function estimateM4aDuration(source:{byteSize:number;durationMs:number|null;mimeType:string},
  read:Read):Promise<number|null>{
  try{return (await inspectM4a({...source,durationMs:null},read)).durationMs;}
  catch{return null;}
}
