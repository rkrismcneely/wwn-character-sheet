import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  CRAIG_RANGE_WINDOW_BYTES,CRAIG_RANGE_MAX_SOURCE_BYTES,
  parseCraigRequestedRange,parseCraigContentRange,
  craigReadPlan,validateCraigRangeMime,craigRangeHeaders,
} from "../lib/campaigns/recap-craig-audio-ranges.ts";
import { openPrivateCraigRangeReader,inspectCraigFlacStreamInfo }
  from "../lib/campaigns/recap-craig-range-browser.ts";
const read=path=>readFile(new URL(path,import.meta.url),"utf8");

test("Craig range parser rejects whole files, open-ended, suffix and multi-range fetches",()=>{
  const total=80*1024*1024;
  assert.deepEqual(parseCraigRequestedRange("bytes=1048576-2097151",total),{
    start:1048576,end:2097151,length:CRAIG_RANGE_WINDOW_BYTES,total,
  });
  for(const invalid of [null,"bytes=0-","bytes=-100","bytes=0-1048576",
    "bytes=0-4,7-8","bytes=2-1","bytes=0-83886080","bytes=000-1"]){
    assert.throws(()=>parseCraigRequestedRange(invalid,total));
  }
  assert.throws(()=>parseCraigRequestedRange("bytes=0-100",CRAIG_RANGE_MAX_SOURCE_BYTES+1));
  assert.deepEqual(craigReadPlan(2*CRAIG_RANGE_WINDOW_BYTES+13).map(x=>x.length),
    [CRAIG_RANGE_WINDOW_BYTES,CRAIG_RANGE_WINDOW_BYTES,13]);
  assert.equal(validateCraigRangeMime("craig-01.flac","audio/flac"),"audio/flac");
  assert.equal(validateCraigRangeMime("craig-01.aac","audio/aac"),"audio/mp4");
  assert.throws(()=>validateCraigRangeMime("craig-01.aac","application/zip"));
  const response=craigRangeHeaders({start:0,end:99,length:100,total},'"etag123"',"audio/flac");
  assert.equal(response["content-range"],"bytes 0-99/"+total);
  assert.equal(response["cache-control"],"private, no-store");
  assert.doesNotThrow(()=>parseCraigContentRange("bytes 0-99/"+total,
    {start:0,end:99,length:100,total}));
  assert.throws(()=>parseCraigContentRange("bytes 0-100/"+total,
    {start:0,end:99,length:100,total}));
});
test("browser Craig ranged reader pins one immutable source and reports only confirmed bytes",async()=>{
  const operations=[];
  const total=40*1024*1024;
  const fetcher=async (url,init)=>{
    operations.push({url,init});
    if(init.method==="HEAD")return new Response(null,{status:200,headers:{
      "content-length":String(total),"content-type":"audio/flac",
      "etag":'"version1"',"x-twe-max-range-bytes":String(CRAIG_RANGE_WINDOW_BYTES),
    }});
    const match=/^bytes=(\d+)-(\d+)$/u.exec(init.headers.range);
    assert.ok(match);
    assert.equal(init.headers["if-match"],'"version1"');
    const start=Number(match[1]),end=Number(match[2]),length=end-start+1;
    return new Response(new Uint8Array(length),{status:206,headers:{
      "content-length":String(length),"content-range":"bytes "+start+"-"+end+"/"+total,
      "etag":'"version1"',
    }});
  };
  const progress=[];
  const source=await openPrivateCraigRangeReader(
    "cmp_"+"a".repeat(22),"11111111-2222-4333-8444-555555555555",3,
    {fetcher,onProgress:p=>progress.push(p)},
  );
  assert.equal(source.metadata.bytes,total);
  const window=await source.read(1_048_576,CRAIG_RANGE_WINDOW_BYTES);
  assert.equal(window.length,CRAIG_RANGE_WINDOW_BYTES);
  assert.equal(progress[0].receivedBytes,CRAIG_RANGE_WINDOW_BYTES);
  const trailing=await source.read(total-128,128);
  assert.equal(trailing.length,128);
  assert.equal(progress[1].receivedBytes,CRAIG_RANGE_WINDOW_BYTES+128);
  assert.equal(operations.length,3);
  assert.equal(operations[2].init.credentials,"same-origin");
  await assert.rejects(source.read(0,CRAIG_RANGE_WINDOW_BYTES+1),/bounded/u);
  await assert.rejects(source.read(total,1),/bounded/u);
});
test("changed Craig ETag, incorrect Content-Range or unexpected 200 cannot be mistaken for audio data",async()=>{
  const base=new Headers({"content-length":"2048","content-type":"audio/mp4",
    "etag":'"old"',"x-twe-max-range-bytes":String(CRAIG_RANGE_WINDOW_BYTES)});
  for(const scenario of ["etag","range","status"]){
    const fetcher=async(_,init)=>{
      if(init.method==="HEAD")return new Response(null,{status:200,headers:base});
      return new Response(new Uint8Array(64),{status:scenario==="status"?200:206,headers:{
        "content-length":"64","content-range":scenario==="range"?"bytes 1-64/2048":"bytes 0-63/2048",
        "etag":scenario==="etag"?'"changed"':'"old"',
      }});
    };
    const source=await openPrivateCraigRangeReader(
      "cmp_"+ "b".repeat(22),"11111111-2222-4333-8444-555555555555",0,{fetcher});
    await assert.rejects(source.read(0,64));
  }
});
test("FLAC STREAMINFO accurately reports real sample rate, channels and 3 hour duration",()=>{
  const header=new Uint8Array(42);
  header.set([102,76,97,67,0,0,0,34],0);
  const rate=48000,channels=2,bits=16,total=BigInt(rate*3*3600);
  header[18]=(rate>>12)&255;
  header[19]=(rate>>4)&255;
  header[20]=((rate&15)<<4)|(((channels-1)&7)<<1)|(((bits-1)>>4)&1);
  header[21]=(((bits-1)&15)<<4)|Number((total>>32n)&15n);
  header[22]=Number((total>>24n)&255n);
  header[23]=Number((total>>16n)&255n);
  header[24]=Number((total>>8n)&255n);
  header[25]=Number(total&255n);
  const info=inspectCraigFlacStreamInfo(header);
  assert.equal(info.sampleRate,48000);
  assert.equal(info.channels,2);
  assert.equal(info.bitsPerSample,16);
  assert.equal(info.durationMs,3*3600*1000);
  assert.throws(()=>inspectCraigFlacStreamInfo(new Uint8Array(42)),/STREAMINFO/u);
});
test("Craig long source route is GM-scoped, capped, immutable and never exposes full audio",async()=>{
  const [route,ui,client]=await Promise.all([
    read("../app/api/campaigns/[id]/recap-imports/craig-track-range/route.ts"),
    read("../app/campaigns/session-recap-gemini-drive-staging.tsx"),
    read("../lib/campaigns/recap-craig-range-browser.ts"),
  ]);
  for(const value of ["getSessionActor","getCraigRecordingForDownloadJob",
    "recap-track-speakers/","TRACK_UNCONFIRMED",
    "validateCraigRangeMime","CRAIG_RANGE_MAX_SOURCE_BYTES",
    "head.httpEtag","request.headers.get(\"if-match\")",
    "request.headers.get(\"range\")","parseCraigRequestedRange",
    "range:{offset:part.start,length:part.length}","status:206",
    "cache-control","private, no-store"]){
    assert.ok(route.includes(value),"Missing private source reader guard: "+value);
  }
  assert.doesNotMatch(route,/new Response\(head\.body|env\.BUCKET\.get\(key\)\s*;/u);
  for(const value of ["openPrivateCraigRangeReader","inspectCraigFlacStreamInfo",
    "Inspect long Craig track","Save original to computer (streaming)",
    "Source bytes retrieved:","Original Craig audio transfer bytes",
    "does not decode or transcribe","Cloudflare R2 read quota",
    "sourceTransfer.bytes","AbortController"]){
    assert.ok(ui.includes(value),"Missing long audio progress/limitations: "+value);
  }
  assert.match(client,/response.status!==206/u);
  assert.match(client,/source changed/u);
  assert.doesNotMatch(client,/\.blob\(\)|localStorage|sessionStorage/u);
});
