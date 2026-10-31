import {inspectCraigAacMp4,type CraigAacIndex} from "./recap-craig-aac-demux.ts";
import {type CraigFlacSource} from "./recap-craig-flac-stream.ts";
import {browserAacCodec,type CraigAacCodecFactory,
  type CraigAacDecoderConfig,CRAIG_AAC_AUDIO_READ_BYTES,
  CRAIG_AAC_MAX_OUTPUT_FRAMES} from "./recap-craig-aac-stream.ts";

export const CRAIG_AAC_PROBE_MAX_PACKETS=48;
export type CraigAacProbeResult={
  packetsTested:number;framesDecoded:number;secondsDecoded:number;
  sampleRate:number;channels:number;sourceBytes:number;sourceReadRequests:number;
};
/** Decode only a short sample of a GM-authorized original Craig AAC track.
 * No session job, Drive upload, provider request or full-audio transcoding.
 */
export async function probeCraigAacBrowser(input:{
  source:CraigFlacSource;index?:CraigAacIndex;signal?:AbortSignal;
  codec?:CraigAacCodecFactory;
}):Promise<CraigAacProbeResult>{
  if(input.source.metadata.mimeType!=="audio/mp4")
    throw new Error("Select a native Craig AAC/M4A source to test browser decoding.");
  const check=()=>{if(input.signal?.aborted)
    throw new Error("AAC browser test stopped; nothing was uploaded.");};
  check();
  const index=input.index??await inspectCraigAacMp4(input.source);
  if(!Number.isSafeInteger(index.sampleCount)||index.sampleCount<1)
    throw new Error("AAC packet timeline is invalid.");
  const codec=input.codec??browserAacCodec();
  const config:CraigAacDecoderConfig={
    codec:index.codec,sampleRate:index.sampleRate,
    numberOfChannels:index.channels,description:index.description,
  };
  if(!(await codec.supported(config)))
    throw new Error("This browser cannot decode this Craig AAC-LC format. Use FLAC or PCM WAV instead.");
  check();
  const maximum=Math.min(CRAIG_AAC_PROBE_MAX_PACKETS,index.sampleCount);
  let readStart=-1;
  let windowData:Uint8Array<ArrayBuffer>=new Uint8Array(0);
  let sourceBytes=0,sourceReadRequests=0,packetsTested=0,framesDecoded=0;
  let failure:Error|null=null;
  const decoder=codec.create({
    output:audio=>{
      try{
        if(failure)return;
        if(!Number.isSafeInteger(audio.numberOfFrames)||audio.numberOfFrames<1||
          audio.numberOfFrames>CRAIG_AAC_MAX_OUTPUT_FRAMES||
          audio.sampleRate!==index.sampleRate||
          audio.numberOfChannels!==index.channels)
          throw new Error("AAC sample produced incompatible decoded audio.");
        // Require real finite PCM, not just successful container inspection.
        for(let channel=0;channel<index.channels;channel++){
          const data=new Float32Array(audio.numberOfFrames);
          audio.copyTo(data,{planeIndex:channel,format:"f32-planar"});
          for(let i=0;i<data.length;i++)
            if(!Number.isFinite(data[i]))
              throw new Error("AAC sample produced non-finite PCM audio.");
        }
        framesDecoded+=audio.numberOfFrames;
        if(framesDecoded>index.sampleRate*12)
          throw new Error("AAC sample decoded too much audio for a bounded test.");
      }catch(e){failure=e instanceof Error?e:new Error("AAC sample decode failed.");}
      finally{audio.close();}
    },
    error:error=>{failure=error;},
  });
  try{
    decoder.configure(config);
    for(const packet of index.samples()){
      if(packetsTested>=maximum)break;
      check();
      if(!Number.isSafeInteger(packet.offset)||!Number.isSafeInteger(packet.length)||
        packet.length<1||packet.length>1024*1024||
        packet.offset<0||packet.offset+packet.length>input.source.metadata.bytes)
        throw new Error("AAC sample read is outside its private, bounded source.");
      if(packet.offset<readStart||
        packet.offset+packet.length>readStart+windowData.length){
        const count=Math.min(input.source.metadata.bytes-packet.offset,
          Math.max(CRAIG_AAC_AUDIO_READ_BYTES,packet.length));
        windowData=await input.source.read(packet.offset,count);
        if(windowData.length!==count)
          throw new Error("AAC sample source returned incomplete bytes.");
        readStart=packet.offset;
        sourceBytes+=count;sourceReadRequests++;
      }
      check();
      const data=windowData.slice(packet.offset-readStart,
        packet.offset-readStart+packet.length);
      decoder.decode(codec.chunk({type:"key",timestamp:packet.timestampUs,
        duration:packet.durationUs,data}));
      packetsTested++;
      if(failure)throw failure;
    }
    check();
    await decoder.flush();
    if(failure)throw failure;
    check();
    if(packetsTested!==maximum||framesDecoded<index.sampleRate/10)
      throw new Error("AAC sample did not produce enough playable audio in this browser.");
    return {packetsTested,framesDecoded,
      secondsDecoded:framesDecoded/index.sampleRate,
      sampleRate:index.sampleRate,channels:index.channels,
      sourceBytes,sourceReadRequests};
  }finally{
    windowData=new Uint8Array(0);
    decoder.close();
  }
}
