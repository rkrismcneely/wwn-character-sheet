import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import {recapCloudClipReceipt} from "../lib/campaigns/recap-cloud-clip-receipt.ts";

const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
const sha=text=>createHash("sha256").update(text).digest("hex");

test("cloud clip receipt hashes stay compatible with historical Groq and Gemini transcripts",async()=>{
  const media="unchanged recorded audio bytes";
  const bytes=new TextEncoder().encode(media).buffer;
  const audioHash=sha(media);
  const groq=sha([audioHash,120000,60000,"whisper-large-v3","guest"].join(":"));
  const gemini=sha(["gemini",audioHash,120000,60000,"guest","gemini-3.5-transcribe"].join(":"));
  assert.equal(await recapCloudClipReceipt(bytes,"groq",{
    startMs:120000,durationMs:60000,model:"whisper-large-v3",speakerId:"guest",
  }),groq);
  assert.equal(await recapCloudClipReceipt(bytes,"gemini",{
    startMs:120000,durationMs:60000,model:"gemini-3.5-transcribe",speakerId:"guest",
  }),gemini);
  assert.notEqual(groq,gemini);
  assert.notEqual(await recapCloudClipReceipt(bytes,"groq",{
    startMs:120000,durationMs:60000,model:"whisper-large-v3-turbo",speakerId:"guest",
  }),groq);
});

test("both cloud providers write the shared receipt and store processed-clip checkpoints",async()=>{
  for(const path of [
    "app/api/campaigns/[id]/session-recaps/transcript/gemini/route.ts",
    "app/api/campaigns/[id]/session-recaps/transcript/transcribe/route.ts",
  ]){
    const code=await read(path);
    assert.match(code,/recapCloudClipReceipt\(/u,path);
    assert.match(code,/processedClips/u,path);
    assert.match(code,/mergeGroqAudioTranscript/u,path);
    assert.match(code,/onlyIf/u,path);
  }
});

test("completed receipts are returned only to authorized GMs",async()=>{
  const code=await read("app/api/campaigns/[id]/session-recaps/transcript/route.ts");
  assert.match(code,/\(gm\?\{processedClips:receipts\}:\{\}\)/u);
  assert.match(code,/canManageCampaignContent\(actor,access\.campaign,access\.membership\)/u);
  assert.match(code,/processedClips\.filter\(x=>typeof x==="string"/u);
});

test("wizard restores cloud section progress without retransferring previously saved clips",async()=>{
  const code=await read("app/campaigns/session-recap-staged-transcriber.tsx");
  assert.match(code,/setSavedReceipts\(value\.processedClips\?\?\[\]\)/u);
  assert.match(code,/if\(!historyLoaded\)throw Error/u);
  assert.match(code,/if\(savedReceipts\.includes\(receipt\)\)/u);
  assert.match(code,/if\(!receipts\.has\(receipt\)\)break/u);
  assert.match(code,/if\(!result\.duplicate\)/u);
  assert.match(code,/setModel\(candidate\)/u);
});

test("stale transcript revisions require fresh review before writer action",async()=>{
  const [wizard,route,writer]=await Promise.all([
    read("app/campaigns/session-recap-staged-wizard.tsx"),
    read("app/api/campaigns/[id]/session-recaps/workflow/route.ts"),
    read("app/api/campaigns/[id]/session-recaps/workflow/write/route.ts"),
  ]);
  assert.match(wizard,/workflow\.transcriptApprovedRevision===data\?\.transcript\.updatedAt/u);
  assert.match(wizard,/The transcript changed since its previous approval/u);
  assert.match(wizard,/!transcriptCurrent\?/u);
  assert.match(route,/\["select-writer","save-draft","approve-draft"\]\.includes\(action\.action\)/u);
  assert.match(route,/current\.transcriptApprovedRevision!==transcript\.updatedAt/u);
  assert.match(writer,/record\.updatedAt!==workflow\.transcriptApprovedRevision/u);
});

test("recording helper remains on published recap, old AI jobs stay hidden by default",async()=>{
  const code=await read("app/campaigns/session-recap-manager.tsx");
  assert.match(code,/editing\.isPublished&&<details className="session-recap-reading">\s*<summary>Attach or recover session audio<\/summary>/u);
  assert.match(code,/<SessionRecapAudioUploader key=\{editing\.id\}/u);
  assert.match(code,/SHOW_LEGACY_RECAP_TOOLS&&editing\.isPublished&&<>/u);
  assert.match(code,/SHOW_LEGACY_RECAP_TOOLS&&<details/u);
});

test("wizard picks connected providers and warns before unsafe FFmpeg conversion",async()=>{
  const code=await read("app/campaigns/session-recap-staged-wizard.tsx");
  assert.match(code,/setProvider\(recommended\)/u);
  assert.match(code,/setWriterProvider\(recommended\)/u);
  assert.match(code,/providerTouchedRef\.current=true/u);
  assert.match(code,/writerTouchedRef\.current=true/u);
  assert.match(code,/currentSource\.bytes>300\*1024\*1024/u);
  assert.match(code,/oversizedForBrowser&&method==="ffmpeg"/u);
});
