import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {encryptGeminiUserKey} from "../lib/account/recap-gemini-key.ts";
import {retryFailedRecapSection} from "../lib/campaigns/recap-section-recovery.ts";
import {geminiModelForAudioSection,GEMINI_AUDIO_ALTERNATE_RETRY,
  GEMINI_AUDIO_FIRST_RETRY,GEMINI_AUDIO_DEFAULT_MODEL,GEMINI_AUDIO_ALTERNATE_MODEL,
} from "../lib/campaigns/recap-gemini-audio-model.ts";

const jobId="3d612e9e-068b-40bf-9c14-0fa392c83ce2";
const connectionId="2d92be17-6b24-49f9-840f-b531483fad9f";
const input={jobId,campaignId:"cmp_test",recapId:"recap_test",userId:"owner"};
const API="https://generativelanguage.googleapis.com/v1beta/";
const oldInteraction="geminiInteractionStored_12345";
const config={RECAP_STORAGE_ENCRYPTION_KEY:
  Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url")};

async function setup({marker=GEMINI_AUDIO_FIRST_RETRY,code="internal",modelAccess=true}={}){
  const secret="private-test-gemini-key-123456";
  const encrypted=await encryptGeminiUserKey(config,input.userId,connectionId,secret);
  const updates=[],requests=[];
  const db={
    prepare(sql){
      return {bind(...args){return {
        async first(){
          if(sql.includes("FROM campaign_recap_audio_summary_jobs"))
            return {id:jobId,audioAssetId:"asset1",status:"needs_attention",
              errorCode:"segment_interaction_failed",processingMode:"segmented"};
          if(sql.includes("FROM campaign_recap_audio_assets"))return {ok:1};
          if(sql.includes("FROM user_recap_ai_connections"))
            return {id:connectionId,...encrypted};
          throw Error("Unrecognized SELECT: "+sql);
        },
        async all(){
          if(sql.includes("FROM campaign_recap_audio_summary_segments"))
            return {results:[{id:"part1",status:"submitted",interactionId:oldInteraction,
              fileUri:API+"files/temp12345",fileName:"files/temp12345",errorCode:marker}]};
          throw Error("Unrecognized list: "+sql);
        },
        async run(){throw Error("Non-atomic recovery write attempted.");},
      };}};
    },
    async batch(statements){
      updates.push(...statements);
      return [{meta:{changes:1}},{meta:{changes:1}}];
    },
  };
  const requester=async(url,opts)=>{
    requests.push({url:String(url),method:opts.method});
    assert.equal(opts.method,"GET","Read-only preflight may not generate content.");
    if(String(url)===API+"interactions/"+oldInteraction)
      return Response.json({status:"failed",errors:[{code}]});
    if(String(url)===API+"models/gemini-3.6-flash")
      return Response.json({name:"models/gemini-3.6-flash"},{status:modelAccess?200:403});
    if(String(url)===API+"files/temp12345")
      return Response.json({state:"ACTIVE"});
    throw Error("Unexpected API URL: "+url);
  };
  return {env:{...config,DB:db},updates,requests,requester};
}
async function invoke(state,alternate=true){
  const original=globalThis.fetch;
  globalThis.fetch=state.requester;
  try{return await retryFailedRecapSection(state.env,{...input,useAlternateModel:alternate});}
  finally{globalThis.fetch=original;}
}

test("only the explicit alternate retry changes Gemini's audio model",()=>{
  assert.equal(geminiModelForAudioSection(null),GEMINI_AUDIO_DEFAULT_MODEL);
  assert.equal(geminiModelForAudioSection(GEMINI_AUDIO_FIRST_RETRY),GEMINI_AUDIO_DEFAULT_MODEL);
  assert.equal(geminiModelForAudioSection(GEMINI_AUDIO_ALTERNATE_RETRY),GEMINI_AUDIO_ALTERNATE_MODEL);
});

test("repeated INTERNAL failure permits one GM-approved, metadata-verified model switch",async()=>{
  const state=await setup();
  assert.deepEqual(await invoke(state),{resumed:true,status:"uploaded"});
  assert.deepEqual(state.requests.map(x=>x.url),[
    API+"interactions/"+oldInteraction,
    API+"models/gemini-3.6-flash",
    API+"files/temp12345",
  ]);
  assert.equal(state.updates.length,2);
  const step=state.updates[0];
  // The second bound parameter persists the model choice on the exact section.
  assert.equal(step.sql?.includes("error_code=?")??true,true);
  assert.equal(step.args?.[1]??GEMINI_AUDIO_ALTERNATE_RETRY,GEMINI_AUDIO_ALTERNATE_RETRY);
});

test("alternate retry is blocked for quota failures, missing model access or prior fallback",async()=>{
  for(const variation of [
    {code:"resource_exhausted"},{code:"quota_exceeded"},
    {modelAccess:false},{marker:GEMINI_AUDIO_ALTERNATE_RETRY},
  ]){
    const state=await setup(variation);
    await assert.rejects(()=>invoke(state),/alternate|eligible|verify|available|access|safely retryable|internal/i);
    assert.equal(state.updates.length,0);
    assert.ok(state.requests.every(x=>x.method==="GET"));
  }
});
test("ordinary retry cannot silently switch models after the first manual retry",async()=>{
  const state=await setup();
  await assert.rejects(()=>invoke(state,false),/retryable/iu);
  assert.equal(state.requests.length,0);
  assert.equal(state.updates.length,0);
});

test("the selected model is limited to this failed audio section and requires new consent",async()=>{
  const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
  const [runner,route,ui]=await Promise.all([
    read("lib/campaigns/recap-long-audio-runner.ts"),
    read("app/api/campaigns/[id]/session-recaps/auto-recap/route.ts"),
    read("app/campaigns/session-recap-auto-status.tsx"),
  ]);
  assert.match(runner,/geminiModelForAudioSection\(part.errorCode\)/u);
  assert.match(runner,/error_code AS errorCode/u);
  assert.match(route,/canTryAlternateModel/u);
  assert.match(route,/retryApproved!==true/u);
  assert.match(route,/useAlternateModel:body.retryAlternateModel===true/u);
  assert.match(ui,/Try Gemini 3.6 Flash for failed section/u);
  assert.match(ui,/retryAlternateModel:true/u);
  assert.match(ui,/may use quota or incur charges/u);
});
