import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {Script,createContext} from "node:vm";
import {recapFFmpegWorkerSource} from "../lib/campaigns/recap-ffmpeg-worker-source.ts";

const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");

test("same-origin FFmpeg worker is bundled instead of fetched by a Cloudflare request",async()=>{
  const route=await read("app/api/recap-ffmpeg/[name]/route.ts");
  assert.match(route,/recapFFmpegWorkerSource/u);
  assert.match(route,/new Response\(recapFFmpegWorkerSource/u);
  assert.match(route,/name!=="worker\.js"/u);
  assert.match(route,/"content-type":"text\/javascript/u);
  assert.match(route,/"cache-control":"no-store"/u);
  assert.doesNotMatch(route,/await fetch\(|cdn\.jsdelivr|unpkg\.com|AbortSignal\.timeout/u);
});

test("module worker includes FFmpeg message protocol without separate const/errors imports",()=>{
  assert.match(recapFFmpegWorkerSource,/self\.onmessage/u);
  assert.match(recapFFmpegWorkerSource,/case "LOAD"/u);
  for(const type of ["EXEC","WRITE_FILE","READ_FILE","DELETE_FILE","ERROR","LOG","PROGRESS"]){
    assert.ok(recapFFmpegWorkerSource.includes(type),"Missing worker protocol: "+type);
  }
  assert.match(recapFFmpegWorkerSource,/await import\(coreURL\)/u);
  assert.doesNotMatch(recapFFmpegWorkerSource,/importScripts\(/u);
  assert.doesNotMatch(recapFFmpegWorkerSource,/from "\.\/const\.js"|from "\.\/errors\.js"/u);
  assert.doesNotMatch(recapFFmpegWorkerSource,/fetch\(|cdn\.jsdelivr/u);
  assert.doesNotThrow(()=>new Script(recapFFmpegWorkerSource));
});

test("unloaded worker sends a bounded protocol error, not an unresolved promise",async()=>{
  const events=[];
  const self={postMessage:message=>events.push(message)};
  const context=createContext({self,Uint8Array,btoa:value=>Buffer.from(value).toString("base64")});
  new Script(recapFFmpegWorkerSource).runInContext(context);
  await self.onmessage({data:{id:17,type:"EXEC",data:{args:["-version"]}}});
  assert.equal(events.length,1);
  assert.equal(events[0].id,17);
  assert.equal(events[0].type,"ERROR");
  assert.match(events[0].data,/not loaded/u);
});

test("new worker URL bypasses cached proxy worker after deployment",async()=>{
  const source=await read("lib/campaigns/recap-browser-preparation.ts");
  assert.match(source,/worker\.js\?version=selfhosted-1/u);
  assert.match(source,/classWorkerURL:worker/u);
  assert.match(source,/Audio converter worker is unavailable \(HTTP /u);
  assert.match(source,/FFMPEG_START_TIMEOUT_MS=90_000/u);
});

test("original source and audio-part checkpoints are not changed by the worker fix",async()=>{
  const source=await read("lib/campaigns/recap-browser-preparation.ts");
  assert.match(source,/browserRecapFile\(part\.key\)/u);
  assert.match(source,/saveBrowserRecapFile\(part\.key,prepared\)/u);
  assert.doesNotMatch(source,/deleteFile\(part\.key\)|BUCKET\.delete/u);
});
