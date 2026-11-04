import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {matchDirectRecapTranscription} from "../lib/campaigns/recap-direct-transcription.ts";
import {readRecapClipSubmitResponse} from "../lib/campaigns/recap-transcript-response.ts";

const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
const id="cmp_"+"A".repeat(22);
const root="/api/campaigns/"+id+"/session-recaps/transcript/";

test("only exact Gemini and Groq audio POST requests bypass framework parsing",()=>{
  assert.deepEqual(matchDirectRecapTranscription(root+"gemini","POST"),{campaignId:id,provider:"gemini"});
  assert.deepEqual(matchDirectRecapTranscription(root+"transcribe","POST"),{campaignId:id,provider:"groq"});
  for(const path of [root+"gemini",root+"transcribe"]){
    for(const method of ["GET","OPTIONS","DELETE","PUT"])
      assert.equal(matchDirectRecapTranscription(path,method),null);
  }
  for(const path of [root+"gemini/other",root+"stage",root+"local",
    root+"gemini?query=1",root.replace(id,"not-a-public-id")+"gemini"])
    assert.equal(matchDirectRecapTranscription(path,"POST"),null);
});

test("direct worker path forwards original Request to authenticated provider route",async()=>{
  const source=await read("worker/index.ts");
  assert.match(source,/matchDirectRecapTranscription\(url\.pathname,request\.method\)/u);
  assert.match(source,/postGeminiTranscription\(request,routeContext\)/u);
  assert.match(source,/postGroqTranscription\(request,routeContext\)/u);
  assert.match(source,/params:Promise\.resolve\(\{id:transcribeClip\.campaignId\}\)/u);
  const marker=source.indexOf("matchDirectRecapTranscription(url.pathname,request.method)");
  assert.ok(marker>0&&marker<source.indexOf("await handler.fetch(request, env, ctx)"));
  for(const path of [
    "app/api/campaigns/[id]/session-recaps/transcript/gemini/route.ts",
    "app/api/campaigns/[id]/session-recaps/transcript/transcribe/route.ts",
  ]){
    const route=await read(path);
    assert.match(route,/getSessionActor\(request\)/u,path);
    assert.match(route,/canManageCampaignContent\(/u,path);
    assert.match(route,/request\.headers\.get\("origin"\)/u,path);
    assert.match(route,/approvedShare/u,path);
    assert.match(route,/approvedBilling/u,path);
    assert.match(route,/await request\.formData\(\)/u,path);
    assert.match(route,/recapCloudClipReceipt\(/u,path);
  }
});

test("plain text HTTP 413 becomes a clear error, not JSON.parse and not Gemini billing",async()=>{
  const result=new Response("Payload Too Large",{status:413,headers:{"content-type":"text/plain"}});
  await assert.rejects(readRecapClipSubmitResponse(result,1),error=>{
    assert.match(error.message,/Section 1/u);
    assert.match(error.message,/HTTP 413 Payload Too Large/u);
    assert.match(error.message,/upload limit, not evidence of exhausted Gemini or Groq quota/u);
    assert.doesNotMatch(error.message,/Unexpected token/u);
    return true;
  });
});

test("JSON API errors and successful saved receipts remain supported",async()=>{
  await assert.rejects(
    readRecapClipSubmitResponse(Response.json({error:"Personal provider quota reached"},{status:429}),2),
    /Personal provider quota reached/u);
  assert.deepEqual(await readRecapClipSubmitResponse(
    Response.json({saved:true,duplicate:false}),3),{saved:true,duplicate:false});
  assert.deepEqual(await readRecapClipSubmitResponse(
    Response.json({saved:true,duplicate:true}),3),{saved:true,duplicate:true});
});
test("HTML or empty upstream response is summarized by status, never echoed",async()=>{
  await assert.rejects(readRecapClipSubmitResponse(
    new Response("<html>private error details</html>",{status:502}),4),
    /Section 4.*HTTP 502/u);
  await assert.rejects(readRecapClipSubmitResponse(
    new Response("Payload Too Large",{status:200}),5),
    /response was incomplete/u);
});

test("client proactively validates provider section size before a paid-capable request",async()=>{
  const code=await read("app/campaigns/session-recap-staged-transcriber.tsx");
  assert.match(code,/readRecapClipSubmitResponse\(response,i\+1\)/u);
  assert.match(code,/const maxSize=provider==="gemini"\?11\*1024\*1024:16\*1024\*1024/u);
  assert.match(code,/file\.size>maxSize/u);
  assert.match(code,/Previously prepared sections are saved/u);
  const gemini=await read("app/api/campaigns/[id]/session-recaps/transcript/gemini/route.ts");
  assert.match(gemini,/MAX_GEMINI_CHUNK_BYTES\+131_072/u);
  assert.match(gemini,/length&&\(!\/\^\\d\+\$\/u);
});
