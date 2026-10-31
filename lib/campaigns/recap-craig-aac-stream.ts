import {inspectCraigAacMp4,type CraigAacIndex} from "./recap-craig-aac-demux.ts";
import {CraigFlacPcmWriter,planCraigFlacSpeechParts,
  type CraigFlacSource,type CraigDecodedFrames,type CraigFlacSpeechPart} from "./recap-craig-flac-stream.ts";

export const CRAIG_AAC_AUDIO_READ_BYTES=512*1024;
export const CRAIG_AAC_DECODE_BATCH_PACKETS=192;
export const CRAIG_AAC_MAX_QUEUED_OUTPUTS=256;
export const CRAIG_AAC_MAX_OUTPUT_FRAMES=8192;
export type CraigAacAudioData={
  numberOfFrames:number;numberOfChannels:number;sampleRate:number;
  copyTo(destination:Float32Array,options:{planeIndex:number;format:"f32-planar"}):void;
  close():void;
};
export type CraigAacEncodedChunk={type:"key";timestamp:number;duration:number;data:Uint8Array};
export type CraigAacDecoder={
  configure(config:CraigAacDecoderConfig):void;
  decode(chunk:CraigAacEncodedChunk):void;
  flush():Promise<void>;
  close():void;
};
export type CraigAacDecoderConfig={
  codec:"mp4a.40.2";sampleRate:number;numberOfChannels:number;description:Uint8Array;
};
type DecoderCallbacks={output:(audio:CraigAacAudioData)=>void;error:(e:Error)=>void};
export type CraigAacCodecFactory={
  supported(config:CraigAacDecoderConfig):Promise<boolean>;
  create(callbacks:DecoderCallbacks):CraigAacDecoder;
  chunk(packet:CraigAacEncodedChunk):CraigAacEncodedChunk;
};
/** Keep codec support optional: WebCodecs is not available in all browsers.
 * The browser runtime is only touched when a GM explicitly prepares audio.
 */
