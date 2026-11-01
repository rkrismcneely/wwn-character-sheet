import {execFileSync} from "node:child_process";
import {copyFileSync,mkdirSync,mkdtempSync,rmSync,writeFileSync} from "node:fs";
import {join} from "node:path";
import {DATABASE_ID,DATABASE_NAME} from "./d1-admin.mjs";

// Only additive D1 changes; validate the production database before writing.
const migrationName="0052_recap_long_audio_segments.sql";
const wrangler=join(process.cwd(),"node_modules/.bin/wrangler");
const env={...process.env,WRANGLER_LOG_PATH:".wrangler/wrangler.log",WRANGLER_WRITE_LOGS:"false"};
const run=args=>execFileSync(wrangler,args,{
  cwd:process.cwd(),env,encoding:"utf8",stdio:["ignore","pipe","inherit"],
});
const query=sql=>{
  const data=JSON.parse(run(["d1","execute",DATABASE_NAME,"--remote",
    "--config","wrangler.jsonc","--json","--command",sql]));
  if(!Array.isArray(data)||data.some(row=>row.success!==true))
    throw new Error("Remote D1 check failed.");
  return data.flatMap(row=>row.results??[]);
};
const info=JSON.parse(run(["d1","info",DATABASE_NAME,"--json","--config","wrangler.jsonc"]));
if(!JSON.stringify(info).includes(DATABASE_ID))
  throw new Error("Production database ID does not match; migration aborted.");
const applied=new Set(query("SELECT name FROM d1_migrations").map(row=>row.name));
for(const required of ["0050_recap_gemini_resumable_staging.sql","0051_recap_repeatable_summary_jobs.sql"]){
  if(!applied.has(required))throw new Error("Required earlier migration not applied: "+required);
}
if(!applied.has(migrationName)){
  const folder=mkdtempSync(join(process.cwd(),".recap-audio-parts-migration-"));
  try{
    const migrations=join(folder,"migrations");
    mkdirSync(migrations,{recursive:true});
    copyFileSync(join(process.cwd(),"drizzle",migrationName),join(migrations,migrationName));
    const config=join(folder,"wrangler.jsonc");
    writeFileSync(config,JSON.stringify({
      name:"wwn-character-sheet",
      d1_databases:[{binding:"DB",database_name:DATABASE_NAME,
        database_id:DATABASE_ID,migrations_dir:"./migrations"}],
    }));
    run(["d1","migrations","apply",DATABASE_NAME,"--remote","--config",config]);
  }finally{rmSync(folder,{recursive:true,force:true});}
}
if(!new Set(query("SELECT name FROM d1_migrations").map(row=>row.name)).has(migrationName))
  throw new Error("Long-audio migration not recorded.");
if(!query("PRAGMA table_info(campaign_recap_audio_summary_jobs)")
  .some(row=>row.name==="processing_mode"))
  throw new Error("Existing recap jobs are missing processing_mode.");
const columns=new Set(query("PRAGMA table_info(campaign_recap_audio_summary_segments)").map(row=>row.name));
for(const column of ["job_id","segment_index","start_ms","end_ms","source_start",
  "source_end","file_uri","file_name","interaction_id","notes","stage_offset"]){
  if(!columns.has(column))throw new Error("Audio segment table missing "+column);
}
console.log("Long-session segmentation migration applied and verified.");
