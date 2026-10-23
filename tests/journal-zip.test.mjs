import test from "node:test";
import assert from "node:assert/strict";
import { extractMarkdownZip } from "../lib/campaigns/journal-zip.ts";

function zipStored(path,body){
 const name=new TextEncoder().encode(path),data=new TextEncoder().encode(body);
 const local=new Uint8Array(30+name.length+data.length);
 const lv=new DataView(local.buffer);
 lv.setUint32(0,0x04034b50,true);lv.setUint16(26,name.length,true);
 lv.setUint32(18,data.length,true);lv.setUint32(22,data.length,true);
 local.set(name,30);local.set(data,30+name.length);
 const central=new Uint8Array(46+name.length);
 const cv=new DataView(central.buffer);
 cv.setUint32(0,0x02014b50,true);cv.setUint32(20,data.length,true);
 cv.setUint32(24,data.length,true);cv.setUint16(28,name.length,true);
 central.set(name,46);
 const end=new Uint8Array(22),ev=new DataView(end.buffer);
 ev.setUint32(0,0x06054b50,true);ev.setUint16(8,1,true);ev.setUint16(10,1,true);
 ev.setUint32(12,central.length,true);ev.setUint32(16,local.length,true);
 const out=new Uint8Array(local.length+central.length+end.length);
 out.set(local);out.set(central,local.length);out.set(end,local.length+central.length);
 return out.buffer;
}
test("extracts Markdown from a stored ZIP",async()=>{
 assert.deepEqual(await extractMarkdownZip(zipStored("World/Notes.md","# Hello")),[{path:"World/Notes.md",content:"# Hello"}]);
});
test("rejects path traversal inside a ZIP",async()=>{
 await assert.rejects(extractMarkdownZip(zipStored("../secrets.md","secret")),/Unsafe vault path/);
});
test("rejects malformed ZIPs",async()=>{
 await assert.rejects(extractMarkdownZip(new Uint8Array(30).buffer),/Invalid ZIP archive/);
});
