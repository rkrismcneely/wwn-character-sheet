import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { validateAudioClipOptions,normalizeGroqAudioSegments,mergeGroqAudioTranscript,
  GROQ_AUDIO_MODELS,MAX_GROQ_AUDIO_BYTES } from "../lib/campaigns/recap-groq-audio.ts";

const receipt="a".repeat(64);
const speaker={rawSpeaker:"Craig User",speakerName:"Player A",role:"player",characterName:"Sir Oak"};
const clip={model:GROQ_AUDIO_MODELS[0],startMs:9_000_000,durationMs:5*60_000,
  filename:"craig-flac.flac",byteSize:MAX_GROQ_AUDIO_BYTES-1};
test("Groq clip input checks supported models, sizes and actual session positioning",()=>{
  assert.deepEqual(validateAudioClipOptions(clip),clip);
  assert.throws(()=>validateAudioClipOptions({...clip,model:"unknown"}));
  assert.throws(()=>validateAudioClipOptions({...clip,byteSize:MAX_GROQ_AUDIO_BYTES+1}));
  assert.throws(()=>validateAudioClipOptions({...clip,startMs:8*60*60*1000}));
  assert.throws(()=>validateAudioClipOptions({...clip,durationMs:31*60_000}));
  assert.throws(()=>validateAudioClipOptions({...clip,filename:"../../bad.flac"}));
});
test("Whisper timestamps become precise session-relative speech, not guessed text timing",()=>{
  const segments=normalizeGroqAudioSegments([
    {start:3.25,end:7.5,text:"We cross the bridge."},
    {start:8,end:11,text:"I search the room."},
  ],9_000_000,60_000);
  assert.deepEqual(segments.map(s=>s.startMs),[9_003_250,9_008_000]);
  assert.deepEqual(segments.map(s=>s.endMs),[9_007_500,9_011_000]);
  assert.throws(()=>normalizeGroqAudioSegments([{start:-1,end:2,text:"bad"}],0,60_000));
  assert.throws(()=>normalizeGroqAudioSegments([{start:50,end:80,text:"over"}],0,60_000));
  assert.throws(()=>normalizeGroqAudioSegments([{start:1,end:2,text:""}],0,60_000));
  assert.throws(()=>normalizeGroqAudioSegments([],0,60_000));
});
test("transcription persists one speaker snapshot, sorts clips and prevents duplicate retries",()=>{
  const first=mergeGroqAudioTranscript(null,[
    {startMs:50_000,endMs:55_000,rawSpeaker:"",text:"Later speech."},
  ],speaker,receipt,"2026-10-30T12:00:00Z");
  assert.equal(first.transcript.published,false);
  assert.equal(first.transcript.cues[0].characterName,"Sir Oak");
  const again=mergeGroqAudioTranscript(first.transcript,[
    {startMs:50_000,endMs:55_000,rawSpeaker:"",text:"Later speech."},
  ],speaker,receipt,"2026-10-30T12:01:00Z");
  assert.equal(again.duplicate,true);
  assert.equal(again.transcript.cues.length,1);
  const earlier=mergeGroqAudioTranscript(first.transcript,[
    {startMs:0,endMs:3000,rawSpeaker:"",text:"Earlier speech."},
  ],speaker,"b".repeat(64),"2026-10-30T12:02:00Z");
  assert.deepEqual(earlier.transcript.cues.map(c=>c.text),["Earlier speech.","Later speech."]);
  assert.deepEqual(earlier.transcript.processedClips,[receipt,"b".repeat(64)]);
});
test("verified silence can be recorded once without fabricating dialogue or retrying charges",()=>{
 const silence=mergeGroqAudioTranscript(null,[],speaker,receipt,"now");
 assert.equal(silence.transcript.cues.length,0);
 assert.deepEqual(silence.transcript.processedClips,[receipt]);
 assert.equal(mergeGroqAudioTranscript(silence.transcript,[],speaker,receipt,"later").duplicate,true);
});
test("re-import returns transcript to private draft, preserving other sessions",()=>{
  const source={version:1,published:true,updatedAt:"old",cues:[],processedClips:[]};
  const added=mergeGroqAudioTranscript(source,[
    {startMs:0,endMs:1000,rawSpeaker:"",text:"Private text."},
  ],speaker,receipt,"new");
  assert.equal(added.transcript.published,false);
  assert.equal(source.published,true);
});
test("route requires a campaign GM, own key, full timestamp validation and conditional R2 write",async()=>{
  const route=await readFile(new URL("../app/api/campaigns/[id]/session-recaps/transcript/transcribe/route.ts",import.meta.url),"utf8");
  for(const required of [
    "getSessionActor(request)","loadCampaignAccess(db,actor,id)","canManageCampaignContent",
    "getCampaignSessionRecap(db,actor,id,recapId)","campaign_recap_speakers WHERE campaign_id=? AND id=?",
    'approvedShare','approvedBilling','request.formData()','crypto.subtle.digest("SHA-256",fileBytes)',
    'api.groq.com/openai/v1/audio/transcriptions','timestamp_granularities[]','verbose_json',
    "normalizeGroqAudioSegments","mergeGroqAudioTranscript","previousTranscript(key)",
    "responseData.segments.length===0",
    "onlyIf",'"If-None-Match"','etagMatches',
  ])assert.ok(route.includes(required),"Missing safety invariant: "+required);
  assert.doesNotMatch(route,/RECAP_FREE_AI_QUOTA_VERIFIED|CLOUDFLARE_AI_KEY|process\.env\.GROQ_API_KEY/u);
  assert.doesNotMatch(route,/console\.log\(|BUCKET\.put\(.*apiKey/u);
});
test("transcription UI is opt-in, labels one voice per clip, refreshes stored transcript",async()=>{
  const [ui,manager]=await Promise.all([
    readFile(new URL("../app/campaigns/session-recap-groq-transcriber.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/campaigns/session-recap-manager.tsx",import.meta.url),"utf8"),
  ]);
  assert.match(ui,/type="password" autoComplete="off"/u);
  assert.match(ui,/agreeShare&&agreeBilling/u.test(ui) ? /agreeShare&&agreeBilling/u : /!agreeShare\|\|!agreeBilling/u);
  assert.match(ui,/speakerId/u);
  assert.match(ui,/HH:MM:SS/u);
  assert.match(ui,/Transcribe and save private draft/u);
  assert.doesNotMatch(ui,/localStorage|sessionStorage/u);
  assert.match(manager,/SessionRecapGroqTranscriber/u);
  assert.match(manager,/setTranscriptRefresh\(n=>n\+1\)/u);
});
