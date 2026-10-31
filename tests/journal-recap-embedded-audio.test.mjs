import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {journalDocumentContent} from "../lib/campaigns/journal-layout.ts";
import {parseAudioTimestamp,recapReferenceMarker,recapSeekEvent}
  from "../lib/campaigns/recap-audio-navigation.ts";
const read=p=>readFile(new URL("../"+p,import.meta.url),"utf8");
const recap="fa560d93-0db6-498d-a9f1-3477b2df47b4";

test("existing recap Journal metadata is retained for linking but hidden from reading",()=>{
  const raw="<!-- twe-session-recap:"+recap+" -->\n\n# Session\n## 01:42:15 — Fight";
  assert.equal(recapReferenceMarker.exec(raw)?.[1],recap);
  assert.doesNotMatch(journalDocumentContent(raw),/twe-session-recap/u);
  assert.match(journalDocumentContent(raw),/01:42:15/u);
  assert.match(journalDocumentContent("~~~\n<!-- twe-session-recap:"+recap+" -->\n~~~"),
    /twe-session-recap/u);
});
test("only valid three-part timestamps navigate to an offset",()=>{
  assert.equal(parseAudioTimestamp("01:42:15"),6135);
  assert.equal(parseAudioTimestamp("00:00:00"),0);
  for(const bad of ["01:99:00","00:01:77","fake","-01:02:03","01:02","24:00:00"])
    assert.equal(parseAudioTimestamp(bad),null);
});
test("Journal embeds authorized recap playback and dispatches seek only for linked pages",async()=>{
  const [journal,player,markdown,drive]=await Promise.all([
    read("app/campaigns/journal-document.tsx"),
    read("app/campaigns/session-recap-audio-player.tsx"),
    read("app/campaigns/session-recap-markdown.tsx"),
    read("lib/campaigns/recap-drive-playback.ts"),
  ]);
  assert.match(journal,/recapReferenceMarker\.exec\(content\)/u);
  assert.match(journal,/<SessionRecapAudioPlayer campaignId=\{campaignId\} recapId=\{recapId\} compact\/>/u);
  assert.match(journal,/onSeekAudio=\{onSeekAudio\}/u);
  assert.match(journal,/new CustomEvent\(recapSeekEvent/u);
  assert.match(player,/window\.addEventListener\(recapSeekEvent,handle\)/u);
  assert.match(player,/seekTo\(detail\.seconds\)/u);
  assert.match(player,/encodeURIComponent\(selected\.id\)\+"\/stream"/u);
  assert.match(markdown,/parseAudioTimestamp\(match\[0\]\)/u);
  assert.match(markdown,/aria-label=\{"Play recording from "\+match\[0\]\}/u);
  assert.match(drive,/getCampaignSessionRecap\(db,actor,campaignId,audio\.recapId\)/u);
  assert.equal(recapSeekEvent,"twe:session-recap-audio-seek");
});
