import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {readRecapAudioWithProgress} from "../lib/campaigns/recap-audio-download-progress.ts";

const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
function responseFor(chunks){
  return new Response(new ReadableStream({
    start(controller){
      for(const chunk of chunks)controller.enqueue(new Uint8Array(chunk));
      controller.close();
    },
  }));
}

test("download progress is measured from verified bytes, never invented based on time",async()=>{
  const updates=[];
  const file=await readRecapAudioWithProgress(responseFor([[1,2,3],[4,5]]),5,
    (done,total)=>updates.push([done,total]));
  assert.equal(file.size,5);
  assert.deepEqual(updates,[[3,5],[5,5]]);
  assert.deepEqual([...new Uint8Array(await file.arrayBuffer())],[1,2,3,4,5]);
});
test("a partial Drive response never becomes a valid original recording",async()=>{
  await assert.rejects(readRecapAudioWithProgress(responseFor([[1,2]]),5),/incomplete recording/);
});
test("more bytes than the saved Drive asset are rejected before using audio",async()=>{
  await assert.rejects(readRecapAudioWithProgress(responseFor([[1,2,3]]),2),
    /more audio than the verified recording size/);
});
test("invalid byte expectations and unsuccessful requests fail closed",async()=>{
  await assert.rejects(readRecapAudioWithProgress(responseFor([[1]]),0),/valid file size/);
  await assert.rejects(readRecapAudioWithProgress(new Response("not found",{status:404}),9),
    /Could not read the original recording/);
});
test("preparation shows measured download and completed section count while active operations remain indeterminate",async()=>{
  const [wizard,preparation]=await Promise.all([
    read("app/campaigns/session-recap-staged-wizard.tsx"),
    read("lib/campaigns/recap-browser-preparation.ts"),
  ]);
  assert.match(wizard,/readRecapAudioWithProgress\(response,currentSource\.bytes/u);
  assert.match(wizard,/setMeter\(\{done,total,unit:"bytes"\}\)/u);
  assert.match(wizard,/setMeter\(\{done:completed,total,unit:"sections"\}\)/u);
  assert.match(wizard,/meter\?Math\.min\(meter\.done,meter\.total\):undefined/u);
  assert.match(wizard,/\{progressView\}/u);
  assert.match(preparation,/onStage\?:\(description:string,completed:number,total:number\)/u);
  assert.match(preparation,/Converting audio section/u);
  assert.match(preparation,/Saving audio section/u);
  assert.match(preparation,/onBytes\?:\(done:number,total:number\)/u);
});
test("existing upload, transcription and writer expose stage-appropriate progress without fake AI percentages",async()=>{
  const [upload,transcribe,writer]=await Promise.all([
    read("app/campaigns/session-recap-audio-uploader.tsx"),
    read("app/campaigns/session-recap-staged-transcriber.tsx"),
    read("app/campaigns/session-recap-staged-writer.tsx"),
  ]);
  assert.match(upload,/Recording upload progress/u);
  assert.match(transcribe,/Transcription sections complete/u);
  assert.match(transcribe,/Current transcription request in progress/u);
  assert.match(writer,/Saved recap scene sections/u);
  assert.match(writer,/Current recap writing request in progress/u);
});