function browserAacCodec():CraigAacCodecFactory{
  type AudioDecoderConstructor={
    new(init:DecoderCallbacks):CraigAacDecoder;
    isConfigSupported(config:CraigAacDecoderConfig):Promise<{supported:boolean}>;
  };
  type ChunkConstructor={new(init:CraigAacEncodedChunk):CraigAacEncodedChunk};
  const globals=globalThis as typeof globalThis & {
    AudioDecoder?:AudioDecoderConstructor;EncodedAudioChunk?:ChunkConstructor;
  };
  const Decoder=globals.AudioDecoder,Chunk=globals.EncodedAudioChunk;
  if(!Decoder||!Chunk)
    throw new Error("This browser has no WebCodecs AAC decoder. Use FLAC or export PCM WAV instead.");
  return {
    supported:async config=>Boolean((await Decoder.isConfigSupported(config)).supported),
    create:callbacks=>new Decoder(callbacks),
    chunk:packet=>new Chunk(packet),
  };
}
function fail(message:string):never{throw new Error("Craig AAC: "+message);}
export function planCraigAacSpeechParts(index:CraigAacIndex):CraigFlacSpeechPart[]{
  if(!Number.isSafeInteger(index.totalFrames)||index.totalFrames<index.sampleRate||
    index.totalFrames>8*3600*index.sampleRate)
    fail("untrusted or missing exact AAC sample timeline.");
  return planCraigFlacSpeechParts({
    channels:index.channels,sampleRate:index.sampleRate,
    bitsPerSample:16,totalSamples:index.totalFrames,durationMs:index.durationMs,
  });
}
export async function streamCraigAacSpeech(input:{
  source:CraigFlacSource;index?:CraigAacIndex;signal?:AbortSignal;
  codec?:CraigAacCodecFactory;
  onClip:(file:File,part:CraigFlacSpeechPart)=>Promise<void>;
  onProgress?:(progress:{packetsDecoded:number;packetsTotal:number;
    sourceBytes:number;sourceTotal:number;sourceReadRequests:number;
    clipsCompleted:number;clipsTotal:number})=>void;
}):Promise<{index:CraigAacIndex;parts:CraigFlacSpeechPart[]}>{
  if(input.source.metadata.mimeType!=="audio/mp4")fail("choose an original Craig M4A track.");
  const check=()=>{if(input.signal?.aborted)fail("conversion stopped. Uploaded clips remain saved.");};
  check();
  const index=input.index??await inspectCraigAacMp4(input.source);
  const parts=planCraigAacSpeechParts(index);
  const config:CraigAacDecoderConfig={
    codec:index.codec,sampleRate:index.sampleRate,numberOfChannels:index.channels,
    description:index.description,
  };
  const codec=input.codec??browserAacCodec();
  if(!(await codec.supported(config)))
    fail("this browser does not support the selected AAC-LC decoder. Use FLAC or PCM WAV.");
  check();

  let sourceBytes=0,sourceReadRequests=0,packetsDecoded=0,clipsCompleted=0;
  const notify=()=>input.onProgress?.({packetsDecoded,packetsTotal:index.sampleCount,
    sourceBytes,sourceTotal:input.source.metadata.bytes,sourceReadRequests,
    clipsCompleted,clipsTotal:parts.length});
  const writer=new CraigFlacPcmWriter({
    channels:index.channels,sampleRate:index.sampleRate,bitsPerSample:16,
    totalSamples:index.totalFrames,durationMs:index.durationMs,
  },"craig-track.flac",async(file,part)=>{
    check();await input.onClip(file,part);clipsCompleted++;notify();
  });

  // A window is reused for adjacent compressed packets. Never issue a
  // Cloudflare R2 request per AAC frame (~500,000 for a 3h 48kHz session).
  let windowOffset=-1,windowData:Uint8Array<ArrayBuffer>=new Uint8Array(0);
  async function fetchPacket(offset:number,length:number):Promise<Uint8Array<ArrayBuffer>>{
    check();
    if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(length)||
      length<1||length>1024*1024||offset<0||offset+length>input.source.metadata.bytes)
      fail("packet exceeds the source or the 1 MiB read limit.");
    if(offset<windowOffset||offset+length>windowOffset+windowData.length){
      const windowLength=Math.min(input.source.metadata.bytes-offset,
        Math.max(CRAIG_AAC_AUDIO_READ_BYTES,length));
      windowData=await input.source.read(offset,windowLength);
      if(windowData.length!==windowLength)fail("short private audio range.");
      windowOffset=offset;sourceReadRequests++;sourceBytes+=windowLength;notify();
    }
    // Copy the compressed packet before handing it to the WebCodecs queue.
    return windowData.slice(offset-windowOffset,offset-windowOffset+length);
  }

  const pending:CraigDecodedFrames[]=[];
  let codecError:Error|null=null;
  const decoder=codec.create({
    output:audio=>{
      try{
        if(codecError)return;
        if(pending.length>=CRAIG_AAC_MAX_QUEUED_OUTPUTS)
          fail("browser decoder exceeded the bounded audio output queue.");
        if(!Number.isSafeInteger(audio.numberOfFrames)||audio.numberOfFrames<1||
          audio.numberOfFrames>CRAIG_AAC_MAX_OUTPUT_FRAMES||
          audio.numberOfChannels!==index.channels||
          audio.sampleRate!==index.sampleRate)
          fail("browser returned unexpected decoded audio format or size.");
        const channels:Float32Array[]=[];
        for(let ch=0;ch<index.channels;ch++){
          const plane=new Float32Array(audio.numberOfFrames);
          audio.copyTo(plane,{planeIndex:ch,format:"f32-planar"});
          channels.push(plane);
        }
        pending.push({channelData:channels,samplesDecoded:audio.numberOfFrames,
          sampleRate:audio.sampleRate});
      }catch(e){codecError=e instanceof Error?e:new Error("AAC PCM extraction failed.");}
      finally{audio.close();}
    },
    error:e=>{codecError=e;},
  });
  async function drain():Promise<void>{
    check();
    await decoder.flush();
    if(codecError)throw codecError;
    for(const frame of pending){
      check();await writer.write(frame);
    }
    pending.length=0;
    notify();
  }
  try{
    decoder.configure(config);
    let packetCount=0;
    for(const packet of index.samples()){
      check();
      if(codecError)throw codecError;
      const data=await fetchPacket(packet.offset,packet.length);
      decoder.decode(codec.chunk({type:"key",timestamp:packet.timestampUs,
        duration:packet.durationUs,data}));
      packetCount++;packetsDecoded=packetCount;
      if(packetCount%CRAIG_AAC_DECODE_BATCH_PACKETS===0)await drain();
    }
    if(packetCount!==index.sampleCount)
      fail("the packet iterator ended early.");
    if(packetCount%CRAIG_AAC_DECODE_BATCH_PACKETS!==0)await drain();
    if(codecError)throw codecError;
    check();
    await writer.finish();notify();
    return {index,parts};
  }finally{
    pending.length=0;
    windowData=new Uint8Array(0);
    decoder.close();
  }
}
