import assert from "node:assert/strict";
import test from "node:test";
import {inspectM4a,planM4a,estimateM4aDuration} from "../lib/campaigns/recap-m4a-remux.ts";

const as=(s)=>Uint8Array.from([...s].map(c=>c.charCodeAt(0)));
const u32=v=>Uint8Array.of(v>>>24,(v>>>16)&255,(v>>>8)&255,v&255);
const u16=v=>Uint8Array.of(v>>>8,v&255);
const concat=(...parts)=>{
  const out=new Uint8Array(parts.reduce((s,v)=>s+v.length,0));
  let at=0;for(const part of parts){out.set(part,at);at+=part.length;}return out;
};
const atom=(name,...data)=>{const payload=concat(...data);return concat(u32(payload.length+8),as(name),payload);};
const full=(name,...data)=>atom(name,new Uint8Array(4),...data);
function fixture({samples=312000,lowStart=140000,lowEnd=156000,mdatFirst=false}={}){
  const sizes=new Uint8Array(samples*4),view=new DataView(sizes.buffer);
  let total=0;
  for(let i=0;i<samples;i++){
    const size=i>=lowStart&&i<lowEnd?18:240;
    view.setUint32(i*4,size,false);total+=size;
  }
  const ftyp=atom("ftyp",as("M4A "),u32(0),as("isom"));
  const mp4a=atom("mp4a",new Uint8Array(6),u16(1),new Uint8Array(8),
    u16(1),u16(16),new Uint8Array(4),u32(48000<<16),
    full("esds",Uint8Array.of(3,3,0,0,0)));
  const stsd=full("stsd",u32(1),mp4a);
  const stts=full("stts",u32(1),u32(samples),u32(1024));
  const stsz=full("stsz",u32(0),u32(samples),sizes);
  const stsc=full("stsc",u32(1),u32(1),u32(samples),u32(1));
  const makeMoov=(offset)=>{
    const stbl=atom("stbl",stsd,stts,stsc,stsz,full("stco",u32(1),u32(offset)));
    const minf=atom("minf",full("smhd",new Uint8Array(4)),
      atom("dinf",full("dref",u32(1),atom("url ",Uint8Array.of(0,0,0,1)))),stbl);
    const mdhd=full("mdhd",u32(0),u32(0),u32(48000),u32(samples*1024),new Uint8Array(4));
    const hdlr=full("hdlr",u32(0),as("soun"),new Uint8Array(12),as("SoundHandler\0"));
    const media=atom("mdia",mdhd,hdlr,minf);
    return atom("moov",atom("trak",media));
  };
  const mock=makeMoov(0);
  const audioOffset=mdatFirst?ftyp.length+8:ftyp.length+mock.length+8;
  const moov=makeMoov(audioOffset);
  const mdat=concat(u32(total+8),as("mdat"));
  const totalFile=ftyp.length+moov.length+mdat.length+total;
  const parts=mdatFirst?[
    {start:0,bytes:ftyp},{start:ftyp.length,bytes:mdat},
    {start:ftyp.length+mdat.length+total,bytes:moov},
  ]:[
    {start:0,bytes:ftyp},{start:ftyp.length,bytes:moov},
    {start:ftyp.length+moov.length,bytes:mdat},
  ];
  const read=async(start,len)=>{
    const out=new Uint8Array(len);
    for(const part of parts){
      const from=Math.max(start,part.start),to=Math.min(start+len,part.start+part.bytes.length);
      if(to>from)out.set(part.bytes.subarray(from-part.start,to-part.start),from-start);
    }
    return out;
  };
  return {source:{byteSize:totalFile,durationMs:null,mimeType:"audio/mp4"},
    read,samples,total,ftyp,mdatFirst};
}
test("long untouched M4A is split into independently valid virtual MP4 headers",async()=>{
  const input=fixture();
  const plan=await planM4a(input.source,input.read);
  assert.equal(plan.length,2);
  assert.equal(plan[0].sourceStart+ (plan[0].sourceEnd-plan[0].sourceStart),plan[1].sourceStart);
  assert.equal(plan[1].sourceEnd-plan[0].sourceStart,input.total);
  assert.equal(plan[0].startMs,0);
  assert.equal(plan[1].endMs,Math.round(input.samples*1024/48000*1000));
  // Sustained low packet activity occurs near the middle; prefer it to a cut
  // on the exact midpoint. The original session timeline must still match.
  assert.ok(plan[0].endMs>48*60_000&&plan[0].endMs<58*60_000);
  assert.notEqual(plan[0].endMs,Math.round(plan[1].endMs/2));
  for(const section of plan){
    assert.equal(section.mimeType,"audio/mp4");
    const prefix=Uint8Array.from(atob(section.prefixBase64),c=>c.charCodeAt(0));
    assert.equal(String.fromCharCode(...prefix.subarray(4,8)),"ftyp");
    assert.equal(String.fromCharCode(...prefix.subarray(prefix.length-4)),"mdat");
    assert.ok(prefix.length<1250*1024);
    // Ensure reassembled sample tables describe the remuxed *local* media
    // rather than the original recording's chunk offset or duration.
    const size=prefix.length+section.sourceEnd-section.sourceStart;
    const read=async(start,len)=>{
      const buffer=new Uint8Array(len);
      if(start<prefix.length)buffer.set(prefix.subarray(start,Math.min(prefix.length,start+len)));
      return buffer;
    };
    const parsed=await inspectM4a({byteSize:size,durationMs:null,mimeType:"audio/mp4"},read);
    assert.ok(Math.abs(parsed.durationMs-(section.endMs-section.startMs))<1000);
    assert.equal(parsed.dataEnd-parsed.dataStart,section.sourceEnd-section.sourceStart);
  }
});
test("M4A can retain its metadata at the end of the Drive file",async()=>{
  const f=fixture({mdatFirst:true,samples:350000});
  const duration=await estimateM4aDuration(f.source,f.read);
  assert.ok(duration>120*60_000);
  const plan=await planM4a(f.source,f.read);
  assert.ok(plan.length>=2);
});
test("malformed or non-AAC M4A fails closed without any Gemini request",async()=>{
  const invalid={byteSize:100000,durationMs:null,mimeType:"audio/mp4"};
  await assert.rejects(()=>planM4a(invalid,async(start,len)=>new Uint8Array(len)));
  assert.equal(await estimateM4aDuration(invalid,async(start,len)=>new Uint8Array(len)),null);
});
test("M4A with no convincing activity drop falls back to evenly balanced cuts",async()=>{
  const f=fixture({lowStart:-1,lowEnd:-1});
  const parts=await planM4a(f.source,f.read);
  assert.equal(parts.length,2);
  assert.ok(Math.abs(parts[0].endMs-parts[1].endMs/2)<1000);
});
