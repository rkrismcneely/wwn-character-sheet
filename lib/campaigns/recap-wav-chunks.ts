/**
 * Plan audio-aware, independently playable chunks from a standard PCM WAV.
 * No FLAC, compressed WAV, RF64 or extensible WAV support is implied.
 * The caller reads just a bounded prefix and supplies the verified total size.
 */
export type PcmWav = {
  sampleRate: number; channels: number; bitsPerSample: number;
  blockAlign: number; dataOffset: number; dataBytes: number;
};
export type WavChunk = { startMs: number; endMs: number; dataOffset: number; dataBytes: number };
function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
export function parsePcmWavHeader(prefix: Uint8Array, totalBytes: number): PcmWav {
  check(prefix.byteLength >= 44 && Number.isSafeInteger(totalBytes) && totalBytes >= 44, "WAV header missing.");
  const view = new DataView(prefix.buffer, prefix.byteOffset, prefix.byteLength);
  const tag = (offset: number) => String.fromCharCode(...prefix.subarray(offset,offset+4));
  check(tag(0) === "RIFF" && tag(8) === "WAVE", "Only RIFF WAV is supported.");
  check(view.getUint32(4,true) + 8 === totalBytes, "WAV size mismatch.");
  let at = 12, format: { channels:number; sampleRate:number; bitsPerSample:number; blockAlign:number } | null = null;
  let data: { offset:number; bytes:number } | null = null;
  while (at + 8 <= prefix.byteLength) {
    const chunkType = tag(at), size = view.getUint32(at+4,true);
    const offset = at + 8;
    check(offset + size <= totalBytes, "WAV chunk exceeds file bounds.");
    if (chunkType === "fmt ") {
      check(size >= 16 && offset + 16 <= prefix.byteLength, "WAV format header incomplete.");
      const codec = view.getUint16(offset,true);
      const channels = view.getUint16(offset+2,true);
      const sampleRate = view.getUint32(offset+4,true);
      const byteRate = view.getUint32(offset+8,true);
      const blockAlign = view.getUint16(offset+12,true);
      const bitsPerSample = view.getUint16(offset+14,true);
      check(codec === 1 && channels >= 1 && channels <= 2 &&
        sampleRate >= 8000 && sampleRate <= 96000 && [8,16,24,32].includes(bitsPerSample) &&
        blockAlign === channels * bitsPerSample / 8 &&
        byteRate === sampleRate * blockAlign, "Unsupported or inconsistent PCM WAV format.");
      format = { channels,sampleRate,bitsPerSample,blockAlign };
    }
    if (chunkType === "data") { data = { offset, bytes: size }; break; }
    const next = offset + size + (size % 2);
    check(next > at && next <= totalBytes, "WAV header contains invalid chunk.");
    at = next;
  }
  check(format !== null && data !== null, "PCM WAV format or data chunk missing from header prefix.");
  const pcm = format as NonNullable<typeof format>;
  const payload = data as NonNullable<typeof data>;
  check(payload.bytes > 0 && payload.bytes % pcm.blockAlign === 0, "PCM audio frames are incomplete.");
  return { ...pcm, dataOffset: payload.offset, dataBytes: payload.bytes };
}
export function planPcmWavChunks(wav: PcmWav, maxDurationMs = 30000): WavChunk[] {
  check(Number.isSafeInteger(maxDurationMs) && maxDurationMs >= 1000 && maxDurationMs <= 30000,
    "Chunk duration must be between 1 and 30 seconds.");
  const frames = wav.dataBytes / wav.blockAlign;
  const framesPerChunk = Math.floor(wav.sampleRate * maxDurationMs / 1000);
  check(framesPerChunk > 0 && frames > 0, "Invalid PCM chunk size.");
  const chunks: WavChunk[] = [];
  for (let start = 0; start < frames; start += framesPerChunk) {
    check(chunks.length < 2000, "Too many WAV chunks.");
    const end = Math.min(frames, start + framesPerChunk);
    chunks.push({
      startMs: Math.round(start * 1000 / wav.sampleRate),
      endMs: Math.round(end * 1000 / wav.sampleRate),
      dataOffset: wav.dataOffset + start * wav.blockAlign,
      dataBytes: (end-start) * wav.blockAlign,
    });
  }
  return chunks;
}
export function pcmWavChunkHeader(wav: PcmWav, dataBytes: number): Uint8Array {
  check(Number.isSafeInteger(dataBytes) && dataBytes > 0 && dataBytes <= 0xffffffff - 36 &&
    dataBytes % wav.blockAlign === 0, "Invalid PCM WAV chunk size.");
  const bytes = new Uint8Array(44);
  const v = new DataView(bytes.buffer);
  const name = (at:number,text:string) => { for(let i=0;i<text.length;i++) bytes[at+i]=text.charCodeAt(i); };
  name(0,"RIFF");v.setUint32(4,36+dataBytes,true);name(8,"WAVE");
  name(12,"fmt ");v.setUint32(16,16,true);v.setUint16(20,1,true);
  v.setUint16(22,wav.channels,true);v.setUint32(24,wav.sampleRate,true);
  v.setUint32(28,wav.sampleRate*wav.blockAlign,true);
  v.setUint16(32,wav.blockAlign,true);v.setUint16(34,wav.bitsPerSample,true);
  name(36,"data");v.setUint32(40,dataBytes,true);
  return bytes;
}

