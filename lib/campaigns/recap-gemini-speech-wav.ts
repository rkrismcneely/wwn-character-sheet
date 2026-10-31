import { inspectPcmWavUpload,pcmWavChunkHeader,type PcmWav,type WavChunk } from "./recap-wav-chunks.ts";

/** Four-minute, independent mono 16 kHz / 16-bit PCM files for low-cost speech ASR.
 * Bounded browser memory: only one source slice and converted clip are allocated.
 * Never byte-slice compressed FLAC/AAC. Those need a separate real decoder.
 */
export const GEMINI_STAGING_RATE=16000;
export const GEMINI_STAGING_SECONDS=240;
export const GEMINI_STAGING_MAX_PART_BYTES=8*1024*1024;
export const GEMINI_STAGING_MAX_CLIPS=512;
export type GeminiStagingClip=WavChunk&{targetFrames:number};
const targetWav:PcmWav={channels:1,sampleRate:GEMINI_STAGING_RATE,
  bitsPerSample:16,blockAlign:2,dataOffset:44,dataBytes:0};
export function planGeminiSpeechWav(wav:PcmWav):GeminiStagingClip[]{
  if(![8,16,24,32].includes(wav.bitsPerSample)||wav.channels<1||wav.channels>2||
    !Number.isInteger(wav.sampleRate)||wav.sampleRate<8000||wav.sampleRate>96000||
    wav.dataBytes<=0||wav.dataBytes%wav.blockAlign!==0)
    throw new Error("Choose a standard 8–32 bit PCM WAV track.");
  const frameCount=wav.dataBytes/wav.blockAlign;
  if(frameCount/wav.sampleRate>8*3600)throw new Error("This voice track exceeds eight hours.");
  const framesPerChunk=wav.sampleRate*GEMINI_STAGING_SECONDS;
  const chunks:GeminiStagingClip[]=[];
  for(let from=0;from<frameCount;from+=framesPerChunk){
    if(chunks.length>=GEMINI_STAGING_MAX_CLIPS)throw new Error("This track needs too many audio clips.");
    const end=Math.min(frameCount,from+framesPerChunk);
    const count=Math.ceil((end-from)*GEMINI_STAGING_RATE/wav.sampleRate);
    if(count*2+44>GEMINI_STAGING_MAX_PART_BYTES)throw new Error("Converted clip is too large.");
    chunks.push({startMs:Math.round(from*1000/wav.sampleRate),
      endMs:Math.round(end*1000/wav.sampleRate),
      dataOffset:wav.dataOffset+from*wav.blockAlign,
      dataBytes:(end-from)*wav.blockAlign,targetFrames:count});
  }
  return chunks;
}
function pcmSample(view:DataView,offset:number,bits:number):number{
  if(bits===8)return (view.getUint8(offset)-128)/128;
  if(bits===16)return view.getInt16(offset,true)/32768;
  if(bits===32)return view.getInt32(offset,true)/2147483648;
  let sample=view.getUint8(offset)|(view.getUint8(offset+1)<<8)|(view.getUint8(offset+2)<<16);
  if(sample&0x800000)sample-=0x1000000;
  return sample/8388608;
}
/** Produces one *valid* RIFF audio clip, with no whole-recording decode. */
export async function makeGeminiSpeechClip(file:File,wav:PcmWav,part:GeminiStagingClip,
  index:number):Promise<File>{
  if(part.dataBytes<1||part.targetFrames<1||part.dataBytes>wav.dataBytes||
    part.dataOffset<wav.dataOffset||part.dataOffset+part.dataBytes>wav.dataOffset+wav.dataBytes||
    part.dataBytes%wav.blockAlign!==0)
    throw new Error("Converted clip exceeds validated WAV data.");
  const source=await file.slice(part.dataOffset,part.dataOffset+part.dataBytes).arrayBuffer();
  const view=new DataView(source),channels=wav.channels,bits=wav.bitsPerSample;
  const frames=source.byteLength/wav.blockAlign;
  const output=new Uint8Array(part.targetFrames*2);
  const target=new DataView(output.buffer);
  const sourceBytesPerSample=bits/8;
  const average=(frame:number)=>{
    let total=0;
    for(let ch=0;ch<channels;ch++)total+=pcmSample(view,frame*wav.blockAlign+
      ch*sourceBytesPerSample,bits);
    return total/channels;
  };
  for(let frame=0;frame<part.targetFrames;frame++){
    // Average source samples when decimating rather than throwing away most
    // source samples. Avoid costly WebAudio whole-file decode.
    const from=Math.min(frames-1,Math.floor(frame*wav.sampleRate/GEMINI_STAGING_RATE));
    const to=Math.min(frames,Math.max(from+1,
      Math.floor((frame+1)*wav.sampleRate/GEMINI_STAGING_RATE)));
    let sum=0;
    for(let sample=from;sample<to;sample++)sum+=average(sample);
    const value=Math.max(-1,Math.min(1,sum/(to-from)));
    target.setInt16(frame*2,Math.max(-32768,Math.min(32767,Math.round(value*32767))),true);
  }
  const header=pcmWavChunkHeader(targetWav,output.byteLength);
  const outputName=file.name.replace(/\.wav$/iu,"")+
    "-gemini-"+String(index+1).padStart(3,"0")+".wav";
  return new File([header.buffer as ArrayBuffer,output.buffer as ArrayBuffer],
    outputName,{type:"audio/wav"});
}
export async function inspectGeminiSpeechWav(file:File){
  const source=await inspectPcmWavUpload(file);
  return {source,clips:planGeminiSpeechWav(source)};
}
