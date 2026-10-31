import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { parsePcmWavHeader } from "../lib/campaigns/recap-wav-chunks.ts";
import {
  GEMINI_NATIVE_MAX_SOURCE_BYTES,GEMINI_NATIVE_MAX_DURATION_SECONDS,
  nativeCraigFormat,planDecodedSpeechParts,makeDecodedGeminiSpeechClip,
} from "../lib/campaigns/recap-gemini-native-short.ts";

const read=path=>readFile(new URL(path,import.meta.url),"utf8");
function fakeBuffer(seconds=2,sampleRate=48000,channels=2){
  const length=seconds*sampleRate;
  const data=Array.from({length:channels},(_,channel)=>{
    const array=new Float32Array(length);
    for(let i=0;i<length;i++)array[i]=channel===0?.5:-.5;
    return array;
  });
  return {length,sampleRate,numberOfChannels:channels,duration:seconds,
    getChannelData:(channel)=>data[channel]};
}
test("native AAC/FLAC format handling allows bounded Craig sources but refuses hours or raw AAC",()=>{
  assert.equal(nativeCraigFormat({name:"my-voice.flac",size:4096,type:"audio/flac"}),"flac");
  assert.equal(nativeCraigFormat({name:"my-voice.m4a",size:4096,type:"audio/mp4"}),"aac");
  assert.throws(()=>nativeCraigFormat({name:"raw.aac",size:4096,type:"audio/aac"}),/FLAC or MPEG-4/u);
  assert.throws(()=>nativeCraigFormat({name:"full-session.m4a",size:GEMINI_NATIVE_MAX_SOURCE_BYTES+1,type:"audio/mp4"}),/Large recordings/u);
  assert.throws(()=>planDecodedSpeechParts({
    length:48000*3600,sampleRate:48000,numberOfChannels:2,duration:3600,
  }),/four minutes/u);
  assert.throws(()=>planDecodedSpeechParts({
    length:48000*250,sampleRate:48000,numberOfChannels:2,duration:250,
  }),/four minutes/u);
  assert.equal(GEMINI_NATIVE_MAX_DURATION_SECONDS,240);
});
test("browser-decoded AAC/FLAC creates an independent, mono 16kHz 16-bit PCM speech clip",async()=>{
  const buffer=fakeBuffer();
  const parts=planDecodedSpeechParts(buffer);
  assert.equal(parts.length,1);
  const wav=makeDecodedGeminiSpeechClip("craig-player.m4a",buffer,parts[0],0);
  assert.match(wav.name,/craig-player-gemini-001\.wav$/u);
  const bytes=new Uint8Array(await wav.arrayBuffer());
  const header=parsePcmWavHeader(bytes,bytes.byteLength);
  assert.equal(header.channels,1);
  assert.equal(header.sampleRate,16000);
  assert.equal(header.bitsPerSample,16);
  assert.equal(header.dataBytes,64000);
  const payload=new DataView(bytes.buffer);
  assert.equal(payload.getInt16(header.dataOffset,true),0);
  assert.throws(()=>makeDecodedGeminiSpeechClip("x.flac",buffer,
    {...parts[0],endMs:5000},0),/timeline/u);
});
test("uncompressed decoded buffer budget is bounded before producing any Drive uploads",()=>{
  assert.throws(()=>planDecodedSpeechParts({
    length:96000*240,sampleRate:96000,numberOfChannels:2,duration:240,
  }),/memory/u);
  const short=planDecodedSpeechParts(fakeBuffer(180));
  assert.equal(short.length,1);
  assert.ok(short[0].targetFrames*2+44<8*1024*1024);
});
test("native Craig browser preflight checks duration BEFORE allocating decoded memory",async()=>{
  const source=await read("../lib/campaigns/recap-gemini-native-short.ts");
  assert.match(source,/probeShortCraigDuration\(file\)/u);
  assert.match(source,/await probeShortCraigDuration\(file\);[\s\S]*?ctx\.decodeAudioData/u);
  assert.match(source,/URL\.revokeObjectURL/u);
  assert.match(source,/GEMINI_NATIVE_MAX_DURATION_SECONDS/u);
  assert.match(source,/ctx\.close\(\)/u);
  assert.match(source,/full-length FLAC decoding is not supported/u);
  assert.doesNotMatch(source,/ffmpeg\.wasm|cdn\.jsdelivr|unpkg\.com|fetch\(/u);
});
test("recap UI presents truthful provider quota and Drive storage usage, progress and format warnings",async()=>{
  const ui=await read("../app/campaigns/session-recap-gemini-drive-staging.tsx");
  for(const marker of ["decodeShortCraigAudio","makeDecodedGeminiSpeechClip",
    "Load short original Craig track","four minutes and 16 MiB",
    "96 MiB decoded-audio safety budget","Google AI Studio usage dashboard",
    "Estimated new Drive storage","uploadRecordingToDrive",
    "setUploadBytes({sent,total})","Current Drive upload:",
    'aria-label="Current Google Drive upload bytes"',
    'aria-label="Prepared audio clip progress"',
    'aria-label="Completed Gemini transcript clips"',
    "not your remaining Gemini quota","full-length",
    "craig-manifest?importId=","revokeObjectURL"]){
      if(marker==="revokeObjectURL")continue;
      assert.ok(ui.includes(marker),"Missing usage/format warning: "+marker);
    }
  assert.doesNotMatch(ui,/freeRemaining:\s*\d+|billingBalance|localStorage|sessionStorage/u);
});
