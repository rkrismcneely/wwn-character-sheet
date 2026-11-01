import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {validateBrowserM4aPlan,RecapM4aPlanError}
  from "../lib/campaigns/recap-m4a-browser-preflight.ts";

const valid=[
  {index:0,startMs:0,endMs:90*60000,sourceStart:8192,sourceEnd:51_000_000,
    mimeType:"audio/mp4",prefixBase64:""},
  {index:1,startMs:90*60000,endMs:180*60000,sourceStart:51_000_000,
    sourceEnd:102_000_000,mimeType:"audio/mp4",prefixBase64:""},
];
test("browser-found M4A split boundaries are bounded and contain no playable bytes",()=>{
  const result=validateBrowserM4aPlan(valid,105_000_000,180*60000);
  assert.deepEqual(result,valid);
  assert.ok(JSON.stringify(result).length<1024);
});
test("all malformed or overly-long GM-submitted M4A split plans fail closed",()=>{
  const changes=[
    [{...valid[0],index:1},valid[1]],
    [valid[0],{...valid[1],startMs:91*60000}],
    [valid[0],{...valid[1],sourceStart:51_000_001}],
    [valid[0],{...valid[1],sourceEnd:105_000_001}],
    [valid[0],{...valid[1],endMs:220*60000}],
    [valid[0],{...valid[1],mimeType:"audio/wav"}],
    [valid[0],{...valid[1],prefixBase64:"untrusted"}],
    [{...valid[0],endMs:101*60000},{...valid[1],startMs:101*60000,endMs:180*60000}],
    [valid[0]],
    [...Array.from({length:17},()=>valid[0])],
  ];
  for(const bad of changes){
    assert.throws(()=>validateBrowserM4aPlan(bad,105_000_000,180*60000),
      e=>e instanceof RecapM4aPlanError);
  }
});
test("M4A client preparation and GM-only backend submission are connected",async()=>{
  const code=await readFile(new URL("../app/campaigns/session-recap-auto-status.tsx",import.meta.url),"utf8");
  const route=await readFile(new URL("../app/api/campaigns/[id]/session-recaps/auto-recap/route.ts",import.meta.url),"utf8");
  const runner=await readFile(new URL("../lib/campaigns/recap-long-audio-runner.ts",import.meta.url),"utf8");
  assert.match(code,/planM4a\(\{byteSize:total,durationMs,mimeType:"audio\/mp4"\}/u);
  assert.match(code,/Range:"bytes="\+start\+"-"\+\(start\+length-1\)/u);
  assert.match(code,/includeHeaders:false/u);
  assert.match(code,/m4aPlan\}\)/u);
  assert.match(route,/validateBrowserM4aPlan\(body\.m4aPlan,asset\.byteSize,body\.durationMs\)/u);
  assert.match(route,/processing_mode='segmented'/u);
  assert.match(route,/confirmed:body\.confirmed===true/u);
  assert.match(runner,/prepareM4aSection\(source/u);
  assert.match(runner,/prefix_base64=\?,updated_at=\?/u);
});
