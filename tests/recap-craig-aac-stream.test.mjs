import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {parsePcmWavHeader} from "../lib/campaigns/recap-wav-chunks.ts";
import {streamCraigAacSpeech,planCraigAacSpeechParts,
  CRAIG_AAC_DECODE_BATCH_PACKETS,CRAIG_AAC_AUDIO_READ_BYTES}
  from "../lib/campaigns/recap-craig-aac-stream.ts";
const makeIndex=(count=48)=>({
  codec:"mp4a.40.2",sampleRate:48000,channels:2,
  durationMs:Math.round(count*1024/48),totalFrames:count*1024,
  sampleCount:count,description:new Uint8Array([0x11,0x90]),
  *samples(){for(let i=0;i<count;i++)
    yield {offset:i*4+24,length:4,timestampUs:Math.round(i*1024/48000*1e6),
      durationUs:Math.round(1024/48000*1e6)};}
});
const source=()=>{
  const reads=[];
  return {reads,metadata:{mimeType:"audio/mp4",bytes:2*1024*1024,
    etag:'"c"',maxRangeBytes:1024*1024},
    async read(offset,length){reads.push({offset,length});return new Uint8Array(length);}};
};
function fakeCodec(options={}){
  const state={decode:0,outputsClosed:0,flushes:0,decoderClosed:false,configuration:null};
  return {state,codec:{
    supported:async()=>options.supported!==false,
    chunk:init=>init,
    create:handlers=>({
      configure:config=>{state.configuration=config;},
      decode(packet){
        state.decode++;
        if(options.throwOnPacket===state.decode){handlers.error(new Error("Codec failed"));return;}
        if(options.abortOnPacket===state.decode)options.abort?.abort();
        const frames=options.wrongFrames?1000:1024;
        handlers.output({
          numberOfFrames:frames,numberOfChannels:2,sampleRate:48000,
          copyTo(target,{planeIndex,format}){
            assert.equal(format,"f32-planar");target.fill(planeIndex===0?.5:-.5);
          },
          close(){state.outputsClosed++;},
        });
        assert.equal(packet.type,"key");
      },
      async flush(){state.flushes++;},
      close(){state.decoderClosed=true;},
    }),
  }};
}
test("AAC long-audio plan uses exact four-minute PCM intervals",()=>{
  const index=makeIndex(50000);
  const parts=planCraigAacSpeechParts(index);
  assert.equal(parts.length,14);
  assert.equal(parts[0].startMs,0);assert.equal(parts[0].endMs,240000);
  assert.ok(parts.at(-1).endMs>50*60*1000);
  assert.throws(()=>planCraigAacSpeechParts({...index,totalFrames:0}),/timeline/u);
});
test("AAC-LC WebCodecs stream yields valid mono WAV, bounds reads and closes outputs",async()=>{
  const data=source(),index=makeIndex(),{codec,state}=fakeCodec(),files=[],progress=[];
  const output=await streamCraigAacSpeech({source:data,index,codec,
    onClip:async(file,part)=>files.push({file,part}),
    onProgress:value=>progress.push(value)});
  assert.equal(output.parts.length,1);assert.equal(files.length,1);
  assert.equal(state.decode,index.sampleCount);assert.equal(state.outputsClosed,index.sampleCount);
  assert.ok(state.decoderClosed);assert.ok(state.flushes>=1);
  assert.equal(state.configuration.codec,"mp4a.40.2");
  assert.deepEqual([...state.configuration.description],[0x11,0x90]);
  const fileBytes=new Uint8Array(await files[0].file.arrayBuffer());
  const parsed=parsePcmWavHeader(fileBytes,fileBytes.length);
  assert.equal(parsed.channels,1);assert.equal(parsed.sampleRate,16000);
  assert.equal(parsed.bitsPerSample,16);
  assert.equal(fileBytes.length,44+16384*2);
  assert.equal(new DataView(fileBytes.buffer).getInt16(44,true),0);
  assert.equal(progress.at(-1).packetsDecoded,48);
  assert.equal(progress.at(-1).clipsCompleted,1);
  assert.ok(data.reads.length<=2);
  assert.ok(data.reads.every(r=>r.length<=CRAIG_AAC_AUDIO_READ_BYTES));
});
test("AAC bounds output batches and avoids one private R2 read per packet",async()=>{
  const data=source(),{codec,state}=fakeCodec(),files=[];
  const index=makeIndex(400);
  await streamCraigAacSpeech({source:data,index,codec,onClip:async(file)=>files.push(file)});
  assert.equal(state.decode,400);assert.equal(state.outputsClosed,400);
  assert.ok(state.flushes>=Math.floor(400/CRAIG_AAC_DECODE_BATCH_PACKETS));
  assert.ok(data.reads.length<20);assert.equal(files.length,1);
});
test("unsupported decoder fails before reading AAC media or uploading",async()=>{
  const data=source(),{codec}=fakeCodec({supported:false});
  await assert.rejects(streamCraigAacSpeech({source:data,index:makeIndex(),codec,
    onClip:async()=>{throw Error("should not upload");}}),/does not support/u);
  assert.equal(data.reads.length,0);
});
test("malformed output, codec failures and cancellation stop without publishing",async()=>{
  for(const options of [{wrongFrames:true},{throwOnPacket:3}]){
    const data=source(),{codec,state}=fakeCodec(options);
    await assert.rejects(streamCraigAacSpeech({source:data,index:makeIndex(),codec,
      onClip:async()=>{throw Error("should not upload");}}),
      /timeline|Codec failed/u);
    assert.ok(state.decoderClosed);assert.equal(state.outputsClosed,state.decode);
  }
  const abort=new AbortController(),data=source();
  const {codec,state}=fakeCodec({abort,abortOnPacket:1});
  await assert.rejects(streamCraigAacSpeech({source:data,index:makeIndex(),
    codec,signal:abort.signal,onClip:async()=>{throw Error("should not upload");}}),
    /conversion stopped/u);
  assert.ok(state.decoderClosed);assert.equal(data.reads.length,1);
});
test("AAC GM-owned staging is shared with FLAC without enabling provider billing",async()=>{
  const ui=await readFile(new URL("../app/campaigns/session-recap-gemini-drive-staging.tsx",import.meta.url),"utf8");
  for(const expected of ["streamCraigAacSpeech","planCraigAacSpeechParts",
    "Prepare full Craig audio (FLAC or AAC) in my Drive","uploadRecordingToDrive",
    "sourceDigest","old.sourceDigest!==digest",'action:"attach"',
    "Automatic Gemini submission remains disabled","sourceReadRequests"]){
    assert.ok(ui.includes(expected),"Missing AAC UI safety/ownership assertion "+expected);
  }
});
