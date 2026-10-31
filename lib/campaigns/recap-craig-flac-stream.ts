import {pcmWavChunkHeader,type PcmWav} from "./recap-wav-chunks.ts";
import {inspectCraigFlacStreamInfo,type CraigFlacStreamInfo,
  type CraigLongSourceMetadata} from "./recap-craig-range-browser.ts";
import {GEMINI_STAGING_RATE,GEMINI_STAGING_SECONDS,
  GEMINI_STAGING_MAX_CLIPS} from "./recap-gemini-speech-wav.ts";
import {CRAIG_RANGE_WINDOW_BYTES} from "./recap-craig-audio-ranges.ts";

export const CRAIG_FLAC_READ_BYTES=512*1024;
export const CRAIG_FLAC_MAX_DECODED_FRAMES_PER_READ=4*60*96000;
const TARGET_FRAMES=GEMINI_STAGING_RATE*GEMINI_STAGING_SECONDS;
const WAV:{channels:number;sampleRate:number;bitsPerSample:number;blockAlign:number;dataOffset:number;dataBytes:number}={
  channels:1,sampleRate:GEMINI_STAGING_RATE,bitsPerSample:16,blockAlign:2,
  dataOffset:44,dataBytes:0,
};
export type CraigFlacSpeechPart={chunkIndex:number;startMs:number;endMs:number;targetFrames:number};
export type CraigDecodedFrames={
  channelData:Float32Array[];samplesDecoded:number;sampleRate:number;
  errors?:{message?:string}[];
};
export type CraigFlacDecoder={
  ready:Promise<unknown>;
  decode(bytes:Uint8Array):Promise<CraigDecodedFrames>;
  flush():Promise<CraigDecodedFrames>;
  free():Promise<unknown>|void;
};
export type CraigFlacSource={
  metadata:CraigLongSourceMetadata;
  read(offset:number,length:number):Promise<Uint8Array<ArrayBuffer>>;
};
const asMs=(frame:number)=>Math.round(frame*1000/GEMINI_STAGING_RATE);
export function planCraigFlacSpeechParts(info:CraigFlacStreamInfo):CraigFlacSpeechPart[]{
  if(info.channels<1||info.channels>2||info.sampleRate<16000||info.sampleRate>96000||
    !info.totalSamples||!Number.isSafeInteger(info.totalSamples)||
    info.totalSamples<16000||info.totalSamples>info.sampleRate*8*3600)
    throw new Error("FLAC requires a known 1–8 hour maximum timeline, one or two channels, and 16–96 kHz audio.");
  // The resampler writes one output frame whenever a source-frame interval
  // crosses a target-sample boundary (ceil mapping), preserving the timeline.
  const allFrames=Math.ceil(info.totalSamples*GEMINI_STAGING_RATE/info.sampleRate);
  const parts:CraigFlacSpeechPart[]=[];
  for(let at=0;at<allFrames;at+=TARGET_FRAMES){
    if(parts.length>=GEMINI_STAGING_MAX_CLIPS)throw new Error("The FLAC session has too many clips.");
    const end=Math.min(allFrames,at+TARGET_FRAMES);
    parts.push({chunkIndex:parts.length,startMs:asMs(at),endMs:asMs(end),
      targetFrames:end-at});
  }
  return parts;
}
/** Bounded rolling mono 16 kHz, 16-bit converter.
 * Input is consecutive decoded FLAC blocks. No whole-file AudioBuffer.
 */
