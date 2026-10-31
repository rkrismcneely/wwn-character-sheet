import assert from "node:assert/strict";
import test from "node:test";
import {ensureRecapDriveFolder} from "../lib/campaigns/recap-drive-folder.ts";

test("Drive uses the GM's existing TWE folder when present",async()=>{
  let count=0;
  const folder=await ensureRecapDriveFolder("private-token",async (url,options)=>{
    count++;
    const target=new URL(String(url));
    assert.equal(target.origin,"https://www.googleapis.com");
    assert.equal(options.headers.authorization,"Bearer private-token");
    assert.match(target.searchParams.get("q"),/tweRecapStorage/u);
    return Response.json({files:[{id:"existingFolder123",name:"Tales Without End",
      mimeType:"application/vnd.google-apps.folder"}]});
  });
  assert.equal(folder,"existingFolder123");
  assert.equal(count,1);
});

test("Drive creates an app-owned folder when missing and never deletes existing files",async()=>{
  const calls=[];
  const folder=await ensureRecapDriveFolder("private-token",async (url,options)=>{
    calls.push({url:String(url),options});
    if(options.method==="POST"){
      const body=JSON.parse(options.body);
      assert.equal(body.name,"Tales Without End");
      assert.equal(body.mimeType,"application/vnd.google-apps.folder");
      assert.equal(body.appProperties.tweRecapStorage,"v1");
      return Response.json({id:"newFolder123"});
    }
    return Response.json({files:[]});
  });
  assert.equal(folder,"newFolder123");
  assert.equal(calls.length,2);
  assert.deepEqual(calls.map(x=>x.options.method??"GET"),["GET","POST"]);
});

test("Google Drive folder is never assumed created after upstream denial",async()=>{
  await assert.rejects(()=>ensureRecapDriveFolder("x",async()=>new Response("",{status:403})),
    /could not check/i);
});
