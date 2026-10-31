import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { parsePcmWavHeader,pcmWavChunkHeader } from "../lib/campaigns/recap-wav-chunks.ts";
import { planGeminiSpeechWav,makeGeminiSpeechClip,GEMINI_STAGING_RATE } from "../lib/campaigns/recap-gemini-speech-wav.ts";
const read=path=>readFile(new URL(path,import.meta.url),"utf8");

test("5 voice, 3 hour Craig session plans 225 bounded, independently playable 4 minute clips",()=>{
  const source={channels:2,sampleRate:48000,bitsPerSample:16,blockAlign:4,
    dataOffset:44,dataBytes:48000*4*3*3600};
  const planned=planGeminiSpeechWav(source);
  assert.equal(planned.length,45);
  assert.equal(planned.length*5,225);
  assert.equal(planned[0].startMs,0);
  assert.equal(planned[0].endMs,4*60*1000);
  assert.equal(planned.at(-1).endMs,3*3600*1000);
  for(const part of planned){
    assert.ok(part.targetFrames*2+44<8*1024*1024);
    assert.ok(part.endMs-part.startMs<=240000);
    assert.ok(part.dataBytes<=48000*4*240);
  }
});
test("staged clips retain timestamps and validated audio bytes without decoding entire 2GB+ recording",()=>{
  const wav={channels:2,sampleRate:48000,bitsPerSample:16,blockAlign:4,dataOffset:44,
    dataBytes:48000*4*2};
  const bytes=new Uint8Array(44+wav.dataBytes);
  bytes.set(pcmWavChunkHeader(wav,wav.dataBytes));
  const dv=new DataView(bytes.buffer);
  for(let n=0;n<96000;n++){
    const raw=n<48000?15000:-15000;
    dv.setInt16(44+n*4,raw,true);
    dv.setInt16(44+n*4+2,raw,true);
  }
  const file=new File([bytes],"craig-voice.wav",{type:"audio/wav"});
  const plan=planGeminiSpeechWav(wav);
  assert.equal(plan.length,1);
  const result=await makeGeminiSpeechClip(file,wav,plan[0],0);
  assert.equal(result.type,"audio/wav");
  assert.equal(result.size,44+2*2*GEMINI_STAGING_RATE);
  const output=new Uint8Array(await result.arrayBuffer());
  const inspected=parsePcmWavHeader(output,result.size);
  assert.equal(inspected.sampleRate,16000);
  assert.equal(inspected.channels,1);
  assert.equal(inspected.bitsPerSample,16);
  const pcm=new DataView(output.buffer);
  assert.ok(pcm.getInt16(44,true)>13000);
  assert.ok(pcm.getInt16(44+24000*2,true)<-13000);
});
test("audio converter refuses malformed, oversize or inconsistent metadata",()=>{
  assert.throws(()=>planGeminiSpeechWav({
    channels:6,sampleRate:48000,bitsPerSample:16,blockAlign:12,dataOffset:44,dataBytes:100000,
  }));
  assert.throws(()=>planGeminiSpeechWav({
    channels:1,sampleRate:48000,bitsPerSample:16,blockAlign:2,dataOffset:44,
    dataBytes:48000*2*9*3600,
  }));
});
test("Drive staging remains GM-owned and only accepts truly completed private files",async()=>{
  const [staging,upload,uploadRoute,player,stream,chooser,ui]=await Promise.all([
    read("../app/api/campaigns/[id]/session-recaps/background-gemini/staging/route.ts"),
    read("../lib/campaigns/recap-drive-upload-service.ts"),
    read("../app/api/campaigns/[id]/session-recaps/audio/upload/start/route.ts"),
    read("../lib/campaigns/recap-audio-assets.ts"),
    read("../lib/campaigns/recap-drive-playback.ts"),
    read("../app/campaigns/session-recap-transcription-options.tsx"),
    read("../app/campaigns/session-recap-gemini-drive-staging.tsx"),
  ]);
  for(const phrase of ["canManageCampaignContent","job.requestedBy!==actor.userId",
    "getCampaignSessionRecap","recap-track-speakers/","WHERE id=? AND campaign_id=? AND recap_id=? AND processing_job_id=?",
    "storage_owner_user_id=? AND status='ready'","asset.byteSize>GEMINI_BACKGROUND_MAX_CLIP_BYTES",
    "asset.mimeType!==\"audio/wav\"","drive_asset_id IS NULL","source_digest=?",
    "confirmed.includes(row.trackIndex)","stats.total!==stats.linked",
    "status='queued'","backgroundEnabled:false"]){
    assert.ok(staging.includes(phrase),"Missing staging guard: "+phrase);
  }
  assert.match(upload,/processingJobId/u);
  assert.match(upload,/status='awaiting_source' AND paused_at IS NULL/u);
  assert.match(uploadRoute,/processingJobId\?:unknown/u);
  assert.match(player,/a.processing_job_id IS NULL/u);
  assert.match(stream,/a.processing_job_id IS NULL/u);
  assert.match(chooser,/SessionRecapGeminiStaging/u);
  assert.match(ui,/makeGeminiSpeechClip/u);
  assert.match(ui,/uploadRecordingToDrive/u);
  assert.match(ui,/if\(existing\[i\]\.staged\)/u);
  assert.match(ui,/processingJobId:job.id/u);
  assert.match(ui,/stopRequested.current/u);
  assert.doesNotMatch(staging,/generativelanguage\.googleapis\.com|decryptGeminiUserKey|fetch\(/u);
});
test("staged audio is always in the GM's Drive, never owner-funded R2",async()=>{
  const [sql,service]=await Promise.all([
    read("../drizzle/0042_recap_gemini_drive_staging.sql"),
    read("../lib/campaigns/recap-drive-upload-service.ts"),
  ]);
  assert.match(sql,/ADD COLUMN processing_job_id/u);
  assert.match(sql,/ADD COLUMN drive_asset_id/u);
  assert.doesNotMatch(sql,/DROP TABLE|DELETE FROM/u);
  assert.match(service,/getGmDriveAccessToken/u);
  assert.doesNotMatch(service,/BUCKET\.put\(/u);
});
