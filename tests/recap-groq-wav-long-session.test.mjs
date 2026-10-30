import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  planPcmWavUploadChunks,pcmWavChunkHeader,parsePcmWavHeader,buildPcmWavUpload,
  inspectPcmWavUpload,
} from "../lib/campaigns/recap-wav-chunks.ts";

test("2–3-hour WAV creates bounded, frame-aligned valid Groq clips without reading entire audio",()=>{
  const wav={sampleRate:48000,channels:2,bitsPerSample:16,blockAlign:4,
    dataOffset:44,dataBytes:48000*4*60*60*3};
  const chunks=planPcmWavUploadChunks(wav);
  assert.ok(chunks.length>100 && chunks.length<512);
  assert.equal(chunks[0].startMs,0);
  assert.equal(chunks[chunks.length-1].endMs,3*60*60*1000);
  assert.equal(chunks.reduce((total,c)=>total+c.dataBytes,0),wav.dataBytes);
  for(const chunk of chunks) {
    assert.ok(chunk.dataBytes+44<=12*1024*1024);
    assert.ok(chunk.endMs-chunk.startMs<=20*60*1000);
    assert.equal(chunk.dataBytes%wav.blockAlign,0);
    const standalone=pcmWavChunkHeader(wav,chunk.dataBytes);
    const parsed=parsePcmWavHeader(standalone,44+chunk.dataBytes);
    assert.equal(parsed.dataBytes,chunk.dataBytes);
  }
});
test("WAV planner rejects beyond 8h and tiny upload limits",()=>{
  const wav={sampleRate:16000,channels:1,bitsPerSample:16,blockAlign:2,
    dataOffset:44,dataBytes:16000*2*60*60*9};
  assert.throws(()=>planPcmWavUploadChunks(wav),/eight hours/);
  assert.throws(()=>planPcmWavUploadChunks({...wav,dataBytes:32000},100),/limit/);
});
test("real WAV file slicing creates standalone RIFF files with original audio frames",async()=>{
  const wav={sampleRate:8000,channels:1,bitsPerSample:16,blockAlign:2,
    dataOffset:44,dataBytes:64_000};
  const audio=new Uint8Array(64_000);
  for(let i=0;i<audio.length;i++)audio[i]=i%251;
  const file=new File([pcmWavChunkHeader(wav,wav.dataBytes),audio],"recording.wav",{type:"audio/wav"});
  const inspected=await inspectPcmWavUpload(file);
  assert.deepEqual(inspected,wav);
  const chunks=planPcmWavUploadChunks(wav,8192);
  const assembled=[];
  for(let i=0;i<chunks.length;i++) {
    const part=buildPcmWavUpload(file,wav,chunks[i],i);
    assert.equal(part.size,chunks[i].dataBytes+44);
    const bytes=new Uint8Array(await part.arrayBuffer());
    assert.equal(parsePcmWavHeader(bytes,part.size).dataBytes,chunks[i].dataBytes);
    assembled.push(bytes.slice(44));
  }
  const merged=new Uint8Array(assembled.reduce((s,a)=>s+a.length,0));
  let cursor=0;for(const array of assembled){merged.set(array,cursor);cursor+=array.length;}
  assert.deepEqual(merged,audio);
});
test("long WAV upload UI warns about request count, charges and permits safe stopping",async()=>{
  const code=await readFile(new URL("../app/campaigns/session-recap-groq-transcriber.tsx",import.meta.url),"utf8");
  assert.match(code,/planPcmWavUploadChunks\(info\)/u);
  assert.match(code,/buildPcmWavUpload\(file,wavInfo,chunk,i\)/u);
  assert.match(code,/wavChunks\.length\+" Groq transcription requests/u);
  assert.match(code,/Stop after current clip/u);
  assert.match(code,/Restart to safely skip identical completed clips/u);
  assert.match(code,/setProgress\(finished\)/u);
  assert.doesNotMatch(code,/readAsArrayBuffer|decodeAudioData|localStorage/u);
});
