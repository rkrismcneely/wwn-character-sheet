import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {createContext,Script} from "node:vm";
import {recapFFmpegWorkerSource} from "../lib/campaigns/recap-ffmpeg-worker-source.ts";

const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");

test("Drive originals are reused from browser storage, without another transfer on retries",async()=>{
  const code=await read("app/campaigns/session-recap-staged-wizard.tsx");
  const cacheLookup=code.indexOf("const cached=await browserRecapFile(originalKey)");
  const transfer=code.indexOf("const response=await fetch(endpoint");
  assert.ok(cacheLookup>0&&transfer>cacheLookup,"Local verified original must be checked before Drive fetch.");
  assert.match(code,/browserRecapKey\(campaignId,recapId,\s*currentSource\.id,"drive-original"/u);
  assert.match(code,/cached\.size===currentSource\.bytes/u);
  assert.match(code,/await saveBrowserRecapFile\(originalKey,original/u);
  assert.match(code,/method==="ffmpeg"&&currentSource\.bytes<=300\*1024\*1024/u);
  assert.match(code,/storage\.quota-storage\.usage<original\.size\*3/u);
  assert.match(code,/if\(signal\?\.aborted\)throw Error\("Audio preparation stopped\."\)/u);
});

test("stalled individual transcodes are bounded and the full input is released",async()=>{
  const code=await read("lib/campaigns/recap-browser-preparation.ts");
  assert.match(code,/FFMPEG_PART_TIMEOUT_MS=20\*60_000/u);
  assert.match(code,/ffmpeg\.exec\(args,FFMPEG_PART_TIMEOUT_MS\)/u);
  assert.match(code,/Saved sections are available for retry/u);
  assert.match(code,/await ffmpeg\.deleteFile\(input\)\.catch\(\(\)=>\{\}\);\s*\/\/ FFmpeg keeps the complete multi-hour input/u);
  assert.match(code,/stopRecapFFmpeg\(\);\s*\}\s*return ready/u);
  assert.match(code,/browserRecapFile\(part\.key\)/u);
  assert.match(code,/saveBrowserRecapFile\(part\.key,prepared\)/u);
});

test("private audio cache can be stopped between writes without accepting a partial file",async()=>{
  const code=await read("lib/campaigns/recap-browser-preparation.ts");
  assert.match(code,/saveBrowserRecapFile\(key:string,file:File,onBytes\?:\(done:number,total:number\)=>void,signal\?:AbortSignal\)/u);
  assert.match(code,/if\(signal\?\.aborted\)throw Error\("Audio preparation stopped\."\)/u);
  assert.match(code,/await writable\.abort\(\)\.catch/u);
});

test("pinned FFmpeg engine and wrapper have a second browser-direct source",async()=>{
  const code=await read("lib/campaigns/recap-browser-preparation.ts");
  assert.match(code,/https:\/\/cdn\.jsdelivr\.net\/npm/u);
  assert.match(code,/https:\/\/unpkg\.com/u);
  assert.match(code,/AbortSignal\.any\(\[abort\.signal,AbortSignal\.timeout\(40_000\)\]\)/u);
  assert.match(code,/Both pinned sources failed to load/u);
  assert.match(code,/Both audio converter JavaScript sources are unavailable/u);
  assert.match(code,/\/dist\/esm\/"/u);
  assert.match(code,/FFMPEG_START_TIMEOUT_MS=90_000/u);
});

test("the self-hosted worker dispatches and returns actual FFmpeg message receipts",async()=>{
  const original='const module = await import(coreURL);';
  assert.ok(recapFFmpegWorkerSource.includes(original));
  // Replace only module loading with a mocked WASM core. The worker's actual
  // message dispatcher and data transfer path execute unchanged.
  const script=recapFFmpegWorkerSource.replace(original,
    'const module = {default:self.__testCoreFactory};');
  const events=[];
  const files=new Map();
  const instance={
    ret:0,
    exec(...args){this.ret=args.includes("-fail")?1:0;},
    ffprobe(){this.ret=0;},
    reset(){this.ret=0;},
    setTimeout(){},
    setLogger(fn){this.logger=fn;},
    setProgress(fn){this.progress=fn;},
    FS:{
      writeFile(path,data){files.set(path,data);},
      readFile(path){return files.get(path);},
      unlink(path){files.delete(path);},
    },
  };
  const self={postMessage:(item)=>events.push(item),__testCoreFactory:async()=>instance};
  const context=createContext({self,Uint8Array,btoa:value=>Buffer.from(value).toString("base64")});
  new Script(script).runInContext(context);
  const call=async(id,type,data)=>{
    await self.onmessage({data:{id,type,data}});
    const event=events.find(e=>e.id===id);
    assert.ok(event,"No FFmpeg response to "+type);
    return event;
  };
  const loaded=await call(1,"LOAD",{coreURL:"blob:test-core.js",wasmURL:"blob:test-core.wasm"});
  assert.equal(loaded.type,"LOAD");
  assert.equal(loaded.data,true);
  const bytes=new Uint8Array([4,5,6]);
  assert.equal((await call(2,"WRITE_FILE",{path:"input.m4a",data:bytes})).data,true);
  assert.equal((await call(3,"EXEC",{args:["-i","input.m4a"]})).data,0);
  const readBack=await call(4,"READ_FILE",{path:"input.m4a",encoding:"binary"});
  assert.deepEqual([...readBack.data],[4,5,6]);
  assert.equal((await call(5,"DELETE_FILE",{path:"input.m4a"})).data,true);
  const errored=await call(6,"READ_FILE",{path:"missing"}); // mock returns undefined
  assert.equal(errored.type,"READ_FILE");
  assert.equal(files.size,0);
});

test("production checks verify the actual converter worker and not just homepage",async()=>{
  const [release,health]=await Promise.all([
    read("scripts/verify-live-release.mjs"),
    read(".github/workflows/verify-production-health.yml"),
  ]);
  assert.match(release,/api\/recap-ffmpeg\/worker\.js\?release=/u);
  assert.match(release,/ffmpegWorker\.ok/u);
  assert.match(release,/workerCode\.includes\("self\.onmessage"\)/u);
  assert.match(release,/workerCode\.includes\('case "LOAD"'\)/u);
  assert.match(health,/api\/recap-ffmpeg\/worker\.js\?release=\$EXPECTED_SHA/u);
  assert.match(health,/grep -q 'self\.onmessage'/u);
  assert.match(health,/grep -q 'case "LOAD"'/u);
});

test("converter preflight rejects a missing worker before reading original Drive bytes",async()=>{
  const [wizard,engine]=await Promise.all([
    read("app/campaigns/session-recap-staged-wizard.tsx"),
    read("lib/campaigns/recap-browser-preparation.ts"),
  ]);
  const check=wizard.indexOf("await verifyRecapFFmpegWorker(abort.signal)");
  const source=wizard.indexOf("const source=await sourceFile(abort.signal)");
  assert.ok(check>0&&source>check,"Worker must be preflighted before Drive transfer.");
  assert.match(wizard,/if\(method==="ffmpeg"\)\{/u);
  assert.match(engine,/export async function verifyRecapFFmpegWorker\(signal\?:AbortSignal\)/u);
  assert.match(engine,/workerCheck\.ok/u);
  assert.match(engine,/text\.includes\("self\.onmessage"\)/u);
  assert.match(engine,/text\.includes\('case "LOAD"'\)/u);
  assert.match(engine,/await verifyRecapFFmpegWorker\(abort\.signal\)/u);
});
