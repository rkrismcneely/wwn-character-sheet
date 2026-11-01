import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {cleanGeneratedRecap,ensureRecapEndingSections} from "../lib/campaigns/recap-only-runner.ts";

const source=readFileSync(new URL("../lib/campaigns/recap-only-runner.ts",import.meta.url),"utf8");
const names=["Relevant NPCs & Creatures","Decisions","Combat Consequences",
  "Quest Threads & Unresolved Questions","Next Time"];

test("all five ending sections exist even when model only writes narrative",()=>{
  const value=cleanGeneratedRecap("# A Strange Evening\n\n## 00:03:00 — Something happened\n"+
    "The party talked to Presto, rested and planned to leave in the morning.");
  for(const heading of names)assert.ok(value.includes("## "+heading+"\n\nNone noted."));
  assert.ok(value.indexOf("## Next Time")>value.indexOf("## Combat Consequences"));
});

test("existing reference sections are preserved rather than duplicated",()=>{
  const value="## Decisions\n\nThey chose to rest.\n\n"+
    "## Combat Consequences\n\nNo battle took place.";
  const result=ensureRecapEndingSections(value);
  assert.equal(result.match(/## Decisions/g)?.length,1);
  assert.equal(result.match(/## Combat Consequences/g)?.length,1);
  assert.match(result,/They chose to rest/);
});

test("both summarization paths require reference sections and creative tone-matching titles",()=>{
  assert.match(source,/ALWAYS include these five exact headings/);
  assert.match(source,/IN THAT ORDER, ALWAYS/);
  assert.match(source,/pun, playful wordplay/);
  assert.match(source,/ominous title/);
  assert.match(source,/Presto Change-O/);
});

test("all detail levels receive short GM-ready opening with scene and goal",()=>{
  assert.match(source,/Last Time — Read-Aloud/);
  assert.match(source,/60–75 spoken words/);
  assert.match(source,/current goal/);
  assert.match(source,/present goal/);
  assert.match(source,/ALL\s*detail settings/);
  const segment=readFileSync(new URL("../lib/campaigns/recap-long-audio-runner.ts",import.meta.url),"utf8");
  assert.match(segment,/part\.segmentIndex===0/);
  assert.match(segment,/introductory recap STYLE/);
  assert.match(segment,/Do not mistake the GM's recap of a prior session/);
});
