import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {issueDriveUploadTicket,verifyDriveUploadTicket,parseDriveRelayRange,
  DRIVE_RELAY_MAX_CHUNK_BYTES} from "../lib/campaigns/recap-drive-upload-relay.ts";
import {uploadRecordingToDrive} from "../lib/campaigns/recap-drive-upload-browser.ts";

const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
const KiB=1024;
const MiB=1024*KiB;
const url="https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=own-private-session-1234";
const settings={RECAP_STORAGE_ENCRYPTION_KEY:Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url")};
const ticketProps={userId:"gm-a",campaignId:"cmp_123",assetId:"a4e90cef-6cf4-4d99-a6a4-cc3c3533d101",
  uploadSessionUrl:url,issuedAt:Date.now()};
test("HMAC relay capability is scoped to GM, campaign, asset, Google upload URL and time",async()=>{
  const ticket=await issueDriveUploadTicket(settings,ticketProps);
  assert.match(ticket,/^[A-Za-z0-9_-]{43}$/u);
  assert.equal(await verifyDriveUploadTicket(settings,ticketProps,ticket),true);
  for(const edited of [
    {userId:"gm-b"},{campaignId:"cmp_other"},{assetId:"a4e90cef-6cf4-4d99-a6a4-cc3c3533d102"},
    {uploadSessionUrl:url.replace("1234","5678")},{issuedAt:ticketProps.issuedAt+1},
  ])assert.equal(await verifyDriveUploadTicket(settings,{...ticketProps,...edited},ticket),false);
  assert.equal(await verifyDriveUploadTicket(settings,ticketProps,ticket,ticketProps.issuedAt+25*3600*1000),false);
  assert.equal(await verifyDriveUploadTicket(settings,{...ticketProps,issuedAt:Date.now()+180000},ticket),false);
  assert.equal(await verifyDriveUploadTicket(settings,{...ticketProps,uploadSessionUrl:"https://evil.example/upload"},ticket),false);
  assert.doesNotMatch(ticket,/upload_id|own-private-session/u);
});
test("relay rejects oversized, mismatched, nonaligned, or probing bodies before forwarding",()=>{
  assert.deepEqual(parseDriveRelayRange("bytes 0-1048575/2097152",2*MiB),
    {kind:"chunk",total:2*MiB,length:MiB});
  assert.deepEqual(parseDriveRelayRange("bytes */2097152",2*MiB),
    {kind:"probe",total:2*MiB,length:0});
  for(const [range,total] of [
    ["bytes 0-1048575/2097152",MiB],["bytes 0-1048576/2097152",2*MiB],
    ["bytes 1-1048576/2097152",2*MiB],
    ["bytes 0-8388608/10485760",10*MiB],["bytes */999",2*MiB],
    ["bytes -2-5/2097152",2*MiB],
  ])assert.equal(parseDriveRelayRange(range,total),null);
  assert.equal(DRIVE_RELAY_MAX_CHUNK_BYTES,8*MiB);
});
test("browser sends real audio chunks to same-origin TWE endpoint, never directly to Google",async()=>{
  const audio=new Blob([new Uint8Array(2*MiB+10)],{type:"audio/mp4"});
  const sent=[];
  const relay={endpoint:"/api/campaigns/cmp_123/session-recaps/audio/upload/relay",
    assetId:ticketProps.assetId,ticket:"signed-opaque-credential",issuedAt:ticketProps.issuedAt};
  const fakeFetch=async(target,options)=>{
    assert.equal(target,relay.endpoint+"?assetId="+relay.assetId);
    assert.equal(options.credentials,"same-origin");
    assert.equal(options.headers["x-twe-drive-upload-session"],url);
    assert.equal(options.headers["x-twe-drive-upload-ticket"],relay.ticket);
    const range=options.headers["Content-Range"];
    sent.push(range);
    if(sent.length<3){
      const match=/^bytes (\d+)-(\d+)\/(\d+)$/u.exec(range);
      return new Response(null,{status:308,headers:{range:"bytes=0-"+match[2]}});
    }
    return Response.json({id:"file_own_drive_123456",size:String(audio.size)});
  };
  const result=await uploadRecordingToDrive(audio,url,()=>{},{
    relay,fetcher:fakeFetch,chunkBytes:MiB});
  assert.equal(result.id,"file_own_drive_123456");
  assert.deepEqual(sent,[
    "bytes 0-1048575/"+audio.size,
    "bytes 1048576-2097151/"+audio.size,
    "bytes 2097152-2097161/"+audio.size,
  ]);
});
test("lost relay response probes same-origin and resumes accepted range",async()=>{
  const audio=new Blob([new Uint8Array(2*MiB)]);
  const ranges=[];
  const relay={endpoint:"/api/test/relay",assetId:ticketProps.assetId,ticket:"opaque",issuedAt:ticketProps.issuedAt};
  const fetcher=async(_target,options)=>{
    ranges.push(options.headers["Content-Range"]);
    if(ranges.length===1)throw new TypeError("Failed to fetch");
    if(ranges.length===2)return new Response(null,{status:308,headers:{range:"bytes=0-1048575"}});
    return Response.json({id:"file_own_drive_123456"});
  };
  assert.equal((await uploadRecordingToDrive(audio,url,()=>{},
    {relay,fetcher,chunkBytes:MiB})).id,"file_own_drive_123456");
  assert.deepEqual(ranges,["bytes 0-1048575/"+audio.size,
    "bytes */"+audio.size,"bytes 1048576-2097151/"+audio.size]);
});
test("GM authorization, origin, streaming and private provider response rules are enforced",async()=>{
  const [service,route,ui,staging]=await Promise.all([
    read("lib/campaigns/recap-drive-upload-service.ts"),
    read("app/api/campaigns/[id]/session-recaps/audio/upload/relay/route.ts"),
    read("app/campaigns/session-recap-audio-uploader.tsx"),
    read("app/campaigns/session-recap-gemini-drive-staging.tsx"),
  ]);
  assert.match(service,/requireGm\(db,actor,campaignId\)/u);
  assert.match(service,/storage_owner_user_id=\? AND status='preparing'/u);
  assert.match(service,/verifyDriveUploadTicket/u);
  assert.match(service,/parseDriveRelayRange/u);
  assert.match(service,/body:|\{body\}/u);
  assert.doesNotMatch(service,/await request\.arrayBuffer\(|await request\.blob\(|BUCKET\.put\(|R2Bucket/u);
  assert.match(route,/request\.headers\.get\("origin"\)!==CANONICAL_ORIGIN/u);
  assert.match(route,/getSessionActor\(request\)/u);
  assert.match(route,/export async function PUT/u);
  assert.doesNotMatch(route,/export async function GET|GOOGLE_DRIVE_CLIENT_SECRET|console\.log/u);
  assert.match(ui,/endpoint:base\+"\/upload\/relay"/u);
  assert.equal((staging.match(/endpoint:base\+"\/session-recaps\/audio\/upload\/relay"/gu)||[]).length,2);
});
