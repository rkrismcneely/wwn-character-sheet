import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";

const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");

test("browser module worker must receive ESM FFmpeg core, never UMD",async()=>{
  const code=await read("lib/campaigns/recap-browser-preparation.ts");
  assert.match(code,/@ffmpeg\/core@0\.12\.10\/dist\/esm/u);
  assert.doesNotMatch(code,/@ffmpeg\/core@0\.12\.10\/dist\/umd/u);
  assert.match(code,/classWorkerURL:worker/u);
  assert.match(code,/\/api\/recap-ffmpeg\/worker\.js/u);
});
test("FFmpeg startup cannot hang without surfacing an actionable failure",async()=>{
  const code=await read("lib/campaigns/recap-browser-preparation.ts");
  assert.match(code,/FFMPEG_START_TIMEOUT_MS=90_000/u);
  assert.match(code,/Promise\.race\(\[load,cancelled\]\)/u);
  assert.match(code,/timedOut=true;abort\.abort\(\);loadingConverter\?\.terminate\(\)/u);
  assert.match(code,/Audio converter startup was cancelled/u);
  assert.match(code,/The browser audio converter did not start within 90 seconds/u);
  assert.match(code,/workerCheck\.ok/u);
  assert.match(code,/workerCheck\.headers\.get\("content-type"\)\?\.includes\("javascript"\)/u);
});
test("user cancellation stops startup as well as a running converter",async()=>{
  const code=await read("lib/campaigns/recap-browser-preparation.ts");
  const stop=code.slice(code.indexOf("export function stopRecapFFmpeg"));
  assert.match(stop,/loadingAbort\?\.abort\(\)/u);
  assert.match(stop,/loadingConverter\?\.terminate\(\)/u);
  assert.match(stop,/converter\?\.terminate\(\)/u);
  assert.match(code,/signal:abort\.signal/u);
  assert.match(code,/\{signal:abort\.signal\}\)/u);
});
test("wizard can stop while downloading, and shows an indeterminate startup bar",async()=>{
  const code=await read("app/campaigns/session-recap-staged-wizard.tsx");
  assert.match(code,/preparationAbort=useRef<AbortController\|null>/u);
  assert.match(code,/const source=await sourceFile\(abort\.signal\)/u);
  assert.match(code,/fetch\(endpoint,\{cache:"no-store",signal\}\)/u);
  assert.match(code,/stage\.startsWith\("Loading "\) \? null/u);
  assert.match(code,/preparationAbort\.current\?\.abort\(\);stopRecapFFmpeg\(\)/u);
  assert.match(code,/Stop preparation/u);
});
test("preparation retains browser checkpoints and does not delete original Drive asset",async()=>{
  const code=await read("lib/campaigns/recap-browser-preparation.ts");
  assert.match(code,/ready\.filter\(Boolean\)/u);
  assert.match(code,/browserRecapFile\(part\.key\)/u);
  assert.match(code,/saveBrowserRecapFile\(part\.key,prepared\)/u);
  assert.doesNotMatch(code,/BUCKET\.delete|deleteFile\(part\.key\)/u);
});
