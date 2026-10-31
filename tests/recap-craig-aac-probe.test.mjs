import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {planCraigAacSpeechParts} from "../lib/campaigns/recap-craig-aac-stream.ts";
import {probeCraigAacBrowser,CRAIG_AAC_PROBE_MAX_PACKETS}
  from "../lib/campaigns/recap-craig-aac-probe.ts";

function indexForMinutes(minutes=180){
  const sampleRate=48000;
  const packets=minutes*60*sampleRate/1024;
  return {
    codec:"mp4a.40.2",channels:2,sampleRate,
    totalFrames:sampleRate*minutes*60,durationMs:minutes*60000,
    sampleCount:packets,description:new Uint8Array([0x11,0x90]),
    *samples(){
      for(let n=0;n<packets;n++)yield {
        offset:100+n*4,length:4,
        timestampUs:Math.round(n*1024*1e6/sampleRate),
        durationUs:Math.round(1024*1e6/sampleRate),
      };
    },
  };
}
function source(){
  const reads=[];
  return {reads,metadata:{bytes:256*1024*1024,mimeType:"audio/mp4",
    maxRangeBytes:1024*1024,etag:'"sample"'},async read(offset,length){
      reads.push({offset,length});
      assert.ok(length>=1&&length<=1024*1024);
      return new Uint8Array(length);
    },
  };
}
function codec(options={}){
  const state={configured:null,decoded:0,closed:0,flushed:0,decoderClosed:false};
  return {state,codec:{
    supported:async()=>options.supported!==false,
    chunk:p=>p,
    create:handlers=>({
      configure(c){state.configured=c;},
      decode(packet){
        state.decoded++;
        if(options.onPacket)options.onPacket(state.decoded);
        if(options.decodeError){handlers.error(new Error("AAC decoder error"));return;}
        if(options.noOutput)return;
        handlers.output({
          numberOfFrames:options.badFrames?32768:1024,
          numberOfChannels:options.badChannels?1:2,
          sampleRate:options.badRate?44100:48000,
          copyTo(data,{planeIndex,format}){
            assert.equal(format,"f32-planar");
            data.fill(options.nan?NaN:planeIndex===0?0.1:-0.1);
          },
          close(){state.closed++;},
        });
        assert.equal(packet.type,"key");
      },
      async flush(){state.flushed++;},
      close(){state.decoderClosed=true;},
    }),
  }};
}
test("two- and three-hour AAC plans have exact 30 / 45 rolling PCM clips",()=>{
  const two=planCraigAacSpeechParts(indexForMinutes(120));
  const three=planCraigAacSpeechParts(indexForMinutes(180));
  assert.equal(two.length,30);assert.equal(three.length,45);
  assert.equal(two.at(-1).endMs,7200000);
  assert.equal(three.at(-1).endMs,10800000);
  assert.equal(three.reduce((sum,x)=>sum+x.targetFrames,0),16000*10800);
});
test("3h Craig track diagnostic decodes only 48 packets and makes one bounded R2 audio read",async()=>{
  const audio=source(),{codec:decoder,state}=codec();
  const result=await probeCraigAacBrowser({
    source:audio,index:indexForMinutes(180),codec:decoder,
  });
  assert.equal(result.packetsTested,CRAIG_AAC_PROBE_MAX_PACKETS);
  assert.equal(result.framesDecoded,CRAIG_AAC_PROBE_MAX_PACKETS*1024);
  assert.equal(result.secondsDecoded,1024*48/48000);
  assert.equal(result.sampleRate,48000);assert.equal(result.channels,2);
  assert.equal(result.sourceReadRequests,1);
  assert.equal(result.sourceBytes,512*1024);
  assert.deepEqual(audio.reads,[{offset:100,length:512*1024}]);
  assert.equal(state.decoded,48);assert.equal(state.closed,48);
  assert.equal(state.flushed,1);assert.ok(state.decoderClosed);
});
test("browser not supporting AAC rejects before any R2 reads",async()=>{
  const audio=source(),{codec:decoder,state}=codec({supported:false});
  await assert.rejects(probeCraigAacBrowser({
    source:audio,index:indexForMinutes(),codec:decoder,
  }),/cannot decode this Craig AAC-LC/u);
  assert.equal(audio.reads.length,0);assert.equal(state.decoded,0);
});
test("AAC probe rejects bad PCM format, nonfinite output and empty decodes",async()=>{
  for(const opt of [{badRate:true},{badChannels:true},{nan:true},{badFrames:true},
    {noOutput:true},{decodeError:true}]){
    const audio=source(),{codec:decoder,state}=codec(opt);
    await assert.rejects(probeCraigAacBrowser({
      source:audio,index:indexForMinutes(),codec:decoder,
    }),/incompatible|non-finite|bounded|not produce|AAC decoder error/u);
    assert.equal(state.decoderClosed,true);
    assert.ok(state.closed<=state.decoded);
    assert.ok(audio.reads.length<=1);
  }
});
test("AAC sample test respects cancellation and frees decoder resources",async()=>{
  const controller=new AbortController(),audio=source();
  const {codec:decoder,state}=codec({onPacket:n=>{if(n===2)controller.abort();}});
  await assert.rejects(probeCraigAacBrowser({
    source:audio,index:indexForMinutes(),codec:decoder,signal:controller.signal,
  }),/stopped/u);
  assert.equal(state.decoderClosed,true);
  assert.ok(state.decoded<=2);
});
test("GM UI exposes an explicit non-upload probe and warns that a long recording is not certified",async()=>{
  const ui=await readFile(new URL("../app/campaigns/session-recap-gemini-drive-staging.tsx",import.meta.url),"utf8");
  for(const word of ["probeCraigAacBrowser","Test AAC in this browser (no upload)",
    "result.packetsTested","result.sourceReadRequests",
    "No Google Drive or AI upload","not proof that a 2–3-hour conversion",
    "Automatic Gemini submission remains disabled"]){
    assert.ok(ui.includes(word),"Missing sample warning or usage marker "+word);
  }
});
