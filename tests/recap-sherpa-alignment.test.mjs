import {test} from "node:test";
import assert from "node:assert/strict";
import {alignSherpaTurns} from "../lib/campaigns/recap-sherpa-alignment.ts";
const cues=[
  {startMs:1000,endMs:3000,text:"Hello adventurers.",rawSpeaker:"Local Whisper"},
  {startMs:3200,endMs:4800,text:"I check for traps.",rawSpeaker:"Local Whisper"},
];
test("different voices preserve their own text and timestamps",()=>{
  const result=alignSherpaTurns(cues,[{start:1,end:3,speaker:0},{start:3.2,end:4.8,speaker:1}]);
  assert.deepEqual(result.cues.map(c=>c.rawSpeaker),["Speaker 1","Speaker 2"]);
  assert.deepEqual(result.cues.map(c=>c.text),cues.map(c=>c.text));
  assert.deepEqual(result.speakerLabels,["Speaker 1","Speaker 2"]);
});
test("uncertain overlap is not invented as a confirmed guest or player",()=>{
  const result=alignSherpaTurns([{...cues[0],startMs:0,endMs:2000}],
    [{start:0,end:1,speaker:0},{start:1,end:2,speaker:1}]);
  assert.equal(result.cues[0].rawSpeaker,"Unidentified speaker");
  assert.equal(result.uncertain,1);
});
test("timestamp offsets make separately prepared clips align with the session",()=>{
  const result=alignSherpaTurns([{...cues[0],startMs:601000,endMs:603000}],
    [{start:1,end:3,speaker:2}],600000);
  assert.equal(result.cues[0].rawSpeaker,"Speaker 3");
});
test("invalid model output fails safely without altering a saved transcript",()=>{
  assert.throws(()=>alignSherpaTurns(cues,[{start:2,end:1,speaker:0}]),/Invalid/);
});
