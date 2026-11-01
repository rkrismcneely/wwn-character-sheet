import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {
  planLongAudio,LONG_AUDIO_THRESHOLD_MS,offsetRecapSceneHeadings,LongAudioFormatError,
} from "../lib/campaigns/recap-long-audio-plan.ts";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");

test("a 2-hour synthetic CBR MP3 is divided on actual verified MPEG frame boundaries",async()=>{
  const duration=2*60*60*1000, bitrate=128,rate=44100,frameBytes=417;
  const byteSize=Math.floor(duration*bitrate/8/frameBytes)*frameBytes;
  let requests=0;
  const mock=async(start,len)=>{
    requests++;
    assert.ok(len<=65536);
    const data=new Uint8Array(len);
    for(let i=0;i<len;i++){
      const phase=(start+i)%frameBytes;
      if(phase===0)data[i]=0xff;
      if(phase===1)data[i]=0xfb;
      if(phase===2)data[i]=0x90;
    }
    return data;
  };
  const parts=await planLongAudio({
    durationMs:duration,byteSize,mimeType:"audio/mpeg",
  },mock);
  assert.ok(parts.length>=3&&parts.length<=5);
  assert.equal(parts[0].sourceStart,0);
  assert.equal(parts.at(-1).sourceEnd,byteSize);
  assert.equal(parts.at(-1).endMs,duration);
  for(let i=0;i<parts.length;i++){
    const part=parts[i];
    assert.equal(part.index,i);
    assert.equal(part.sourceStart%frameBytes,0);
    assert.equal(part.sourceEnd%frameBytes,0);
    assert.equal(part.prefixBase64,"");
    assert.equal(part.mimeType,"audio/mpeg");
    assert.ok(part.endMs-part.startMs<=36*60_000);
    if(i)assert.equal(part.sourceStart,parts[i-1].sourceEnd);
  }
  assert.ok(requests<10,"segments require only tiny header/range probes");
});

test("MP3 Xing/Info full-file duration frame is excluded from the first segment",async()=>{
  const duration=2*60*60*1000,frameBytes=417;
  const size=Math.floor(duration*128/8/frameBytes)*frameBytes;
  const parts=await planLongAudio({byteSize:size,durationMs:duration,mimeType:"audio/mpeg"},
    async(start,len)=>{
      const data=new Uint8Array(len);
      for(let i=0;i<len;i++){
        const global=start+i,phase=global%frameBytes;
        if(phase===0)data[i]=0xff;
        if(phase===1)data[i]=0xfb;
        if(phase===2)data[i]=0x90;
        const name="Info";
        if(global>=21&&global<25)data[i]=name.charCodeAt(global-21);
      }
      return data;
    });
  assert.equal(parts[0].sourceStart,frameBytes,
    "Do not copy duration metadata for the entire recording into the first section");
  assert.equal(parts[0].startMs,0);
  assert.equal(parts.at(-1).sourceEnd,size);
});

