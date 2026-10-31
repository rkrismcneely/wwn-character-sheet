import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {
  completedRecapDriveFileQuery,completedRecapDriveFile,
} from "../lib/campaigns/recap-drive-recovery.ts";

const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
const expected={
  assetId:"a4e90cef-6cf4-4d99-a6a4-cc3c3533d101",
  campaignId:"de62cf6b-a62e-44bb-ad8b-50b8d2473df7",
  byteSize:3145728,mimeType:"audio/mp4",
};
const file={
  id:"google_uploaded_recording_12345",
  size:"3145728",mimeType:"audio/mp4",trashed:false,
  appProperties:{tweAudioAssetId:expected.assetId,tweCampaignId:expected.campaignId},
};
test("Google's appProperties search finds only the original TWE upload",()=>{
  const query=completedRecapDriveFileQuery(expected.assetId,expected.campaignId);
  assert.match(query,/trashed = false/u);
  assert.match(query,/appProperties has \{ key='tweAudioAssetId' and value='/u);
  assert.match(query,/appProperties has \{ key='tweCampaignId' and value='/u);
  assert.ok(query.includes(expected.assetId)&&query.includes(expected.campaignId));
  assert.throws(()=>completedRecapDriveFileQuery("x' or trashed = true",expected.campaignId),/Invalid/u);
  assert.throws(()=>completedRecapDriveFileQuery(expected.assetId,"campaign' or 1=1"),/Invalid/u);
});
test("existing complete Drive file can be recovered without transferring bytes",()=>{
  assert.equal(completedRecapDriveFile({files:[file]},expected),file.id);
  assert.equal(completedRecapDriveFile({files:[]},expected),null);
  assert.equal(completedRecapDriveFile({files:[],incompleteSearch:false},expected),null);
});
test("recovery fails closed for duplicates, incomplete search or mismatched Google metadata",()=>{
  for(const response of [
    null,{}, {files:[file,file]}, {files:[file],nextPageToken:"more"},
    {files:[file],incompleteSearch:true}, {files:"not an array"},
    {files:[{...file,id:"bad"}]},
    {files:[{...file,size:"3145727"}]},
    {files:[{...file,mimeType:"audio/wav"}]},
    {files:[{...file,trashed:true}]},
    {files:[{...file,appProperties:{...file.appProperties,tweAudioAssetId:"another-user"}}]},
    {files:[{...file,appProperties:{...file.appProperties,tweCampaignId:"other-campaign"}}]},
  ])assert.throws(()=>completedRecapDriveFile(response,expected),Error);
});
test("recovery route requires signed-in GM, same-origin request and a recap asset ID",async()=>{
  const [route,service,ui,list]=await Promise.all([
    read("app/api/campaigns/[id]/session-recaps/audio/upload/recover/route.ts"),
    read("lib/campaigns/recap-drive-upload-service.ts"),
    read("app/campaigns/session-recap-audio-uploader.tsx"),
    read("lib/campaigns/recap-audio-assets.ts"),
  ]);
  assert.match(route,/request\.headers\.get\("origin"\)!==CANONICAL_ORIGIN/u);
  assert.match(route,/getSessionActor\(request\)/u);
  assert.match(route,/readBoundedJson\(request,1024\)/u);
  assert.match(route,/export async function POST/u);
  assert.doesNotMatch(route,/export async function GET|access_token|refresh_token|console\.log/u);
  assert.match(service,/recoverGmDriveAudioUpload/u);
  assert.match(service,/getCampaignSessionRecap\(db,actor,campaign\.id,input\.recapId\)/u);
  assert.match(service,/storage_owner_user_id=\? /u);
  assert.match(service,/processing_job_id IS NULL/u);
  assert.match(service,/status!=="preparing"/u);
  assert.match(service,/completedRecapDriveFile\(results/u);
  assert.match(service,/finishGmDriveAudioUpload\(db,actor,campaign\.id/u);
  assert.match(service,/spaces:"drive"/u);
  assert.match(ui,/found\.filter\(a=>a\.canRecover\)/u);
  assert.match(ui,/Find saved recording/u);
  assert.match(ui,/base\+"\/upload\/recover"/u);
  assert.match(list,/canRecover: canManage && row\.storageOwnerUserId === actor\.userId && row\.status === "preparing"/u);
  // No user-chosen file ID, no new audio transfer, no AI invocation.
  assert.doesNotMatch(route,/remoteFileId|arrayBuffer\(|uploadRecordingToDrive|Gemini/u);
  const recover=service.slice(service.indexOf("export async function recoverGmDriveAudioUpload"));
  assert.doesNotMatch(recover,/body:media\.body|arrayBuffer\(|BUCKET\.put|enqueueConfirmedRecapAudio/u);
});
