import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { describeAudioUploadFile, uploadPercent, formatAudioUploadSize } from "../lib/campaigns/recap-audio-upload-ui.ts";

test("GM upload picker accepts large three-hour audio recordings without reading whole files",()=>{
  const bytes=720*1024*1024;
  for(const [name,type] of [["session.MP3","audio/mpeg"],["recording.m4a","audio/mp4"],
    ["session.wav","audio/wav"],["craig-track.flac","audio/flac"],["speaker.aac","audio/aac"]]){
    const draft=describeAudioUploadFile({name,size:bytes});
    assert.equal(draft.mimeType,type);
    assert.equal(draft.byteSize,bytes);
    assert.equal(draft.durationMs,null);
  }
  assert.equal(formatAudioUploadSize(bytes),"720.0 MB");
  assert.equal(uploadPercent(bytes/4,bytes),25);
  assert.equal(uploadPercent(bytes,bytes),100);
  assert.equal(uploadPercent(-100,bytes),0);
  assert.equal(uploadPercent(2*bytes,bytes),100);
  assert.equal(uploadPercent(10,0),0);
});
test("invalid extensions, huge recordings and untrusted filenames are rejected",()=>{
  assert.throws(()=>describeAudioUploadFile({name:"bad.exe",size:100}),/MP3/);
  assert.throws(()=>describeAudioUploadFile({name:"session/../../rec.m4a",size:100}),/filename/);
  assert.throws(()=>describeAudioUploadFile({name:"too-big.m4a",size:5*1024**3}),/size/);
  assert.throws(()=>describeAudioUploadFile({name:"empty.mp3",size:0}),/size/);
});
test("existing GM recap editor hosts independent direct Drive uploader",async()=>{
  const read=path=>readFile(new URL(path,import.meta.url),"utf8");
  const [manager,ui,browser]=await Promise.all([
    read("../app/campaigns/session-recap-manager.tsx"),
    read("../app/campaigns/session-recap-audio-uploader.tsx"),
    read("../lib/campaigns/recap-drive-upload-browser.ts"),
  ]);
  assert.match(manager,/editing !== "new" && <SessionRecapAudioUploader/u);
  assert.match(ui,/fetch\("\/api\/account\/storage\/google-drive"/u);
  assert.match(ui,/uploadRecordingToDrive\(file,session\.uploadSessionUrl/u);
  assert.match(ui,/base\+"\/upload\/start"/u);
  assert.match(ui,/base\+"\/upload\/finish"/u);
  assert.match(ui,/setAwaitingVerification\(uploaded\)/u);
  assert.match(ui,/Retry verification/u);
  assert.match(ui,/controller\.current\?\.abort\(\)/u);
  assert.match(ui,/<progress max=\{100\}/u);
  assert.match(ui,/Keep this page open while uploading/u);
  assert.match(ui,/Manage storage accounts/u);
  assert.doesNotMatch(ui,/RECAP_STORAGE_ENCRYPTION_KEY|GOOGLE_DRIVE_CLIENT_SECRET|fetch\("https:\/\/oauth2.googleapis.com\/token/u);
  assert.match(browser,/body: file\.slice\(next\.start, next\.endExclusive\)/u);
});
