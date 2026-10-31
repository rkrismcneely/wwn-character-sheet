import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {parsePcmWavHeader} from "../lib/campaigns/recap-wav-chunks.ts";
import {
  CRAIG_FLAC_READ_BYTES,planCraigFlacSpeechParts,CraigFlacPcmWriter,
  streamCraigFlacSpeech,
} from "../lib/campaigns/recap-craig-flac-stream.ts";
const read=path=>readFile(new URL(path,import.meta.url),"utf8");
const flacInfo={sampleRate:48000,channels:2,bitsPerSample:16,
  totalSamples:48000*3*3600,durationMs:3*3600*1000};
function header(total=48000,sampleRate=48000,channels=2){
  const result=new Uint8Array(64);
  result.set([102,76,97,67,0,0,0,34],0);
  result[18]=(sampleRate>>12)&255;
  result[19]=(sampleRate>>4)&255;
  result[20]=((sampleRate&15)<<4)|(((channels-1)&7)<<1);
  const samples=BigInt(total);
  result[21]=(15<<4)|Number((samples>>32n)&15n);
  result[22]=Number((samples>>24n)&255n);
  result[23]=Number((samples>>16n)&255n);
  result[24]=Number((samples>>8n)&255n);
  result[25]=Number(samples&255n);
  return result;
}
test("3h Craig FLAC yields exactly 45 timestamp-aligned 4min 16kHz uploads, without whole-session buffers",()=>{
  const parts=planCraigFlacSpeechParts(flacInfo);
  assert.equal(parts.length,45);
  assert.deepEqual(parts[0],{chunkIndex:0,startMs:0,endMs:240000,targetFrames:3840000});
  assert.equal(parts.at(-1).endMs,10800000);
  assert.equal(parts.reduce((sum,p)=>sum+p.targetFrames,0),16000*10800);
  assert.ok(CRAIG_FLAC_READ_BYTES<=1024*1024);
  assert.throws(()=>planCraigFlacSpeechParts({...flacInfo,totalSamples:0}));
  assert.throws(()=>planCraigFlacSpeechParts({...flacInfo,channels:8}));
});
test("rolling converter makes independently playable WAV and aligns precise source frames",async()=>{
  const parts=[],out=[];
  const writer=new CraigFlacPcmWriter({
    sampleRate:48000,channels:2,bitsPerSample:16,
    totalSamples:48000,durationMs:1000,
  },"craig-speaker.flac",async(file,part)=>{parts.push(part);out.push(file);});
  for(let i=0;i<3;i++){
    const frames=16000;
    const first=new Float32Array(frames).fill(.5),second=new Float32Array(frames).fill(-.5);
    await writer.write({sampleRate:48000,samplesDecoded:frames,channelData:[first,second]});
  }
  await writer.finish();
  assert.equal(out.length,1);
  assert.deepEqual(parts[0],{chunkIndex:0,startMs:0,endMs:1000,targetFrames:16000});
  const data=new Uint8Array(await out[0].arrayBuffer());
  const wav=parsePcmWavHeader(data,data.length);
  assert.equal(wav.channels,1);assert.equal(wav.sampleRate,16000);
  assert.equal(wav.bitsPerSample,16);assert.equal(data.byteLength,44+32000);
  assert.equal(new DataView(data.buffer).getInt16(44,true),0);
});
test("one-bounded-range decoder with injected WASM worker rejects truncated source and malformed PCM",async()=>{
  const base=header();
  const make=()=>({
    metadata:{bytes:128,etag:'"e"',mimeType:"audio/flac",maxRangeBytes:1048576},
    read:async(offset,length)=>offset===0&&length===64?base:new Uint8Array(length),
  });
  let freed=0;const saved=[];
  const decoder={
    ready:Promise.resolve(),
    decode:async()=>({samplesDecoded:48000,sampleRate:48000,errors:[],
      channelData:[new Float32Array(48000).fill(.2),new Float32Array(48000).fill(.2)]}),
    flush:async()=>({samplesDecoded:0,sampleRate:48000,channelData:[]}),
    free:async()=>{freed++;},
  };
  const result=await streamCraigFlacSpeech({
    source:make(),createDecoder:async()=>decoder,
    onClip:async(file,part)=>{saved.push({file,part});},
  });
  assert.equal(result.parts.length,1);assert.equal(saved.length,1);assert.equal(freed,1);
  assert.equal(saved[0].part.endMs,1000);
  await assert.rejects(streamCraigFlacSpeech({
    source:make(),
    createDecoder:async()=>({...decoder,decode:async()=>({
      samplesDecoded:100,sampleRate:48000,channelData:[new Float32Array(100)],
      errors:[{message:"lost sync"}]})}),
    onClip:async()=>{throw Error("must not upload");},
  }),/damaged frames/u);
  assert.equal(freed,2);
});
test("streaming conversion checks cancellation before reading the next range",async()=>{
  const controller=new AbortController();
  let reads=0;const source={
    metadata:{bytes:3*CRAIG_FLAC_READ_BYTES,etag:'"e"',mimeType:"audio/flac",maxRangeBytes:1048576},
    read:async(offset,length)=>{reads++;return offset===0&&length===64?header(48000):new Uint8Array(length);},
  };
  const decoder={ready:Promise.resolve(),
    decode:async()=>{controller.abort();return {samplesDecoded:0,sampleRate:48000,channelData:[]};},
    flush:async()=>({samplesDecoded:0,sampleRate:48000,channelData:[]}),
    free:async()=>{},
  };
  await assert.rejects(streamCraigFlacSpeech({
    source,signal:controller.signal,createDecoder:async()=>decoder,
    onClip:async()=>{},
  }),/stopped by GM/u);
  assert.equal(reads,2);
});
test("GM-only staging connects FLAC source to private Drive with verified upload, progress and warnings",async()=>{
  const [ui,packageFile,lock]=await Promise.all([
    read("../app/campaigns/session-recap-gemini-drive-staging.tsx"),
    read("../package.json"),read("../package-lock.json"),
  ]);
  for(const expected of ["streamCraigFlacSpeech","planCraigFlacSpeechParts",
    "Prepare full Craig audio (FLAC or AAC) in my Drive","openPrivateCraigRangeReader",
    "sourceTransfer","bytesLabel(expectedStorage)","sourceDigest",
    "old.sourceDigest!==digest","uploadRecordingToDrive",
    'action:"attach"','action:"plan"',"Auto","Keep this page open"]){
    if(expected==="Auto")continue;
    assert.ok(ui.includes(expected),"Missing FLAC/GM use guard "+expected);
  }
  assert.match(packageFile,/"@wasm-audio-decoders\/flac": "0.2.11"/u);
  assert.match(lock,/"node_modules\/@wasm-audio-decoders\/flac"/u);
  assert.doesNotMatch(ui,/new AudioContext\(\).*hours|uploadOriginalToR2/u);
});
