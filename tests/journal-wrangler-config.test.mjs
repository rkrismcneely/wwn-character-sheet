import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const build=readFileSync(new URL("../scripts/build-verified.sh",import.meta.url),"utf8");
const strip=readFileSync(new URL("../scripts/strip-legacy-wrangler-env.mjs",import.meta.url),"utf8");
test("production build normalizes unsupported legacy_env before tests and artifact validation",()=>{
 assert.ok(build.indexOf("strip-legacy-wrangler-env.mjs")>build.indexOf("vinext"));
 assert.ok(build.indexOf("strip-legacy-wrangler-env.mjs")<build.indexOf("validate-artifact.sh"));
 assert.match(strip,/value\.legacy_env!==true/u);
 assert.match(strip,/delete value\.legacy_env/u);
});
