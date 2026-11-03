import {test} from "node:test";
import assert from "node:assert/strict";
import {emptyRecapWorkflow,transitionRecapWorkflow,validatePreparationParts,
  recapWorkflowObjectKey} from "../lib/campaigns/recap-stage-workflow.ts";
const timestamp="2026-11-03T16:00:00.000Z";
const source={kind:"browser",id:"local_1",name:"Three Hour Session.m4a",
  bytes:20_000_000,mimeType:"audio/mp4"};
const parts=[{name:"session-part-001.m4a",bytes:1_000_000,mimeType:"audio/mp4",
  startMs:0,durationMs:120000,localKey:"prepared_1"}];
const evidence={sourceReady:true,transcriptRevision:null};
function stageOne(){
  const initial=emptyRecapWorkflow(timestamp);
  const approved=transitionRecapWorkflow(initial,{action:"approve-source",source},
    evidence,timestamp);
  return approved;
}
test("recap workflow requires actual verified saved recording",()=>{
  assert.throws(()=>transitionRecapWorkflow(emptyRecapWorkflow(timestamp),
    {action:"approve-source",source},{sourceReady:false,transcriptRevision:null},timestamp),
  /Verify the saved recording/);
  const approved=stageOne();
  assert.equal(approved.revision,1);
  assert.equal(approved.source?.id,source.id);
  assert.ok(approved.sourceApprovedAt);
});
test("provider selection and conversion never start or approve transcription",()=>{
  const prepared=transitionRecapWorkflow(stageOne(),
    {action:"save-preparation",provider:"groq",method:"ffmpeg",parts},evidence,timestamp);
  assert.equal(prepared.preparation?.provider,"groq");
  assert.equal(prepared.transcriptApprovedAt,null);
  assert.throws(()=>transitionRecapWorkflow(prepared,{action:"approve-transcript"},
    evidence,timestamp),/saved timestamped transcript/);
  const reviewed=transitionRecapWorkflow(prepared,{action:"approve-transcript"},
    {sourceReady:true,transcriptRevision:"t1"},timestamp);
  assert.equal(reviewed.transcriptApprovedRevision,"t1");
  assert.equal(reviewed.preparation?.transcriptBefore,null);
});
test("changing provider invalidates approval but never silently removes prior draft versions",()=>{
  const ready=transitionRecapWorkflow(stageOne(),
    {action:"save-preparation",provider:"groq",method:"ffmpeg",parts},evidence,timestamp);
  const reviewed=transitionRecapWorkflow(ready,{action:"approve-transcript"},
    {sourceReady:true,transcriptRevision:"v1"},timestamp);
  const selected=transitionRecapWorkflow(reviewed,
    {action:"select-writer",provider:"gemini",model:"gemini-3.8-flash",detail:"detailed"},
    {sourceReady:true,transcriptRevision:"v1"},timestamp);
  const content="## Scene\n\nThe adventurers negotiated an uneasy truce.";
  const saved=transitionRecapWorkflow(selected,{action:"save-draft",content},
    {sourceReady:true,transcriptRevision:"v1",draft:{
      id:"aaaabbbb-1111-2222-3333-555555555555",key:"saved-draft"
    }},timestamp);
  assert.equal(saved.drafts.length,1);
  const approved=transitionRecapWorkflow(saved,
    {action:"approve-draft",draftId:saved.drafts[0].id},
    {sourceReady:true,transcriptRevision:"v1"},timestamp);
  assert.equal(approved.approvedDraftId,saved.drafts[0].id);
  const switched=transitionRecapWorkflow(approved,
    {action:"save-preparation",provider:"local-whisper",method:"ffmpeg",parts:[
      {name:"part.wav",bytes:12000,mimeType:"audio/wav",startMs:0,durationMs:1000,localKey:"local"}
    ]},{sourceReady:true,transcriptRevision:"v1"},timestamp);
  assert.equal(switched.transcriptApprovedRevision,null);
  assert.equal(switched.writer,null);
  assert.equal(switched.approvedDraftId,null);
  assert.equal(switched.drafts.length,1);
});
test("audio preparation protects provider size, timeline and file identity",()=>{
  assert.throws(()=>validatePreparationParts("groq",[
    {...parts[0],bytes:30*1024*1024}]),/16 MiB/);
  assert.throws(()=>validatePreparationParts("groq",[
    parts[0],{...parts[0],startMs:500,durationMs:1000}]),/overlap/);
  assert.throws(()=>validatePreparationParts("local-whisper",parts),/PCM WAV/);
  assert.throws(()=>recapWorkflowObjectKey("../../etc","not-a-uuid"),/Invalid/);
});
test("new recording invalidates only downstream approval and preserves older drafts",()=>{
  const one=stageOne();
  const two=transitionRecapWorkflow(one,
    {action:"save-preparation",provider:"groq",method:"original",parts},evidence,timestamp);
  const changed=transitionRecapWorkflow(two,{action:"approve-source",
    source:{...source,id:"new_original",name:"Replacement.m4a"}},evidence,timestamp);
  assert.equal(changed.preparation,null);
  assert.equal(changed.transcriptApprovedAt,null);
  assert.equal(changed.approvedDraftId,null);
});

test("existing caption files can be imported without uploading audio",()=>{
  const initial=emptyRecapWorkflow(timestamp);
  const prepared=transitionRecapWorkflow(initial,{
    action:"save-preparation",provider:"import",method:"import",
    parts:[{name:"transcript-import.wav",bytes:128,mimeType:"audio/wav",
      startMs:0,durationMs:1000,localKey:null}],
  },{sourceReady:false,transcriptRevision:null},timestamp);
  assert.equal(prepared.source,null);
  assert.equal(prepared.preparation?.provider,"import");
  assert.throws(()=>transitionRecapWorkflow(initial,{
    action:"save-preparation",provider:"groq",method:"ffmpeg",parts,
  },{sourceReady:false,transcriptRevision:null},timestamp),/Approve a recording/);
  const approved=transitionRecapWorkflow(prepared,{action:"approve-transcript"},
    {sourceReady:false,transcriptRevision:"imported-captions"},timestamp);
  assert.equal(approved.transcriptApprovedRevision,"imported-captions");
});
