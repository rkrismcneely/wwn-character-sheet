import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { parseFullCraigCaptions } from "../lib/campaigns/recap-full-caption-import.ts";
import { normalizeCaptionAssignments, recapTranscriptObjectKey, validateRecapCaptionCues } from
  "../lib/campaigns/recap-full-transcript.ts";
const read=path=>readFile(new URL(path,import.meta.url),"utf8");

test("full Craig WebVTT import preserves hours, voices and original timing",()=>{
  const cues=parseFullCraigCaptions("WEBVTT\n\n03:12:04.125 --> 03:12:07.500\n<v First Player>Hello there.</v>\n\n03:12:10.000 --> 03:12:13.000\nGM: A dragon appears.","craig.vtt");
  assert.deepEqual(cues.map(c=>c.startMs),[11_524_125,11_530_000]);
  assert.deepEqual(cues.map(c=>c.rawSpeaker),["First Player","GM"]);
  assert.equal(cues[0].text,"Hello there.");
});
test("full SRT import supports unlabeled guests and large subtitle collections",()=>{
  const entries=Array.from({length:2000},(_,i)=>{
    const min=String(Math.floor(i/60)).padStart(2,"0");
    const sec=String(i%60).padStart(2,"0");
    return (i+1)+"\n00:"+min+":"+sec+",000 --> 00:"+min+":"+sec+",500\nA message";
  }).join("\n\n");
  const cues=parseFullCraigCaptions(entries,"craig.srt");
  assert.equal(cues.length,2000);
  assert.equal(cues[1999].rawSpeaker,"Unassigned");
  assert.equal(cues[1999].startMs,1_999_000);
});
test("caption validation fails rather than silently truncating or accepting impossible time",()=>{
  const valid={startMs:0,endMs:1000,rawSpeaker:"GM",text:"Hello"};
  assert.throws(()=>validateRecapCaptionCues([{...valid,endMs:9*60*60*1000}]));
  assert.throws(()=>validateRecapCaptionCues(Array.from({length:10001},()=>valid)));
  assert.throws(()=>validateRecapCaptionCues([{...valid,text:"x".repeat(1501)}]));
  assert.throws(()=>parseFullCraigCaptions("hello","unknown.txt"));
});
test("campaign association confirmation is required for each unique speaker",()=>{
  assert.deepEqual({...normalizeCaptionAssignments({"GM":"123e4567-e89b-12d3-a456-426614174000","Guest":null},["GM","Guest"])},
    {GM:"123e4567-e89b-12d3-a456-426614174000",Guest:null});
  assert.throws(()=>normalizeCaptionAssignments({"GM":null},["GM","Player"]));
  assert.throws(()=>normalizeCaptionAssignments({"GM":"not-an-id"},["GM"]));
  assert.equal(recapTranscriptObjectKey("cmp_ABCDEFGHIJKLMNOPQRSTUV","123e4567-e89b-12d3-a456-426614174000"),
    "recap-transcripts/cmp_ABCDEFGHIJKLMNOPQRSTUV/123e4567-e89b-12d3-a456-426614174000.json");
});
test("private storage always checks campaign+recap access and requires GM review before publishing",async()=>{
  const route=await read("../app/api/campaigns/[id]/session-recaps/transcript/route.ts");
  assert.match(route,/getSessionActor\(request\)/u);
  assert.match(route,/loadCampaignAccess\(db,actor,id\)/u);
  assert.match(route,/getCampaignSessionRecap\(db,actor,id,recapId\)/u);
  assert.match(route,/canManageCampaignContent/u);
  assert.match(route,/\(!item\.published&&!gm\)/u);
  assert.match(route,/published:false/u);
  assert.match(route,/body\.published && body\.reviewed!==true/u);
  assert.match(route,/campaign_id=\?/u);
  assert.match(route,/cache-control.*no-store/u);
  assert.doesNotMatch(route,/remote_file_id|refresh_token|GOOGLE_DRIVE_CLIENT_SECRET/u);
});
test("GM import, independent full transcript and paginated player are connected",async()=>{
  const [manager,editor,player]=await Promise.all([
    read("../app/campaigns/session-recap-full-transcript-manager.tsx"),
    read("../app/campaigns/session-recap-manager.tsx"),
    read("../app/campaigns/session-recap-audio-player.tsx"),
  ]);
  assert.match(editor,/SessionRecapFullTranscriptManager/u);
  assert.match(manager,/parseFullCraigCaptions\(await file\.text\(\),file\.name\)/u);
  assert.match(manager,/Confirm each speaker before saving/u);
  assert.match(manager,/Save private transcript draft/u);
  assert.match(manager,/I have reviewed the speaker assignments/u);
  assert.match(player,/session-recaps\/transcript\?recapId=/u);
  assert.match(player,/matchingCues\.slice\(transcriptPage\*100,transcriptPage\*100\+100\)/u);
  assert.match(player,/cue\.characterName/u);
  assert.match(player,/selected\?\.offsetMs/u);
});
