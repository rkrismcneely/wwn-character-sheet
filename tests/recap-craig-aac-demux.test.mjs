import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {inspectCraigAacMp4} from "../lib/campaigns/recap-craig-aac-demux.ts";
const enc=new TextEncoder();
function bytes(...arrays){const n=arrays.reduce((s,a)=>s+a.length,0);const b=new Uint8Array(n);let at=0;for(const a of arrays){b.set(a,at);at+=a.length;}return b;}
const u16=n=>new Uint8Array([n>>8&255,n&255]);
const u32=n=>new Uint8Array([(n>>>24)&255,n>>>16&255,n>>>8&255,n&255]);
function box(type,...content){const body=bytes(...content);return bytes(u32(body.length+8),enc.encode(type),body);}
function desc(tag,data){return bytes(new Uint8Array([tag,data.length]),data);}
function fixture({badOffset=false,extraAudio=false}={}){
  const ftyp=box("ftyp",enc.encode("M4A "),u32(0));
  const mdat=box("mdat",new Uint8Array(48*4));
  const offset=badOffset?3000000:ftyp.length+8;
  const asc=new Uint8Array([0x11,0x90]); // AAC-LC, 48 kHz, stereo
  const esds=box("esds",u32(0),desc(3,bytes(u16(1),new Uint8Array([0]),
    desc(4,bytes(new Uint8Array([0x40,0x15,0,0,0,0,0,0,0,0,0,0,0]),desc(5,asc))))));
  const entry=box("mp4a",new Uint8Array(6),u16(1),new Uint8Array(8),
    u16(2),u16(16),u16(0),u16(0),u32(48000*65536),esds);
  const stsd=box("stsd",u32(0),u32(1),entry);
  const stts=box("stts",u32(0),u32(1),u32(48),u32(1024));
  const stsc=box("stsc",u32(0),u32(1),u32(1),u32(48),u32(1));
  const stsz=box("stsz",u32(0),u32(4),u32(48));
  const stco=box("stco",u32(0),u32(1),u32(offset));
  const stbl=box("stbl",stsd,stts,stsc,stsz,stco);
  const minf=box("minf",stbl);
  const hdlr=box("hdlr",u32(0),u32(0),enc.encode("soun"),new Uint8Array(12));
  const mdhd=box("mdhd",u32(0),u32(0),u32(0),u32(48000),u32(48*1024),u16(0),u16(0));
  const trak=box("trak",box("mdia",mdhd,hdlr,minf));
  return bytes(ftyp,mdat,box("moov",trak,...(extraAudio?[trak]:[])));
}
function reader(data){const readSizes=[];
  return {readSizes,source:{metadata:{mimeType:"audio/mp4",bytes:data.length,
    etag:'"v1"',maxRangeBytes:1048576},read:async(at,n)=>{readSizes.push(n);return data.slice(at,at+n);}}};}
test("demuxes a moov-at-end Craig M4A, skipping compressed mdat payload",async()=>{
  const {source,readSizes}=reader(fixture());
  const index=await inspectCraigAacMp4(source);
  assert.equal(index.durationMs,1024);assert.equal(index.sampleRate,48000);
  assert.equal(index.channels,2);assert.equal(index.sampleCount,48);
  assert.equal(index.codec,"mp4a.40.2");assert.deepEqual([...index.description],[0x11,0x90]);
  const samples=[...index.samples()];
  assert.equal(samples.length,48);assert.equal(samples[0].length,4);
  assert.equal(samples[0].offset,24);
  assert.equal(samples.at(-1).timestampUs,Math.round(47*1024*1e6/48000));
  assert.equal(samples.reduce((s,p)=>s+p.length,0),192);
  assert.ok(Math.max(...readSizes)<=512*1024);
  assert.ok(readSizes.reduce((s,n)=>s+n,0)<source.metadata.bytes);
});
test("rejects mismatched media-data offsets and multiple audio tracks",async()=>{
  await assert.rejects(inspectCraigAacMp4(reader(fixture({badOffset:true})).source),
    /outside a bounded media-data/u);
  await assert.rejects(inspectCraigAacMp4(reader(fixture({extraAudio:true})).source),
    /exactly one audio track/u);
});
test("rejects wrong media type and oversized private source",async()=>{
  const invalid=reader(fixture()).source;
  invalid.metadata.mimeType="audio/flac";
  await assert.rejects(inspectCraigAacMp4(invalid),/not a private MPEG-4/u);
  invalid.metadata.mimeType="audio/mp4";invalid.metadata.bytes=257*1024*1024;
  await assert.rejects(inspectCraigAacMp4(invalid),/exceeds bounded private/u);
});
test("AAC inspection UI keeps decoding and billable Gemini disabled",async()=>{
  const ui=await readFile(new URL("../app/campaigns/session-recap-gemini-drive-staging.tsx",import.meta.url),"utf8");
  assert.match(ui,/inspectCraigAacMp4/u);
  assert.match(ui,/AAC metadata verified/u);
  assert.match(ui,/AAC metadata is ready for browser WebCodecs/u);
  assert.match(ui,/Automatic Gemini submission remains disabled/u);
});
