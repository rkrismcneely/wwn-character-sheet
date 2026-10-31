import { pcmWavChunkHeader,type PcmWav } from "./recap-wav-chunks.ts";
import { GEMINI_STAGING_RATE,GEMINI_STAGING_MAX_PART_BYTES,
  GEMINI_STAGING_SECONDS } from "./recap-gemini-speech-wav.ts";

/** Safe *short-recording* native browser decode fallback.
 * Full Craig AAC/FLAC recordings must NOT be decoded as one AudioBuffer:
 * a 3-hour stereo 48kHz float buffer requires ~4.1 GiB before overhead.
 */
export const GEMINI_NATIVE_MAX_SOURCE_BYTES=16*1024*1024;
export const GEMINI_NATIVE_MAX_DURATION_SECONDS=240;
export const GEMINI_NATIVE_MAX_DECODED_BYTES=96*1024*1024;
export type DecodedSpeechPart={startMs:number;endMs:number;fromFrame:number;toFrame:number;targetFrames:number};
type AudioBufferLike=Pick<AudioBuffer,"length"|"sampleRate"|"numberOfChannels"|"duration"|"getChannelData">;
const targetWav:PcmWav={channels:1,sampleRate:GEMINI_STAGING_RATE,
  bitsPerSample:16,blockAlign:2,dataOffset:44,dataBytes:0};

export function nativeCraigFormat(file:Pick<File,"name"|"size"|"type">):"flac"|"aac" {
  const ext=file.name.toLowerCase();
  if(!/\.(flac|m4a|mp4)$/u.test(ext)||
    file.size<128||file.size>GEMINI_NATIVE_MAX_SOURCE_BYTES)
    throw new Error("For direct Craig audio, choose a genuine FLAC or MPEG-4 AAC file under 16 MiB. Large recordings still need an audio-aware conversion method.");
  return ext.endsWith(".flac")?"flac":"aac";
}
export function planDecodedSpeechParts(source:Pick<AudioBufferLike,"length"|"sampleRate"|"numberOfChannels"|"duration">):DecodedSpeechPart[]{
  const {length,sampleRate,numberOfChannels,duration}=source;
  if(!Number.isSafeInteger(length)||length<1||!Number.isSafeInteger(sampleRate)||
    sampleRate<8000||sampleRate>96000||numberOfChannels<1||numberOfChannels>2||
    !Number.isFinite(duration)||duration<=0||
    duration>GEMINI_NATIVE_MAX_DURATION_SECONDS||
    length*numberOfChannels*4>GEMINI_NATIVE_MAX_DECODED_BYTES)
    throw new Error("This recording needs too much browser memory or is over four minutes. Use PCM WAV preparation for long Craig sessions.");
  const framesPerSegment=sampleRate*GEMINI_STAGING_SECONDS;
  const parts:DecodedSpeechPart[]=[];
  for(let start=0;start<length;start+=framesPerSegment){
    const end=Math.min(length,start+framesPerSegment);
    const targetFrames=Math.ceil((end-start)*GEMINI_STAGING_RATE/sampleRate);
    if(targetFrames*2+44>GEMINI_STAGING_MAX_PART_BYTES)
      throw new Error("A decoded voice clip exceeds the Drive upload size limit.");
    parts.push({fromFrame:start,toFrame:end,
      startMs:Math.round(start*1000/sampleRate),
      endMs:Math.round(end*1000/sampleRate),targetFrames});
  }
  return parts;
}
export async function decodeShortCraigAudio(file:File):Promise<{
  decoded:AudioBuffer;parts:DecodedSpeechPart[];format:"flac"|"aac";
}> {
  const format=nativeCraigFormat(file);
  const AudioContextConstructor=window.AudioContext;
  if(!AudioContextConstructor)
    throw new Error("This browser cannot decode Craig audio. Prepare an uncompressed PCM WAV instead.");
  const ctx=new AudioContextConstructor();
  try{
    // Only a <=16 MiB short source enters decodeAudioData. Never do this to
    // a full multi-hour compressed Craig recording.
    const decoded=await ctx.decodeAudioData(await file.arrayBuffer());
    return {decoded,parts:planDecodedSpeechParts(decoded),format};
  }catch(error){
    if(error instanceof Error && /too much|four minutes|Drive upload size/.test(error.message))
      throw error;
    throw new Error(format==="flac"?
      "This browser cannot decode the FLAC track natively. Use an audio-aware FLAC-to-WAV converter; full-length FLAC decoding is not supported here yet.":
      "This browser cannot decode the MPEG-4 AAC track. Use a PCM WAV export, or try a browser with native AAC support.");
  }finally{
    await ctx.close().catch(()=>{});
  }
}
export function makeDecodedGeminiSpeechClip(
  filename:string,buffer:AudioBufferLike,part:DecodedSpeechPart,index:number,
):File{
  const plan=planDecodedSpeechParts(buffer);
  if(!plan[index]||JSON.stringify(plan[index])!==JSON.stringify(part))
    throw new Error("The decoded clip does not match the verified timeline plan.");
  const source=Array.from({length:buffer.numberOfChannels},
    (_,channel)=>buffer.getChannelData(channel));
  if(source.some(data=>data.length<buffer.length))
    throw new Error("Decoded audio channels are incomplete.");
  const audio=new Uint8Array(part.targetFrames*2);
  const view=new DataView(audio.buffer);
  for(let out=0;out<part.targetFrames;out++){
    const from=Math.min(part.toFrame-1,
      part.fromFrame+Math.floor(out*buffer.sampleRate/GEMINI_STAGING_RATE));
    const to=Math.min(part.toFrame,Math.max(from+1,
      part.fromFrame+Math.floor((out+1)*buffer.sampleRate/GEMINI_STAGING_RATE)));
    let sum=0;
    for(let src=from;src<to;src++)
      for(let channel=0;channel<source.length;channel++)sum+=source[channel][src];
    const normalized=Math.max(-1,Math.min(1,sum/((to-from)*source.length)));
    view.setInt16(out*2,Math.max(-32768,Math.min(32767,Math.round(normalized*32767))),true);
  }
  const header=pcmWavChunkHeader(targetWav,audio.byteLength);
  const base=filename.replace(/\.(?:flac|m4a|mp4)$/iu,"");
  return new File([header.buffer as ArrayBuffer,audio.buffer as ArrayBuffer],
    base+"-gemini-"+String(index+1).padStart(3,"0")+".wav",{type:"audio/wav"});
}
