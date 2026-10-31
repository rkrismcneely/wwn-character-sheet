import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {estimatedRecapAudioTokens,recapQuotaNotice}
  from "../lib/campaigns/recap-quota-estimate.ts";
import {checkGeminiRecapReadiness}
  from "../lib/account/recap-gemini-readiness.ts";
const read=p=>readFile(new URL("../"+p,import.meta.url),"utf8");

test("estimate input token volume from actual playback duration, not compressed file size",()=>{
  assert.equal(estimatedRecapAudioTokens(60_000),1920);
  assert.equal(estimatedRecapAudioTokens(2*60*60_000),230400);
  assert.equal(estimatedRecapAudioTokens(165*60_000),316800);
  assert.equal(estimatedRecapAudioTokens(3*60*60_000),345600);
  assert.equal(recapQuotaNotice(165*60_000).size,"large");
  assert.equal(recapQuotaNotice(null).size,"unknown");
  assert.equal(recapQuotaNotice(12_000).size,"ordinary");
  for(const value of [0,-1,NaN,Infinity,9*60*60_000])
    assert.equal(estimatedRecapAudioTokens(value),null);
});
test("readiness checks exact model and Files API without any billable generation or upload",async()=>{
  const requests=[];
  const result=await checkGeminiRecapReadiness("PRIVATE-KEY",async(url,init)=>{
    requests.push({url:String(url),init});
    return Response.json({ok:true});
  });
  assert.deepEqual(result,{modelAvailable:true,filesApiReachable:true,quotaVerified:false,warning:null});
  assert.equal(requests.length,2);
  assert.ok(requests.some(x=>x.url.endsWith("/v1beta/models/gemini-3.8-flash")));
  assert.ok(requests.some(x=>x.url.endsWith("/v1beta/files?pageSize=1")));
  for(const entry of requests){
    assert.equal(entry.init.method,"GET");
    assert.equal(entry.init.redirect,"manual");
    assert.equal(entry.init.headers["x-goog-api-key"],"PRIVATE-KEY");
    assert.equal(entry.init.body,undefined);
  }
});
test("missing model or Files API produces warnings but never fabricates remaining quota",async()=>{
  const result=await checkGeminiRecapReadiness("PRIVATE-KEY",async(url)=>{
    if(String(url).includes("/models/"))return new Response(null,{status:404});
    return Response.json({files:[]});
  });
  assert.equal(result.modelAvailable,false);
  assert.equal(result.filesApiReachable,true);
  assert.equal(result.quotaVerified,false);
  assert.match(result.warning,/not confirmed/u);
  const unavailable=await checkGeminiRecapReadiness("PRIVATE-KEY",async()=>{throw Error("secret");});
  assert.equal(unavailable.modelAvailable,false);
  assert.doesNotMatch(JSON.stringify(unavailable),/secret/u);
});
test("GM receives estimate in approval dialog and recorded duration from player",async()=>{
  const [dialog,player,route]=await Promise.all([
    read("app/campaigns/session-recap-auto-status.tsx"),
    read("app/campaigns/session-recap-audio-player.tsx"),
    read("app/api/account/recap-ai/gemini/route.ts"),
  ]);
  assert.match(dialog,/recapQuotaNotice\(/u);
  assert.match(dialog,/estimatedTokens\.toLocaleString\(\)/u);
  assert.match(dialog,/aistudio\.google\.com\/rate-limit/u);
  assert.match(player,/onLoadedMetadata=/u);
  assert.match(player,/onDuration\?\.\(selected\.id,/u);
  assert.match(route,/checkGeminiRecapReadiness\(plain\)/u);
  assert.match(route,/quota cannot be checked automatically/u);
});