test("a long PCM WAV produces real standalone 44-byte WAV headers and sample-aligned ranges",async()=>{
  const duration=2*60*60*1000,byteRate=64000,total=byteRate*duration/1000;
  const header=new Uint8Array(44),view=new DataView(header.buffer);
  const tag=(i,s)=>{for(let j=0;j<s.length;j++)header[i+j]=s.charCodeAt(j);};
  tag(0,"RIFF");tag(8,"WAVE");tag(12,"fmt ");tag(36,"data");
  view.setUint32(4,36+total,true);view.setUint32(16,16,true);
  view.setUint16(20,1,true);view.setUint16(22,2,true);
  view.setUint32(24,16000,true);view.setUint32(28,byteRate,true);
  view.setUint16(32,4,true);view.setUint16(34,16,true);
  view.setUint32(40,total,true);
  const parts=await planLongAudio({
    byteSize:total+44,mimeType:"audio/wav",durationMs:duration,
  },async(start,len)=>{const data=new Uint8Array(len);data.set(header.subarray(start,Math.min(start+len,44)));return data;});
  assert.equal(parts.length,4);
  let accumulated=0;
  for(let i=0;i<parts.length;i++){
    const p=parts[i];
    assert.equal(p.sourceStart%4,0);
    assert.equal(p.sourceEnd%4,0);
    assert.equal(p.sourceEnd-p.sourceStart,accumulated===0?parts[0].sourceEnd-parts[0].sourceStart:p.sourceEnd-p.sourceStart);
    const raw=Uint8Array.from(atob(p.prefixBase64),c=>c.charCodeAt(0));
    assert.equal(raw.length,44);
    assert.equal(String.fromCharCode(...raw.subarray(0,4)),"RIFF");
    assert.equal(new DataView(raw.buffer).getUint32(40,true),p.sourceEnd-p.sourceStart);
    assert.equal(new DataView(raw.buffer).getUint32(4,true),36+p.sourceEnd-p.sourceStart);
    assert.equal(p.startMs,accumulated);
    accumulated=p.endMs;
    if(i)assert.equal(p.sourceStart,parts[i-1].sourceEnd);
  }
  assert.equal(accumulated,duration);
});

test("unsupported long audio is stopped before a model request, not sent as fake arbitrary bytes",async()=>{
  for(const mimeType of ["audio/mp4","audio/flac","audio/aac"]){
    await assert.rejects(()=>planLongAudio({mimeType,byteSize:140_000_000,durationMs:8_000_000},
      async()=>new Uint8Array(65536)),e=>e instanceof LongAudioFormatError&&e.code==="format_unsupported");
  }
  assert.equal(LONG_AUDIO_THRESHOLD_MS,95*60_000);
});

test("absolute audio timestamps are preserved across section joins",()=>{
  const input="## 00:12:40 — The messenger\nNarrative\n### 00:30:01 — The gate";
  const shifted=offsetRecapSceneHeadings(input,35*60_000);
  assert.equal(shifted,"## 00:47:40 — The messenger\nNarrative\n### 01:05:01 — The gate");
  assert.equal(offsetRecapSceneHeadings("At 00:12:40 a messenger arrived.",60_000),
    "At 00:12:40 a messenger arrived.");
});

test("segmented jobs preserve individual consent, resumability and billable request safety",async()=>{
  const [schema,runner,longRunner,staging,route]=await Promise.all([
    read("drizzle/0052_recap_long_audio_segments.sql"),
    read("lib/campaigns/recap-only-runner.ts"),
    read("lib/campaigns/recap-long-audio-runner.ts"),
    read("lib/campaigns/recap-gemini-chunked-staging.ts"),
    read("app/api/campaigns/[id]/session-recaps/auto-recap/route.ts"),
  ]);
  assert.match(schema,/processing_mode TEXT NOT NULL DEFAULT 'single'/u);
  assert.match(schema,/UNIQUE\(job_id,segment_index\)/u);
  assert.match(runner,/duration>LONG_AUDIO_THRESHOLD_MS/u);
  assert.match(runner,/initializeSegmentedRecap\(env,job,source\)/u);
  assert.match(runner,/advanceSegmentedRecap\(env,job,source,key/u);
  assert.match(runner,/combinedSegmentNotes\(env\.DB,job.id\)/u);
  assert.match(longRunner,/DB\.batch\(updates\)/u);
  assert.match(longRunner,/SET status='submitting'/u);
  assert.match(longRunner,/segment_submission_uncertain/u);
  assert.match(longRunner,/status='submitted',interaction_id=\?/u);
  assert.match(longRunner,/status='ready',notes=\?/u);
  assert.match(staging,/tableFor\(source\)/u);
  assert.match(staging,/source\.segment\.sourceStart/u);
  assert.match(route,/confirmed:body\.confirmed===true/u);
});
