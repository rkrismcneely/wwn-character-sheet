import test from "node:test";
import assert from "node:assert/strict";
import {gzipSync} from "node:zlib";
import {readLegendKeeperBackup,inspectLegendKeeperBackup} from "../lib/campaigns/legendkeeper-native.ts";

test("reads bounded JSON and gzipped LK backups",async()=>{
 const data={version:"example",resources:[{id:"r1"},{id:"r2"}]};
 const json=new TextEncoder().encode(JSON.stringify(data));
 const zipped=gzipSync(json);
 const input=zipped.buffer.slice(zipped.byteOffset,zipped.byteOffset+zipped.byteLength);
 assert.deepEqual(await readLegendKeeperBackup(json.buffer,"json"),data);
 assert.deepEqual(await readLegendKeeperBackup(input,"lk"),data);
 assert.deepEqual(inspectLegendKeeperBackup(data),{recognized:true,resourceCount:2});
});
test("rejects disguised gzip files and malformed JSON",async()=>{
 const bad=new TextEncoder().encode("{not json");
 await assert.rejects(readLegendKeeperBackup(bad.buffer,"json"),/valid UTF-8 JSON/);
 await assert.rejects(readLegendKeeperBackup(bad.buffer,"lk"),/gzipped/);
 await assert.rejects(readLegendKeeperBackup(new TextEncoder().encode("[]").buffer,"json"),/JSON object/);
});
test("unknown native backup structure is never mistaken for import-ready content",()=>{
 assert.deepEqual(inspectLegendKeeperBackup({unknown:"data"}),{recognized:false,resourceCount:0});
});
