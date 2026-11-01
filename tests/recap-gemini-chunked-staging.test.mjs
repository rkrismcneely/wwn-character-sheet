import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {stageRecapAudioChunked,RECAP_STAGING_CHUNK_BYTES,
  RECAP_STAGING_CHUNKS_PER_TICK,RecapStagingFailure,
} from "../lib/campaigns/recap-gemini-chunked-staging.ts";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
const MiB=1024*1024;
const sessionUrl="https://generativelanguage.googleapis.com/upload/v1beta/files?upload_id=signed-twe-test";
const job={id:"124e85d7-54e5-4fed-8241-95458b7191a5",requestedBy:"user-one"};
const source={remoteFileId:"drive-audio-123456",byteSize:29*MiB+3,mimeType:"audio/mp4"};
const config={GOOGLE_CLIENT_ID:"test-client-id",GOOGLE_CLIENT_SECRET:"test-client-secret",
  RECAP_STORAGE_ENCRYPTION_KEY:Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url")};
function simulate(){
  const row={stageUrlCiphertext:null,stageUrlNonce:null,stageUrlVersion:null,stageOffset:0,status:"transferring",fileUri:null,fileName:null};
  const history={offsets:[],driveRanges:[],started:0,queries:0,finals:0};
  const db={prepare(sql){
    return {bind(...args){return {
      async first(){
        if(!sql.includes("stage_url_ciphertext AS stageUrlCiphertext"))throw Error("unknown SELECT "+sql);
        return {...row};
      },
      async run(){
        if(sql.includes("AND stage_url_ciphertext IS NULL")){
          assert.equal(row.stageUrlCiphertext,null);
          Object.assign(row,{stageUrlCiphertext:args[0],stageUrlNonce:args[1],
            stageUrlVersion:args[2],stageOffset:0});
        }else if(sql.includes("SET status='uploaded'")){
          assert.equal(args.at(-1),job.id);
          Object.assign(row,{status:"uploaded",fileUri:args[0],fileName:args[1],
            stageUrlCiphertext:null,stageUrlNonce:null,stageUrlVersion:null,stageOffset:args[2]});
          history.finals++;
        }else if(sql.includes("SET stage_offset=?")){
          assert.equal(row.stageOffset,args.at(-1));
          row.stageOffset=args[0];
        }else throw Error("Unknown UPDATE "+sql);
        return {meta:{changes:1}};
      },
    };}};
  }};
  return {env:{...config,DB:db},row,history};
}
function responseFor(s){
  return async(url,opts)=>{
    if(url==="https://generativelanguage.googleapis.com/upload/v1beta/files"){
      assert.equal(opts.headers["x-goog-api-key"],"private-test-key");
      s.history.started++;
      return new Response(null,{status:200,headers:{"x-goog-upload-url":sessionUrl,
        "x-goog-upload-chunk-granularity":String(256*1024)}});
    }
    if(url===sessionUrl){
      // Google official SDK authenticates all resumable upload operations.
      assert.equal(opts.headers["x-goog-api-key"],"private-test-key");
      if(opts.headers["x-goog-upload-command"]==="query"){
        s.history.queries++;
        return new Response(null,{status:200,headers:{"x-goog-upload-size-received":String(s.row.stageOffset),
          "x-goog-upload-status":"active"}});
      }
      assert.equal(opts.headers["content-type"],"application/json");
      const count=opts.body.byteLength;
      assert.ok(count<=RECAP_STAGING_CHUNK_BYTES);
      const offset=Number(opts.headers["x-goog-upload-offset"]);
      s.history.offsets.push({offset,count});
      if(opts.headers["x-goog-upload-command"]==="upload, finalize")
        return Response.json({file:{name:"files/audio0001",
          uri:"https://generativelanguage.googleapis.com/v1beta/files/audio0001"}},
          {headers:{"x-goog-upload-status":"final"}});
      return new Response(null,{status:200,headers:{"x-goog-upload-status":"active"}});
    }
    if(String(url).startsWith("https://www.googleapis.com/drive/v3/files/")){
      const r=/^bytes=(\d+)-(\d+)$/u.exec(opts.headers.range);
      assert.ok(r);const start=Number(r[1]),end=Number(r[2]);
      s.history.driveRanges.push([start,end]);
      return new Response(new Uint8Array(end-start+1),{status:206,headers:{
        "content-range":"bytes "+start+"-"+end+"/"+source.byteSize,
        "content-length":String(end-start+1),
      }});
    }
    throw Error("unexpected fetch "+url);
  };
}
test("GM-owned audio stages in bounded fixed-length chunks, with encrypted URL and durable offset",async()=>{
  const s=simulate();
  const original=globalThis.fetch;globalThis.fetch=responseFor(s);
  try{
    const once=await stageRecapAudioChunked(s.env,job,"private-test-key",source,"fake-drive-bearer");
    assert.deepEqual(once,{done:false,bytes:RECAP_STAGING_CHUNK_BYTES*RECAP_STAGING_CHUNKS_PER_TICK,
      total:source.byteSize});
    assert.equal(s.row.stageOffset,24*MiB);
    assert.equal(RECAP_STAGING_CHUNK_BYTES,8*MiB);
    assert.equal(RECAP_STAGING_CHUNKS_PER_TICK,3);
    assert.equal(s.history.offsets.length,3);
    assert.ok(s.row.stageUrlCiphertext);
    assert.ok(!s.row.stageUrlCiphertext.includes("signed-twe-test"));
    const second=await stageRecapAudioChunked(s.env,job,"private-test-key",source,"fake-drive-bearer");
    assert.deepEqual(second,{done:true,bytes:source.byteSize,total:source.byteSize});
    assert.equal(s.history.started,1);
    assert.equal(s.history.queries,1);
    assert.equal(s.row.status,"uploaded");
    assert.equal(s.row.stageUrlCiphertext,null);
    assert.equal(s.row.fileName,"files/audio0001");
    assert.equal(s.history.offsets.at(-1).offset+s.history.offsets.at(-1).count,source.byteSize);
  }finally{globalThis.fetch=original;}
});
test("mismatch in Drive Range is refused before any bytes go to Gemini",async()=>{
  const s=simulate();const base=responseFor(s);
  const original=globalThis.fetch;globalThis.fetch=async(url,opts)=>{
    if(String(url).startsWith("https://www.googleapis.com/drive/v3/files/"))
      return new Response(new Uint8Array(10),{status:200});
    return base(url,opts);
  };
  try{
    await assert.rejects(()=>stageRecapAudioChunked(s.env,job,"private-test-key",source,"fake-token"),
      e=>e instanceof RecapStagingFailure&&e.code==="drive_range_unavailable");
    assert.equal(s.history.offsets.length,0);
  }finally{globalThis.fetch=original;}
});
test("Gemini resumable session enforces provider-advertised upload chunk granularity",async()=>{
  const original=globalThis.fetch;
  const s=simulate(),base=responseFor(s);
  let uploaded=0;
  globalThis.fetch=async(url,opts)=>{
    if(url==="https://generativelanguage.googleapis.com/upload/v1beta/files")
      return new Response(null,{status:200,headers:{
        "x-goog-upload-url":sessionUrl,"x-goog-upload-chunk-granularity":String(16*MiB),
      }});
    if(url===sessionUrl&&opts.headers["x-goog-upload-command"]!=="query")uploaded++;
    return base(url,opts);
  };
  try{
    await assert.rejects(
      ()=>stageRecapAudioChunked(s.env,job,"private-test-key",source,"fake-token"),
      e=>e instanceof RecapStagingFailure&&e.code==="gemini_chunk_granularity_mismatch");
    assert.equal(uploaded,0);
    assert.equal(s.row.stageUrlCiphertext,null);
    assert.equal(s.row.stageOffset,0);
  }finally{globalThis.fetch=original;}
});

test("an unacknowledged chunk does not advance TWE's recorded bytes",async()=>{
  const state=simulate(),original=globalThis.fetch,base=responseFor(state);
  globalThis.fetch=async(url,opts)=>{
    if(url===sessionUrl&&opts.headers["x-goog-upload-command"]==="upload")
      return new Response(null,{status:200});
    return base(url,opts);
  };
  try{
    await assert.rejects(()=>stageRecapAudioChunked(
      state.env,job,"private-test-key",source,"private-drive-bearer"),
      e=>e instanceof RecapStagingFailure&&e.code==="gemini_upload_offset_unknown");
    assert.equal(state.row.stageOffset,0);
  }finally{globalThis.fetch=original;}
});
test("a lost final upload receipt can recover the exact job's completed Gemini file",async()=>{
  const state=simulate();
  const original=globalThis.fetch,base=responseFor(state);
  let finalAccepted=false,queryCount=0,listed=0;
  globalThis.fetch=async(url,opts)=>{
    if(url===sessionUrl&&opts.headers["x-goog-upload-command"]==="query"){
      queryCount++;
      if(finalAccepted)return new Response(null,{status:200,headers:{
        "x-goog-upload-status":"final",
        "x-goog-upload-size-received":String(source.byteSize),
      }});
      return base(url,opts);
    }
    if(url===sessionUrl&&opts.headers["x-goog-upload-command"]==="upload, finalize"){
      finalAccepted=true;
      throw Error("Connection terminated after provider accepted final chunk");
    }
    if(String(url).startsWith("https://generativelanguage.googleapis.com/v1beta/files?")){
      listed++;return Response.json({files:[{
        displayName:"TWE recap "+job.id,sizeBytes:String(source.byteSize),
        mimeType:"audio/m4a",name:"files/audio0001",
        uri:"https://generativelanguage.googleapis.com/v1beta/files/audio0001",
      }]});
    }
    return base(url,opts);
  };
  try{
    const initial=await stageRecapAudioChunked(state.env,job,"private-test-key",source,"private-drive-bearer");
    assert.equal(initial.done,false);
    await assert.rejects(()=>stageRecapAudioChunked(state.env,job,"private-test-key",source,"private-drive-bearer"),
      e=>e instanceof RecapStagingFailure&&e.code==="gemini_chunk_network_error");
    assert.equal(state.row.stageOffset,24*MiB);
    const restored=await stageRecapAudioChunked(state.env,job,"private-test-key",source,"private-drive-bearer");
    assert.equal(restored.done,true);
    assert.equal(state.row.status,"uploaded");
    assert.equal(state.row.fileName,"files/audio0001");
    assert.equal(state.history.started,1);
    assert.ok(queryCount>0&&listed===1);
  }finally{globalThis.fetch=original;}
});
test("Gemini HTTP chunk rejections preserve only safe status codes; never expose provider secrets",async()=>{
  const original=globalThis.fetch;
  try{
    for(const [status,expected] of [
      [400,"gemini_chunk_http_400"],[401,"gemini_chunk_http_401"],
      [403,"gemini_chunk_http_403"],[404,"gemini_chunk_http_404"],
      [409,"gemini_chunk_http_409"],[413,"gemini_chunk_http_413"],
      [429,"gemini_chunk_http_429"],[500,"gemini_chunk_http_500"],
      [503,"gemini_chunk_http_503"],[422,"gemini_chunk_rejected"],
    ]){
      const state=simulate();
      const base=responseFor(state);
      globalThis.fetch=async(url,opts)=>{
        if(url===sessionUrl&&opts.headers["x-goog-upload-command"]!=="query"){
          assert.equal(opts.headers["x-goog-api-key"],"private-test-key");
          return Response.json({error:{message:"SECRET_GOOGLE_ERROR_BODY"}},
            {status,headers:{"x-goog-upload-status":"active"}});
        }
        return base(url,opts);
      };
      await assert.rejects(
        ()=>stageRecapAudioChunked(state.env,job,"private-test-key",source,"fake-drive-bearer"),
        error=>{
          assert.ok(error instanceof RecapStagingFailure);
          assert.equal(error.code,expected);
          assert.doesNotMatch(error.message,/SECRET_GOOGLE_ERROR_BODY|signed-twe-test|private-test-key/u);
          return true;
        });
      assert.equal(state.row.status,"transferring");
      assert.equal(state.row.stageOffset,0);
    }
  }finally{globalThis.fetch=original;}
});

test("migration, cron and status all retain stage state while protecting private URLs",async()=>{
  const [runner,sql,workflow,route,ui]=await Promise.all([
    read("lib/campaigns/recap-only-runner.ts"),
    read("drizzle/0050_recap_gemini_resumable_staging.sql"),
    read(".github/workflows/migrate-session-recaps.yml"),
    read("app/api/campaigns/[id]/session-recaps/auto-recap/route.ts"),
    read("app/campaigns/session-recap-auto-status.tsx"),
  ]);
  assert.match(runner,/stageRecapAudioChunked\(env,job,secret,source,drive\)/u);
  assert.match(runner,/status='transferring' AND claimed_at<\?/u);
  assert.match(runner,/error_code='provider_or_storage_error',stage_error_code=\?/u);
  assert.doesNotMatch(runner,/body:media\.body/u);
  assert.match(sql,/stage_url_ciphertext/u);
  assert.match(sql,/stage_error_code/u);
  assert.match(workflow,/node scripts\/migrate-recap-resumable-staging\.mjs/u);
  assert.ok(workflow.indexOf("node scripts/migrate-recap-resumable-staging.mjs")<
    workflow.indexOf("npx wrangler deploy"));
  assert.match(route,/stage_offset AS stageBytes/u);
  assert.match(route,/stage_error_code AS stageErrorCode/u);
  assert.match(route,/const safeJobs=rows\.results\.map\(\(\{fileUri,fileName,interactionId,\.\.\.job\}\)/u);
  assert.match(ui,/recapStageDescriptions/u);
  // Progress now lives in a dedicated component with a tested byte-progress
  // helper, rather than inline arithmetic in the parent status panel.
  assert.match(ui,/<SessionRecapProgress job=\{newest\}\/>/u);
  const progress=await read("lib/campaigns/recap-progress.ts");
  assert.match(progress,/bytes\*100\/total/u);
});

test("a virtual audio segment prepends a WAV header and reads only its original Drive byte range",async()=>{
  const state=simulate(),base=responseFor(state);
  const original=globalThis.fetch;
  const header=new Uint8Array(44);
  header.set([82,73,70,70],0); // RIFF
  header.set([87,65,86,69],8); // WAVE
  const cut={...source,mimeType:"audio/wav",byteSize:2*MiB+44,
    segment:{sourceStart:4*MiB,sourceEnd:6*MiB,originalBytes:source.byteSize,prefix:header}};
  let uploaded:null|Uint8Array=null;
  globalThis.fetch=async(url,opts)=>{
    if(url===sessionUrl&&opts.headers["x-goog-upload-command"]==="upload, finalize"){
      uploaded=opts.body;
    }
    return base(url,opts);
  };
  try{
    const result=await stageRecapAudioChunked(state.env,job,"private-test-key",cut,"private-drive-bearer");
    assert.deepEqual(result,{done:true,bytes:cut.byteSize,total:cut.byteSize});
    assert.deepEqual(state.history.driveRanges,[[4*MiB,6*MiB-1]]);
    assert.ok(uploaded);
    assert.deepEqual([...uploaded.subarray(0,44)],[...header]);
    assert.equal(uploaded.byteLength,2*MiB+44);
    assert.equal(state.row.status,"uploaded");
  }finally{globalThis.fetch=original;}
});