/**
 * Bounded **upload** chunks for long PCM recordings: unlike the 30-second
 * processing planner above, this targets Groq's 16 MiB in-app safety limit.
 * It never decodes the entire recording and never splits compressed formats.
 */
export function planPcmWavUploadChunks(wav:PcmWav,maxFileBytes=12*1024*1024):WavChunk[] {
  check(Number.isSafeInteger(maxFileBytes)&&maxFileBytes>=1024&&maxFileBytes<=16*1024*1024,
    "Invalid WAV upload limit.");
  check(wav.blockAlign>0&&wav.sampleRate>0&&wav.dataBytes>0&&
    wav.dataBytes%wav.blockAlign===0, "Invalid PCM audio metadata.");
  const frames=wav.dataBytes/wav.blockAlign;
  check(frames/wav.sampleRate<=8*60*60,"WAV session cannot exceed eight hours.");
  const maxFrames=Math.min(Math.floor((maxFileBytes-44)/wav.blockAlign),wav.sampleRate*20*60);
  check(maxFrames>0,"WAV upload limit is too small.");
  const chunks:WavChunk[]=[];
  for(let at=0;at<frames;at+=maxFrames){
    check(chunks.length<2500,"Recording would require too many provider requests.");
    const end=Math.min(frames,at+maxFrames);
    chunks.push({startMs:Math.round(at*1000/wav.sampleRate),
      endMs:Math.round(end*1000/wav.sampleRate),
      dataOffset:wav.dataOffset+at*wav.blockAlign,
      dataBytes:(end-at)*wav.blockAlign});
  }
  return chunks;
}
export async function inspectPcmWavUpload(file:File):Promise<PcmWav>{
  if(!/\.wav$/iu.test(file.name))throw new Error("Choose a standard PCM WAV file.");
  const header=new Uint8Array(await file.slice(0,256*1024).arrayBuffer());
  return parsePcmWavHeader(header,file.size);
}
export function buildPcmWavUpload(file:File,wav:PcmWav,part:WavChunk,index:number):File {
  check(part.dataOffset>=wav.dataOffset && part.dataBytes>0 &&
    part.dataOffset+part.dataBytes<=wav.dataOffset+wav.dataBytes,
    "Audio chunk exceeds verified WAV data.");
  const name=file.name.replace(/\.wav$/iu,"") + "-part-"+String(index+1).padStart(3,"0")+".wav";
  return new File([pcmWavChunkHeader(wav,part.dataBytes).buffer as ArrayBuffer,
    file.slice(part.dataOffset,part.dataOffset+part.dataBytes)],name,{type:"audio/wav"});
}
