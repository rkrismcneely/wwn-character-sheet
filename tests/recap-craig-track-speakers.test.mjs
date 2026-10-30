import assert from "node:assert/strict";import {readFile} from "node:fs/promises";import test from "node:test";
const read = p => readFile(new URL(p,import.meta.url),"utf8");
test("Craig track speaker assignments persist privately and use confirmed speaker snapshots",async()=>{
 const [route,ui]=await Promise.all([read("../app/api/campaigns/[id]/recap-imports/craig-track-speakers/route.ts"),read("../app/campaigns/session-recap-recording-setup.tsx")]);
 assert.match(route,/getCraigRecordingForDownloadJob/u);
 assert.match(route,/campaign_recap_recording_speakers WHERE import_id=\?/u);
 assert.match(route,/recap-track-speakers\//u);
 assert.match(route,/BUCKET\.head\("recap-tracks\//u);
 assert.match(route,/\["audio\/flac", "audio\/aac"\]/u);
 assert.match(route,/byName\.get\(discordName\)/u);
 assert.match(route,/cache-control": "no-store"/u);
 assert.match(ui,/Save Track Speakers/u);
 assert.match(ui,/saveTrackSpeakers/u);
});