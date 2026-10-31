import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {recapProgress,formatRecapBytes,RECAP_PROGRESS_STEPS}
  from "../lib/campaigns/recap-progress.ts";

const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
const MiB=1024*1024;
const input=(status,bytes,total)=>({status,stageBytes:bytes,totalBytes:total});

test("progress reports real acknowledged upload fraction, not overall Gemini percent",()=>{
  const transferring=recapProgress(input("transferring",15*MiB,100*MiB));
  assert.equal(transferring.activeStep,0);
  assert.equal(transferring.transferPercent,15);
  assert.equal(transferring.completedBytes,15*MiB);
  assert.equal(transferring.totalBytes,100*MiB);
  assert.equal(transferring.indeterminate,false);
  assert.equal(recapProgress(input("transferring",0,100*MiB)).transferPercent,0);
  assert.equal(recapProgress(input("transferring",100*MiB,100*MiB)).transferPercent,100);
  assert.equal(recapProgress(input("transferring",101*MiB,100*MiB)).transferPercent,100);
  assert.equal(recapProgress(input("transferring",-4,100*MiB)).transferPercent,null);
  assert.equal(recapProgress(input("transferring",400,null)).transferPercent,null);
  assert.equal(recapProgress(input("transferring",100,0)).transferPercent,null);
  assert.equal(recapProgress(input("pending_upload",0,100*MiB)).activeStep,0);
});

test("Gemini preparation and background generation are indeterminate, not artificial 75 or 95 percent",()=>{
  for(const [status,step] of [["uploaded",1],["submitting",2],["submitted",3]]){
    const view=recapProgress(input(status,100*MiB,100*MiB));
    assert.equal(view.activeStep,step,status);
    assert.equal(view.indeterminate,true,status);
    assert.equal(view.finished,false,status);
  }
  assert.equal(RECAP_PROGRESS_STEPS.length,4);
  const complete=recapProgress(input("ready",100*MiB,100*MiB));
  assert.equal(complete.finished,true);
  assert.equal(complete.activeStep,null);
  assert.equal(complete.transferPercent,100);
  assert.equal(complete.indeterminate,false);
});

test("error status pauses the bar and preserves original accepted byte count",()=>{
  const paused=recapProgress(input("needs_attention",35*MiB,100*MiB));
  assert.equal(paused.interrupted,true);
  assert.equal(paused.transferPercent,35);
  assert.equal(paused.activeStep,null);
  assert.equal(paused.indeterminate,false);
  assert.match(paused.detail,/not advancing/u);
  assert.equal(recapProgress(input("failed",0,100*MiB)).interrupted,true);
  assert.equal(formatRecapBytes(10*MiB),"10.0 MiB");
  assert.equal(formatRecapBytes(1024*MiB),"1.00 GiB");
});

test("the UI uses native accessible progress, no pretend ETA or overall percentage",async()=>{
  const [ui,container,css,route]=await Promise.all([
    read("app/campaigns/session-recap-progress.tsx"),
    read("app/campaigns/session-recap-auto-status.tsx"),
    read("app/campaigns/campaign-ui.css"),
    read("app/api/campaigns/[id]/session-recaps/auto-recap/route.ts"),
  ]);
  assert.match(ui,/<progress className="recap-ai-progress__meter" value=\{progressValue\} max=\{100\}/u);
  assert.match(ui,/aria-label=\{progressLabel\}/u);
  assert.match(ui,/aria-valuetext=/u);
  assert.match(ui,/progress\.indeterminate/u);
  assert.match(ui,/Step \{progress\.activeStep\+1\} of 4/u);
  assert.match(ui,/Gemini reports processing status, not a percentage or reliable time remaining/u);
  assert.match(ui,/background processing continues if you leave/u);
  assert.match(container,/<SessionRecapProgress job=\{newest\}\/>/u);
  assert.match(container,/window\.setInterval\(load,12000\)/u);
  assert.match(route,/stage_offset AS stageBytes/u);
  assert.match(route,/stage_error_code AS stageErrorCode/u);
  assert.doesNotMatch(ui,/Math\.random|estimatedPercent|setInterval|countdown|etaInSeconds/u);
  assert.match(css,/\.recap-ai-progress__meter/u);
  assert.match(css,/@media\(max-width:600px\)/u);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/u);
});
