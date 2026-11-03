import {execFileSync} from "node:child_process";
import {copyFileSync,mkdirSync,mkdtempSync,rmSync,writeFileSync} from "node:fs";
import {join} from "node:path";
import {DATABASE_ID,DATABASE_NAME} from "./d1-admin.mjs";

const migrations=["0053_recap_writer_preferences.sql","0054_recap_groq_connections.sql",
 "0055_recap_saved_audio_notes.sql","0056_recap_groq_writer_checkpoints.sql",
 "0057_recap_auto_retry_consent.sql","0058_recap_single_audio_recovery.sql"];
const wrangler=join(process.cwd(),"node_modules/.bin/wrangler");
const environment={...process.env,WRANGLER_LOG_PATH:".wrangler/wrangler.log",WRANGLER_WRITE_LOGS:"false"};
const run=args=>execFileSync(wrangler,args,{cwd:process.cwd(),env:environment,
 encoding:"utf8",stdio:["ignore","pipe","inherit"],maxBuffer:32*1024*1024});
function query(sql){
 const data=JSON.parse(run(["d1","execute",DATABASE_NAME,"--remote","--config",
  "wrangler.jsonc","--json","--command",sql]));
 if(!Array.isArray(data)||data.some(row=>row.success!==true))
  throw Error("Remote D1 query failed.");
 return data.flatMap(row=>row.results??[]);
}
const info=JSON.parse(run(["d1","info",DATABASE_NAME,"--json","--config","wrangler.jsonc"]));
if(!JSON.stringify(info).includes(DATABASE_ID))throw Error("Production D1 identity mismatch.");
const applied=new Set(query("SELECT name FROM d1_migrations").map(row=>row.name));
if(!applied.has("0052_recap_long_audio_segments.sql"))
 throw Error("Apply previous recap migrations before Groq writer migrations.");
for(const migration of migrations){
 if(applied.has(migration))continue;
 const folder=mkdtempSync(join(process.cwd(),".recap-writer-migration-"));
 try{
  const dir=join(folder,"migrations");
  mkdirSync(dir,{recursive:true});
  copyFileSync(join(process.cwd(),"drizzle",migration),join(dir,migration));
  const config=join(folder,"wrangler.jsonc");
  writeFileSync(config,JSON.stringify({name:"wwn-character-sheet",
    d1_databases:[{binding:"DB",database_name:DATABASE_NAME,database_id:DATABASE_ID,
      migrations_dir:"./migrations"}]}));
  run(["d1","migrations","apply",DATABASE_NAME,"--remote","--config",config]);
 }finally{rmSync(folder,{recursive:true,force:true});}
 applied.add(migration);
}
const verified=new Set(query("SELECT name FROM d1_migrations").map(row=>row.name));
for(const migration of migrations)if(!verified.has(migration))throw Error("Migration missing: "+migration);
const prefs=new Set(query("PRAGMA table_info(user_recap_auto_preferences)").map(row=>row.name));
const jobs=new Set(query("PRAGMA table_info(campaign_recap_audio_summary_jobs)").map(row=>row.name));
if(!prefs.has("writer_model")||!jobs.has("audio_notes")||!jobs.has("auto_retry_opt_in")||!jobs.has("audio_analysis_model")||
    !jobs.has("single_audio_retry_count")||!jobs.has("audio_retry_not_before"))throw Error("Writer columns not found.");
for(const table of ["user_recap_groq_connections","campaign_recap_groq_writer_parts"])
 if(!query("SELECT name FROM sqlite_master WHERE type='table' AND name='"+table+"'").length)
  throw Error("Writer table missing: "+table);
console.log("Groq writer migrations 0053–0058 applied and verified.");
