import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
import {
  LEGACY_RECAP_R2_MAX_BYTES, LEGACY_RECAP_R2_PREFIXES, requireLegacyRecapR2Capacity,
} from "../lib/campaigns/recap-r2-capacity.ts";

function bucket(objects,existing=null,fail=false){
  return {
    head:async key=>existing&&key===existing.key?{size:existing.size}:null,
    list:async ({prefix,cursor})=>{
      if(fail && prefix==="recap-tracks/")return {objects:[],truncated:true,cursor:"same"};
      const eligible=objects.filter(obj=>obj.key.startsWith(prefix));
      const page=Number(cursor||0),part=eligible.slice(page,page+2);
      return {objects:part,truncated:page+2<eligible.length,cursor:String(page+2)};
    },
  };
}

test("R2 quota covers all three legacy recap audio namespaces, not GM Drive",async()=>{
  assert.deepEqual([...LEGACY_RECAP_R2_PREFIXES],["recap-audio/","recap-craig/","recap-tracks/"]);
  const used=[
    {key:"recap-audio/cmp-a/1",size:40},
    {key:"recap-craig/cmp-b/2",size:20},
    {key:"recap-tracks/cmp-a/3",size:30},
    {key:"recap-tracks/cmp-a/4",size:15},
    {key:"recap-tracks/cmp-a/5",size:25},
    {key:"character-portraits/something",size:LEGACY_RECAP_R2_MAX_BYTES},
  ];
  const result=await requireLegacyRecapR2Capacity(bucket(used),10);
  assert.equal(result.usedBytes,130);
  assert.equal(result.newBytes,140);
  assert.equal(result.maxBytes,LEGACY_RECAP_R2_MAX_BYTES);
});

test("replacement discounts verified existing bytes without deleting the original",async()=>{
  const objects=[{key:"recap-tracks/a",size:1024}];
  const b=bucket(objects,{key:"recap-tracks/a",size:1024});
  const result=await requireLegacyRecapR2Capacity(b,1024,"recap-tracks/a");
  assert.equal(result.newBytes,1024);
});

test("fails closed at capacity and for unbounded R2 inventory",async()=>{
  await assert.rejects(()=>requireLegacyRecapR2Capacity(bucket([
    {key:"recap-craig/a",size:LEGACY_RECAP_R2_MAX_BYTES},
  ]),1),/budget exceeded/u);
  await assert.rejects(()=>requireLegacyRecapR2Capacity(bucket([]),LEGACY_RECAP_R2_MAX_BYTES+1),/safe R2 intake/u);
  await assert.rejects(()=>requireLegacyRecapR2Capacity(bucket([],null,true),1),/inventory/u);
  await assert.rejects(()=>requireLegacyRecapR2Capacity(bucket([]),1,"campaign-portraits/a"),/replacement key/u);
});

test("legacy recap upload and Craig extraction routes enforce capacity before writing",async()=>{
  const paths=[
    "../app/api/campaigns/[id]/recap-imports/audio/route.ts",
    "../app/api/campaigns/[id]/recap-imports/craig-transfer/route.ts",
    "../app/api/campaigns/[id]/recap-imports/craig-extract/route.ts",
  ];
  for(const path of paths){
    const source=await readFile(new URL(path,import.meta.url),"utf8");
    assert.match(source,/requireLegacyRecapR2Capacity\(env\.BUCKET/u,path);
    assert.ok(source.indexOf("requireLegacyRecapR2Capacity(env.BUCKET")<source.indexOf("env.BUCKET.put("),path);
  }
});