export class CraigFlacPcmWriter{
  readonly parts:CraigFlacSpeechPart[];
  private pending=new Uint8Array(TARGET_FRAMES*2);
  private pendingFrames=0;
  private sourceFrame=0;
  private accumulated=0;
  private count=0;
  private emittedFrames=0;
  private index=0;
  private readonly info:CraigFlacStreamInfo;
  private readonly name:string;
  private readonly onClip:(clip:File,part:CraigFlacSpeechPart)=>Promise<void>;
  constructor(info:CraigFlacStreamInfo,name:string,
    onClip:(clip:File,part:CraigFlacSpeechPart)=>Promise<void>){
    this.info=info;this.name=name;this.onClip=onClip;
    this.parts=planCraigFlacSpeechParts(info);
  }
  private async emit(){
    if(this.pendingFrames===0)return;
    const part=this.parts[this.index];
    if(!part||part.targetFrames!==this.pendingFrames)
      throw new Error("Decoded FLAC clip frame count does not match its verified timeline.");
    const data=this.pending.slice(0,this.pendingFrames*2);
    const header=pcmWavChunkHeader(WAV as PcmWav,data.byteLength);
    const file=new File([header.buffer as ArrayBuffer,data.buffer as ArrayBuffer],
      this.name.replace(/\.flac$/iu,"")+"-gemini-"+
        String(this.index+1).padStart(3,"0")+".wav",{type:"audio/wav"});
    await this.onClip(file,part);
    this.index++;this.pendingFrames=0;this.pending.fill(0);
  }
  private async add(value:number){
    if(this.index>=this.parts.length)throw new Error("FLAC decoded more audio than its header promised.");
    const scaled=Math.round(Math.max(-1,Math.min(1,value))*32767);
    new DataView(this.pending.buffer).setInt16(this.pendingFrames*2,scaled,true);
    this.pendingFrames++;this.emittedFrames++;
    if(this.pendingFrames===this.parts[this.index].targetFrames)await this.emit();
  }
  async write(frame:CraigDecodedFrames):Promise<void>{
    if(frame.errors?.length)throw new Error("FLAC decoding reported damaged frames. Previously completed clips remain staged.");
    if(frame.samplesDecoded===0)return;
    if(frame.sampleRate!==this.info.sampleRate||
      frame.samplesDecoded<0||frame.samplesDecoded>CRAIG_FLAC_MAX_DECODED_FRAMES_PER_READ||
      !Number.isSafeInteger(frame.samplesDecoded)||
      frame.channelData.length!==this.info.channels||
      frame.channelData.some(ch=>ch.length!==frame.samplesDecoded))
      throw new Error("FLAC decoded invalid or unexpectedly large PCM output.");
    const output=frame.channelData;
    for(let i=0;i<frame.samplesDecoded;i++){
      let mono=0;
      for(let ch=0;ch<output.length;ch++){
        const sample=output[ch][i];
        if(!Number.isFinite(sample))throw new Error("FLAC decoder produced a non-finite sample.");
        mono+=sample;
      }
      this.accumulated+=mono/output.length;
      this.count++;
      const previous=Math.floor(this.sourceFrame*GEMINI_STAGING_RATE/this.info.sampleRate);
      this.sourceFrame++;
      const now=Math.floor(this.sourceFrame*GEMINI_STAGING_RATE/this.info.sampleRate);
      if(now>previous){
        await this.add(this.accumulated/this.count);
        this.accumulated=0;this.count=0;
      }
    }
  }
  async finish():Promise<void>{
    if(this.count>0)await this.add(this.accumulated/this.count);
    if(this.info.totalSamples!==this.sourceFrame||
      this.index!==this.parts.length||this.pendingFrames!==0||
      this.emittedFrames!==this.parts.reduce((n,p)=>n+p.targetFrames,0))
      throw new Error("FLAC ended before its declared audio timeline. No incomplete clip was accepted.");
  }
}
export async function streamCraigFlacSpeech(input:{
  source:CraigFlacSource;signal?:AbortSignal;
  createDecoder?:()=>Promise<CraigFlacDecoder>;
  onClip:(file:File,part:CraigFlacSpeechPart)=>Promise<void>;
  onProgress?:(p:{sourceBytes:number;sourceTotal:number;clipsCompleted:number;
    clipsTotal:number;estimatedR2Reads:number})=>void;
}):Promise<{info:CraigFlacStreamInfo;parts:CraigFlacSpeechPart[]}>{
  if(input.source.metadata.mimeType!=="audio/flac")throw new Error("Choose a native Craig FLAC recording; AAC requires its own decoder.");
  const initial=await input.source.read(0,64);
  const info=inspectCraigFlacStreamInfo(initial);
  const planned=planCraigFlacSpeechParts(info);
  if(!Number.isSafeInteger(input.source.metadata.bytes)||
    input.source.metadata.bytes<128||input.source.metadata.bytes>256*1024*1024)
    throw new Error("FLAC source is outside the private Craig transfer limit.");
  const module= input.createDecoder?null:await import("@wasm-audio-decoders/flac");
  const decoder=input.createDecoder?await input.createDecoder():
    new module!.FLACDecoderWebWorker() as CraigFlacDecoder;
  let offset=0,uploaded=0;
  const count=Math.ceil(input.source.metadata.bytes/CRAIG_FLAC_READ_BYTES);
  const writer=new CraigFlacPcmWriter(info,"craig-track.flac",async(file,part)=>{
    if(input.signal?.aborted)throw new Error("FLAC conversion stopped by GM.");
    await input.onClip(file,part);uploaded++;
    input.onProgress?.({sourceBytes:offset,sourceTotal:input.source.metadata.bytes,
      clipsCompleted:uploaded,clipsTotal:planned.length,estimatedR2Reads:count});
  });
  try{
    await decoder.ready;
    while(offset<input.source.metadata.bytes){
      if(input.signal?.aborted)throw new Error("FLAC conversion stopped by GM.");
      const length=Math.min(CRAIG_FLAC_READ_BYTES,input.source.metadata.bytes-offset);
      const bytes=await input.source.read(offset,length);
      offset+=length;
      await writer.write(await decoder.decode(bytes));
      input.onProgress?.({sourceBytes:offset,sourceTotal:input.source.metadata.bytes,
        clipsCompleted:uploaded,clipsTotal:planned.length,estimatedR2Reads:count});
      // Yield to the browser between bounded decode/resample steps.
      await new Promise<void>(resolve=>setTimeout(resolve,0));
    }
    await writer.write(await decoder.flush());
    await writer.finish();
    return {info,parts:planned};
  }finally{await decoder.free();}
}
