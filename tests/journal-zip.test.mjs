import test from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
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

test("extracts DEFLATE-compressed Markdown",async()=>{
 const source=new TextEncoder().encode("# Compressed");
 const compressed=deflateRawSync(source);
 const path=new TextEncoder().encode("Lore.md");
 const local=new Uint8Array(30+path.length+compressed.length);
 const lv=new DataView(local.buffer);
 lv.setUint32(0,0x04034b50,true);lv.setUint16(8,8,true);
 lv.setUint32(18,compressed.length,true);lv.setUint32(22,source.length,true);lv.setUint16(26,path.length,true);
 local.set(path,30);local.set(compressed,30+path.length);
 const central=new Uint8Array(46+path.length),cv=new DataView(central.buffer);
 cv.setUint32(0,0x02014b50,true);cv.setUint16(10,8,true);
 cv.setUint32(20,compressed.length,true);cv.setUint32(24,source.length,true);cv.setUint16(28,path.length,true);
 central.set(path,46);
 const end=new Uint8Array(22),ev=new DataView(end.buffer);
 ev.setUint32(0,0x06054b50,true);ev.setUint16(8,1,true);ev.setUint16(10,1,true);
 ev.setUint32(12,central.length,true);ev.setUint32(16,local.length,true);
 const output=new Uint8Array(local.length+central.length+end.length);
 output.set(local);output.set(central,local.length);output.set(end,local.length+central.length);
 assert.deepEqual(await extractMarkdownZip(output.buffer),[{path:"Lore.md",content:"# Compressed"}]);
});
