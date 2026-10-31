import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { transcriptionChoices,canStartTranscription } from "../lib/campaigns/recap-transcription-options.ts";
import { geminiWordTime,normalizeGeminiWords,supportedGeminiAudio } from "../lib/campaigns/recap-gemini-transcribe.ts";
const read=path=>readFile(new URL(path,import.meta.url),"utf8");

test("GM sees truthful comparison of three providers and no owner-funded AI",()=>{
  assert.deepEqual(transcriptionChoices.map(x=>x.id),["groq","gemini","local-whisper"]);
  for(const option of transcriptionChoices) {
    assert.ok(option.benefits.length>=2);
    assert.ok(option.limitations.length>=2);
    assert.equal(option.ownerPays,false);
  }
  assert.equal(canStartTranscription("gemini"),true);
  assert.equal(canStartTranscription("local-whisper"),true);
  assert.equal(transcriptionChoices.find(x=>x.id==="gemini").requiresOpenBrowser,true);
  assert.match(transcriptionChoices.find(x=>x.id==="gemini").limitations.join(" "),/browser open/);
  assert.equal(transcriptionChoices.find(x=>x.id==="local-whisper").availability,"experimental");
});
test("Gemini word offsets become verified session-relative caption cues",()=>{
  assert.equal(geminiWordTime("3.250s"),3250);
  assert.throws(()=>geminiWordTime("3:20"));
  const data={status:"completed",steps:[{type:"model_output",content:[{
    type:"text",annotations:[
      {type:"word_info",text:"We",start_offset:"1.100s",end_offset:"1.400s"},
      {type:"word_info",text:"attack.",start_offset:"1.410s",end_offset:"1.900s"},
      {type:"word_info",text:"Retreat!",start_offset:"6.000s",end_offset:"6.500s"},
    ],
  }]}]};
  const segments=normalizeGeminiWords(data,90_000,30_000);
  assert.equal(segments.length,2);
  assert.deepEqual(segments.map(cue=>cue.text),["We attack.","Retreat!"]);
  assert.deepEqual(segments.map(cue=>cue.startMs),[91_100,96_000]);
  assert.throws(()=>normalizeGeminiWords({...data,status:"in_progress"},0,30_000));
  assert.throws(()=>normalizeGeminiWords({status:"completed",steps:[]},0,30_000));
  assert.throws(()=>normalizeGeminiWords({status:"completed",steps:[
    {type:"model_output",content:[{type:"text",annotations:[
      {type:"word_info",text:"bad",start_offset:"31.00s",end_offset:"32.00s"}]}]}]},0,30_000));
});
test("Gemini only uses declared audio MIME types",()=>{
  assert.equal(supportedGeminiAudio("player.FLAC"),"audio/flac");
  assert.equal(supportedGeminiAudio("player.aac"),"audio/aac");
  assert.equal(supportedGeminiAudio("player.wav"),"audio/wav");
  assert.throws(()=>supportedGeminiAudio("player.exe"));
});
test("Gemini server verifies GM and personal consent and never persists API keys",async()=>{
  const code=await read("../app/api/campaigns/[id]/session-recaps/transcript/gemini/route.ts");
  for(const needle of ["getSessionActor","canManageCampaignContent","getCampaignSessionRecap",
    "approvedShare","approvedBilling","apiKey","timestamp_granularities",
    "upload/v1beta/files","generativelanguage.googleapis.com/v1beta/interactions",
    "mergeGroqAudioTranscript","processedClips","onlyIf","private, no-store"]) {
      // processedClips appears in duplicate-check only; transcript helper persists receipts
      assert.ok(code.includes(needle),"Missing security or checkpoint requirement: "+needle);
  }
  assert.doesNotMatch(code,/process\.env\.GOOGLE_API_KEY|BUCKET\.put\(.*apiKey|console\.log/u);
});
test("local Whisper stores completed chunks and verifies GM-only checkpoint receipts",async()=>{
  const [client,endpoint,selector,manager]=await Promise.all([
    read("../app/campaigns/session-recap-local-whisper.tsx"),
    read("../app/api/campaigns/[id]/session-recaps/transcript/local/route.ts"),
    read("../app/campaigns/session-recap-transcription-options.tsx"),
    read("../app/campaigns/session-recap-manager.tsx"),
  ]);
  assert.match(client,/loadLocalWhisper/u);
  assert.match(client,/onnx-community\/whisper-tiny\.en/u);
  assert.match(client,/transcribe\(samples/u);
  assert.match(client,/checksum\(slice/u);
  assert.match(client,/checked\.complete/u);
  assert.match(client,/buildPcmWavUpload/u);
  assert.match(client,/Completed chunks remain saved/u);
  assert.doesNotMatch(client,/sessionStorage|apiKey/u);
  assert.match(client,/readRememberedLocalRecapFile/u);
  assert.match(client,/rememberLocalRecapFile/u);
  assert.match(client,/queryPermission/u);
  assert.match(endpoint,/canManageCampaignContent/u);
  assert.match(endpoint,/processedClips/u);
  assert.match(endpoint,/onlyIf/u);
  assert.match(endpoint,/validateRecapCaptionCues/u);
  assert.match(selector,/SessionRecapLocalWhisper/u);
  assert.match(selector,/SessionRecapGroqTranscriber/u);
  assert.match(manager,/SessionRecapTranscriptionOptions/u);
});
test("existing GM transcript refresh remains wired after provider selection",async()=>{
  const code=await read("../app/campaigns/session-recap-manager.tsx");
  assert.match(code,/onSaved=\{\(\)=>setTranscriptRefresh\(n=>n\+1\)\}/u);
  assert.match(code,/SessionRecapFullTranscriptManager/u);
  const cloud=await read("../app/campaigns/session-recap-groq-transcriber.tsx");
  assert.match(cloud,/gemini\?"\/session-recaps\/transcript\/gemini":/u);
  assert.match(cloud,/provider\?:"groq"\|"gemini"/u);
});
