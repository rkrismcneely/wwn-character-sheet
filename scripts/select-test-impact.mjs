#!/usr/bin/env node
// Fail-safe test impact selection. Run all tests when dependency analysis is uncertain.
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";


/**
 * Pre-PR maintenance audit: runs quickly and prints tests that reference a
 * changed component or an exact string removed from a source file.
 * Advisory only: actual test failures remain the authoritative CI gate.
 * Usage: node scripts/select-test-impact.mjs --audit [--run]
 */
if (process.argv.includes("--audit")) {
 const run=process.argv.includes("--run");
 let compare=process.env.BASE_SHA;
 if (!compare) {
  try {compare=execFileSync("git",["merge-base","HEAD","origin/main"],{encoding:"utf8"}).trim();}
  catch {try{compare=execFileSync("git",["merge-base","HEAD","main"],{encoding:"utf8"}).trim();}catch{console.error("No base commit found; run after fetching main, or set BASE_SHA.");process.exit(2);}}
 }
 const modified=execFileSync("git",["diff","--name-only",compare,"HEAD"],{encoding:"utf8"}).trim().split("\n").filter(Boolean);
 const sources=modified.filter(f=>/^(app|components|lib|worker)\/.*\.(?:tsx?|jsx?|css)$/.test(f));
 const tests=readdirSync("tests").filter(f=>f.endsWith(".test.mjs")).map(f=>"tests/"+f);
 const affected=new Set(modified.filter(f=>f.startsWith("tests/")&&f.endsWith(".test.mjs")));
 const flagged=[];
 for (const source of sources) {
  const name=path.basename(source).replace(/\.(?:tsx?|jsx?|css)$/,"");
  const oldName=name.replace(/[-_]/g,"");
  const diff=execFileSync("git",["diff","--unified=0",compare,"HEAD","--",source],{encoding:"utf8"});
  const removed=diff.split("\n").filter(line=>line.startsWith("-")&&!line.startsWith("---"))
   .map(line=>line.slice(1)).filter(line=>line.length>=8);
  const removedText=removed.join("\n");
  for(const file of tests){
   const body=readFileSync(file,"utf8");
   const compact=body.replace(/[-_]/g,"");
   const references=body.includes(name)||compact.includes(oldName)||body.includes(source);
   if(references) affected.add(file);
   // Detect required source identifiers removed by the patch, including regex
   // escaped assertions such as /visibleEncounterCount = Math.max.../.
   const currentSource=existsSync(source)?readFileSync(source,"utf8"):"";
   const removedIdentifiers=[...new Set(removed.flatMap(text=>[...text.matchAll(/\b[A-Za-z_$][\w$]{9,}\b/g)].map(match=>match[0])))];
   const oldRequired=body.split("\n").filter(line=>/assert\.match\(/.test(line));
   for(const line of oldRequired){
    for(const identifier of removedIdentifiers){
     if(!currentSource.includes(identifier)&&line.includes(identifier)){
      affected.add(file);
      flagged.push(file+" requires removed identifier "+identifier+" from "+source);
     }
    }
   }
   // Check whether the test still requires exact text that the patch removed.
   const assertionLines=body.split("\n").filter(line=>/assert\.(?:match|equal|ok)/.test(line));
   for(const line of assertionLines){
    if(removed.some(text=>{
     const quoted=[...text.matchAll(/["']([^"']{7,})["']/g)].map(m=>m[1]);
     const textTokens=[...line.matchAll(/([A-Za-z][A-Za-z ]{8,})/g)].map(m=>m[1].trim());
     const pixelTokens=[...line.matchAll(/\d{2,4}px/g)].map(m=>m[0]);
     return quoted.some(value=>line.includes(value))
       || textTokens.some(value=>value.includes(" ")&&removedText.includes(value))
       || pixelTokens.some(value=>removedText.includes(value));
    })){
     affected.add(file);
     flagged.push(file+" may expect removed source text from "+source+": "+line.trim().slice(0,160));
    }
   }
  }
 }
 console.log("Changed implementation files: "+sources.length);
 console.log("Likely affected tests: "+affected.size);
 for(const file of [...affected].sort())console.log("  "+file);
 for(const warning of [...new Set(flagged)])console.warn("REVIEW: "+warning);
 if(run&&affected.size){
  const focused=[...affected].filter(file=>file!=="tests/rendered-html.test.mjs").sort();
  if(!focused.length){console.log("Affected tests require the built Worker and run in Production build and tests.");process.exit(0);}
  const command=["--experimental-strip-types","--test",...focused];
  console.log("Running targeted tests before PR...");
  try{execFileSync("node",command,{stdio:"inherit"});}catch{process.exit(1);}
 }
 process.exit(0);
}

const base = process.env.BASE_SHA;
const full = (reason) => { console.log("mode=full");console.log("reason="+reason); };
if (process.env.GITHUB_EVENT_NAME !== "pull_request" || !/^[a-f0-9]{40}$/i.test(base||"")) { full("non-PR or unknown base");process.exit(0); }
let changed;
try { changed=execFileSync("git",["diff","--name-only",base,"HEAD"],{encoding:"utf8"}).trim().split("\n").filter(Boolean); }
catch {full("git diff unavailable");process.exit(0);}
if (!changed.length) {full("no changed files");process.exit(0);}
// Any executable, configuration, library, auth, test, or workflow change gets all tests.
// Presentation-only source changes are tested by determining imports into the tests.
if (changed.some(f => !(/^(app|components)\/.*\.(tsx|jsx|css)$/.test(f) || /^public\//.test(f) || /\.md$/.test(f)))) {full("high-impact or unknown files");process.exit(0);}
if (changed.some(f=> /\.(tsx|jsx)$/.test(f))) {full("component behavior may affect shared consumers");process.exit(0);}
// CSS and static assets have no executable dependencies; retain mandatory build, typecheck, lint,
// and worker smoke tests but skip expensive unrelated source tests.
console.log("mode=appearance");
console.log("reason=styles and static assets only");
