import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {splitGroqSourceNotes,GROQ_PART_CHARS} from "../lib/campaigns/recap-groq-final-runner.ts";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");

test("Groq note splitting never loses words at boundaries",()=>{
 const notes=Array.from({length:1800},(_,i)=>"["+i+"] Scene action and consequences.").join("\n");
 const parts=splitGroqSourceNotes(notes);
 assert.ok(parts.length>1&&parts.length<=12);
 assert.ok(parts.every(x=>x.length<=GROQ_PART_CHARS));
 assert.equal(parts.join(""),notes);
 assert.equal(splitGroqSourceNotes("Short audio notes.")[0],"Short audio notes.");
 assert.throws(()=>splitGroqSourceNotes(""));
});
test("Gemini audio notes are checkpointed before any Groq writing",async()=>{
 const runner=await read("lib/campaigns/recap-only-runner.ts");
 const migration=await read("drizzle/0055_recap_saved_audio_notes.sql");
 assert.match(runner,/audio_notes=\?,interaction_id=NULL/);
 assert.match(runner,/submitGroqRecap\(env,job,notes/);
 assert.match(runner,/job.model.startsWith\("groq:"\)&&job.audioNotes/);
 assert.match(migration,/ADD COLUMN audio_notes TEXT/);
});
test("Groq sections are persistent and uncertain submissions never retry automatically",async()=>{
 const writer=await read("lib/campaigns/recap-groq-final-runner.ts");
 const migration=await read("drizzle/0056_recap_groq_writer_checkpoints.sql");
 assert.match(writer,/INSERT OR IGNORE INTO campaign_recap_groq_writer_parts/);
 assert.match(writer,/status='submitting'/);
 assert.match(writer,/writer_submission_uncertain/);
 assert.match(writer,/context.slice\(0,2800\)/);
 assert.match(migration,/PRIMARY KEY\(job_id,part_index\)/);
});
test("Groq writer jobs require their own connected account and explicit approval",async()=>{
 const enqueue=await read("lib/campaigns/recap-only-jobs.ts");
 assert.match(enqueue,/user_recap_groq_connections/);
 assert.match(enqueue,/confirmed!==true/);
 assert.match(enqueue,/writerModel.startsWith\("groq:"\)/);
 assert.match(enqueue,/audio_notes=\(/);
});
