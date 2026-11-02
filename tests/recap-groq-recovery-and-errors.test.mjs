import test from "node:test";
import assert from "node:assert/strict";
import {requestGroqWriter,GroqWriterFailure,groqHttpError,
  manualGroqWriterErrors} from "../lib/campaigns/recap-groq-request.ts";
import {resumeGroqWriter} from "../lib/campaigns/recap-groq-recovery.ts";
import {readFile} from "node:fs/promises";

const jobId="d789c69a-85bf-4a87-a576-1a1f41d43944";
const params={jobId,campaignId:"cmp_test",recapId:"recap_test",userId:"gm_owner",
  acknowledgedPossibleCharge:true};
const good={choices:[{finish_reason:"stop",message:{content:"### A complete recap draft."}}]};
function mockDb({
  code="writer_submission_uncertain",model="groq:openai/gpt-oss-120b",
  mode="segmented",notes=null,ready=3,total=3,connected=true,updateCount=1,
}={}){
  const calls=[];
  const db={
    prepare(sql){
      return {
        bind(...args){
          calls.push({sql,args});
          return {
            async first(){
              if(sql.includes("FROM campaign_recap_audio_summary_jobs"))
                return {id:jobId,model,status:"needs_attention",errorCode:code,
                  processingMode:mode,audioNotes:notes};
              if(sql.includes("FROM campaign_recap_audio_summary_segments"))
                return {total,completed:ready};
              if(sql.includes("FROM user_recap_groq_connections"))
                return connected?{ok:1}:null;
              throw Error("Unexpected SQL read: "+sql);
            },
            async run(){return {meta:{changes:updateCount}};},
          };
        },
      };
    },
  };
  return {db,calls};
}
test("known Groq HTTP rejection is classified without echoing raw error bodies",async()=>{
  const original=globalThis.fetch;
  try{
    for(const status of [400,401,403,404,413,422,424,429,498,500,502,503,504]){
      let count=0;
      globalThis.fetch=async(_,init)=>{
        count++;
        assert.equal(init.method,"POST");
        assert.equal(init.headers.Authorization,"Bearer secret-from-gm");
        const payload=JSON.parse(init.body);
        assert.equal(payload.reasoning_effort,"low");
        assert.equal(payload.include_reasoning,false);
        assert.equal(payload.stream,false);
        assert.equal(payload.model,"openai/gpt-oss-120b");
        return Response.json({error:{message:"Sensitive error including private data"}},{status});
      };
      await assert.rejects(
        ()=>requestGroqWriter("secret-from-gm","openai/gpt-oss-120b","test prompt",3200),
        error=>{
          assert.ok(error instanceof GroqWriterFailure);
          assert.equal(error.code,"writer_http_"+status);
          assert.doesNotMatch(error.message,/secret-from-gm|Sensitive/u);
          return true;
        },
      );
      assert.equal(count,1,"Never automatically retry a rejected request.");
    }
  }finally{globalThis.fetch=original;}
  assert.equal(groqHttpError(599),"writer_http_rejected");
});
test("response timeout, lost reply, truncation and malformed output are distinct",async()=>{
  const original=globalThis.fetch;
  const cases=[
    {fetch:async()=>{throw Object.assign(new Error("sensitive"),{name:"TimeoutError"});},code:"writer_timeout_uncertain"},
    {fetch:async()=>{throw Error("sensitive");},code:"writer_network_uncertain"},
    {fetch:async()=>Response.json({choices:[{finish_reason:"length",message:{content:"Partial"}}]}),code:"writer_output_truncated"},
    {fetch:async()=>new Response("not-json",{status:200}),code:"writer_response_invalid"},
    {fetch:async()=>Response.json({choices:[{finish_reason:"stop",message:{content:""}}]}),code:"writer_output_invalid"},
  ];
  try{
    for(const scenario of cases){
      globalThis.fetch=scenario.fetch;
      await assert.rejects(()=>requestGroqWriter("secret","openai/gpt-oss-120b","prompt",3200),
        e=>e instanceof GroqWriterFailure&&e.code===scenario.code);
    }
    globalThis.fetch=async()=>Response.json(good);
    assert.equal(await requestGroqWriter("secret","openai/gpt-oss-120b","prompt",3200),
      "### A complete recap draft.");
  }finally{globalThis.fetch=original;}
});
test("successful Groq replies distinguish empty and reasoning-only output without another POST",async()=>{
  const original=globalThis.fetch;
  try{
    const cases=[
      {reply:{choices:[{finish_reason:"stop",message:{content:""}}]},
        code:"writer_output_empty"},
      {reply:{choices:[{finish_reason:"stop",message:{content:null}}],
        usage:{completion_tokens:981,completion_tokens_details:{reasoning_tokens:981}}},
        code:"writer_reasoning_only"},
    ];
    for(const {reply,code} of cases){
      let requests=0;
      globalThis.fetch=async()=>{requests++;return Response.json(reply);};
      await assert.rejects(()=>requestGroqWriter("secret","openai/gpt-oss-120b","prompt",3000),
        e=>e instanceof GroqWriterFailure&&e.code===code);
      assert.equal(requests,1,"Do not automatically retry a 200 with no usable text.");
      assert.ok(manualGroqWriterErrors.has(code));
    }
  }finally{globalThis.fetch=original;}
});
test("Groq section length failures are eligible for manual recovery from saved notes",async()=>{
  assert.ok(manualGroqWriterErrors.has("writer_section_too_short"));
  assert.ok(manualGroqWriterErrors.has("writer_section_too_long"));
  const {db}=mockDb({code:"writer_section_too_long"});
  assert.deepEqual(await resumeGroqWriter(db,params),{resumed:true,status:"uploaded"});
});
test("explicit Groq-only recovery keeps existing audio and saved writer checkpoints",async()=>{
  const {db,calls}=mockDb();
  const oldFetch=globalThis.fetch;
  globalThis.fetch=async()=>{throw Error("Recovery must make no provider request.");};
  try{
    assert.deepEqual(await resumeGroqWriter(db,params),{resumed:true,status:"uploaded"});
  }finally{globalThis.fetch=oldFetch;}
  const changed=calls.find(c=>c.sql.includes("SET status='uploaded',error_code=NULL"));
  assert.ok(changed);
  assert.match(changed.sql,/status='needs_attention' AND error_code=\?/u);
  assert.ok(changed.sql.includes("requested_by=?"));
  assert.deepEqual(changed.args.slice(1,5),
    [jobId,params.campaignId,params.recapId,params.userId]);
  assert.equal(calls.some(c=>/DELETE|UPDATE campaign_recap_audio_summary_segments|UPDATE campaign_recap_groq_writer_parts/.test(c.sql)),false);
  assert.equal(calls.some(c=>/Drive|Gemini|api\.groq/.test(c.sql)),false);
});
test("manual writing retry rejects missing permission, notes, Groq connection and invalid state",async()=>{
  for(const variant of [
    {params:{...params,acknowledgedPossibleCharge:false}},
    {setup:{code:"writer_http_400"}},
    {setup:{model:"gemini:gemini-3.8-flash"}},
    {setup:{mode:"single",notes:null}},
    {setup:{ready:2,total:3}},
    {setup:{connected:false}},
    {setup:{updateCount:0}},
  ]){
    const {db,calls}=mockDb(variant.setup);
    await assert.rejects(()=>resumeGroqWriter(db,variant.params??params));
    if(variant.setup?.code==="writer_http_400")assert.ok(!manualGroqWriterErrors.has("writer_http_400"));
    if(variant.setup?.ready===2)assert.equal(
      calls.some(c=>c.sql.includes("SET status='uploaded'")),false);
  }
});
test("Groq resume route requires GM permission, individual consent and reuses saved notes",async()=>{
  const read=p=>readFile(new URL("../"+p,import.meta.url),"utf8");
  const [route,ui,runner,recovery]=await Promise.all([
    read("app/api/campaigns/[id]/session-recaps/auto-recap/route.ts"),
    read("app/campaigns/session-recap-auto-status.tsx"),
    read("lib/campaigns/recap-groq-final-runner.ts"),
    read("lib/campaigns/recap-only-recovery.ts"),
  ]);
  assert.match(route,/canManageCampaignContent/u);
  assert.match(route,/canResumeGroqWriter/u);
  assert.match(route,/retryGroqWriter===true/u);
  assert.match(route,/acknowledgedPossibleCharge:body.acknowledgedPossibleCharge===true/u);
  assert.match(ui,/Retry Groq writing using saved notes/u);
  assert.match(ui,/GroqCloud Dashboard/u);
  assert.match(ui,/acknowledgedPossibleCharge:true/u);
  assert.match(runner,/requestGroqWriter/u);
  assert.match(runner,/writer_checkpoint_uncertain/u);
  assert.match(recovery,/writer_http_429/u);
  assert.match(recovery,/writer_output_truncated/u);
});

test("successful Groq response is checkpointed with DB-only retry, never a second Groq POST",async()=>{
  const runner=await readFile(new URL("../lib/campaigns/recap-groq-final-runner.ts",import.meta.url),"utf8");
  assert.match(runner,/for\(let attempt=0;attempt<3&&!persisted;attempt\+\+\)/u);
  assert.match(runner,/if\(current\?\.status==="ready"&&current\.markdown===markdown\)/u);
  assert.match(runner,/if\(!persisted\)throw new GroqWriterFailure\("writer_checkpoint_uncertain"\)/u);
  const checkpointSection=runner.split("let persisted=false;")[1].split("if(!persisted)")[0];
  assert.doesNotMatch(checkpointSection,/requestGroqWriter\(/u);
});
