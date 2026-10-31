import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATABASE_ID, DATABASE_NAME } from "./d1-admin.mjs";

/** Production migration gate for previously omitted Gemini recap schema.
 * Must be applied in sequence before an API accesses these tables/columns.
 * The provider scheduler remains separately feature-gated.
 */
const migrations = [
  "0040_recap_ai_connections.sql",
  "0041_recap_gemini_background_jobs.sql",
  "0042_recap_gemini_drive_staging.sql",
  "0043_recap_gemini_source_verification.sql",
  "0044_recap_gemini_interaction_polls.sql",
  "0045_recap_gemini_fragment_assembly.sql",
  "0046_recap_gemini_submitted_state.sql",
];
const wrangler = join(process.cwd(), "node_modules/.bin/wrangler");
const environment = {
  ...process.env, WRANGLER_LOG_PATH: ".wrangler/wrangler.log", WRANGLER_WRITE_LOGS: "false",
};
function run(args) {
  return execFileSync(wrangler,args,{
    cwd:process.cwd(),env:environment,encoding:"utf8",stdio:["ignore","pipe","inherit"],
  });
}
function query(sql) {
  const rows=JSON.parse(run(["d1","execute",DATABASE_NAME,"--remote","--config","wrangler.jsonc","--json","--command",sql]));
  if(!Array.isArray(rows)||rows.some(row=>row.success!==true))
    throw new Error("Remote recap schema verification failed.");
  return rows.flatMap(row=>row.results??[]);
}
const info=JSON.parse(run(["d1","info",DATABASE_NAME,"--json","--config","wrangler.jsonc"]));
if(!JSON.stringify(info).includes(DATABASE_ID))
  throw new Error("Production D1 ID mismatch; refusing migration.");
const applied=new Set(query("SELECT name FROM d1_migrations").map(row=>row.name));
for(const name of ["0032_campaign_session_recaps.sql","0034_recap_processing_jobs.sql","0035_recap_user_audio_storage.sql"]){
  if(!applied.has(name))throw new Error("Prerequisite recap migration missing: "+name);
}
const root=mkdtempSync(join(process.cwd(),".recap-gemini-migration-"));
try {
  const dir=join(root,"migrations");
  mkdirSync(dir,{recursive:true});
  writeFileSync(join(root,"wrangler.jsonc"),JSON.stringify({
    name:"wwn-character-sheet",
    d1_databases:[{binding:"DB",database_name:DATABASE_NAME,database_id:DATABASE_ID,migrations_dir:"./migrations"}],
  },null,2));
  for(const name of migrations){
    // The migration CLI only sees this one file. Never ask Wrangler to infer
    // and apply unrelated historical migrations from drizzle.
    if(applied.has(name))continue;
    copyFileSync(join(process.cwd(),"drizzle",name),join(dir,name));
    run(["d1","migrations","apply",DATABASE_NAME,"--remote","--config",join(root,"wrangler.jsonc")]);
    if(!query("SELECT name FROM d1_migrations WHERE name='"+name+"'").length)
      throw new Error("Migration was not recorded: "+name);
    applied.add(name);
  }
} finally {rmSync(root,{recursive:true,force:true});}
for(const name of migrations){
  if(!query("SELECT name FROM d1_migrations WHERE name='"+name+"'").length)
    throw new Error("Recap Gemini schema migration not recorded: "+name);
}
const aiColumns=new Set(query("PRAGMA table_info(user_recap_ai_connections)").map(row=>row.name));
for(const name of ["id","user_id","provider","status","key_ciphertext","key_nonce","key_version","key_fingerprint"]){
  if(!aiColumns.has(name))throw new Error("Gemini credential column missing: "+name);
}
const processingColumns=new Set(query("PRAGMA table_info(campaign_recap_processing_chunks)").map(row=>row.name));
for(const name of ["drive_asset_id","provider_interaction_id","provider_submitted_at","provider_poll_after"]){
  if(!processingColumns.has(name))throw new Error("Gemini processing column missing: "+name);
}
console.log("Gemini recap connection and background schema applied and verified.");
