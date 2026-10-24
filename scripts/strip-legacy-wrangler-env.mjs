#!/usr/bin/env node
// Wrangler >=4.135 rejects legacy_env even though true was its old default.
// Vinext can emit the obsolete option in dist/server/wrangler.json.
import {readFileSync,writeFileSync} from "node:fs";
const path="dist/server/wrangler.json";
const config=JSON.parse(readFileSync(path,"utf8"));
let removed=0;
function strip(value){
 if(!value||typeof value!=="object"||Array.isArray(value))return;
 if(Object.hasOwn(value,"legacy_env")){
  if(value.legacy_env!==true)throw new Error("Unexpected legacy_env value in generated Wrangler configuration.");
  delete value.legacy_env;removed++;
 }
 if(value.env&&typeof value.env==="object"){
  for(const env of Object.values(value.env))strip(env);
 }
}
strip(config);
if(removed){writeFileSync(path,JSON.stringify(config,null,2)+"\n");console.log("Removed "+removed+" obsolete legacy_env option(s) from generated Wrangler config.");}
