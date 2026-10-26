import ts from "typescript";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const root=process.cwd();
const roots=["app","lib","worker","db"];
const extensions=/\.(?:ts|tsx|mts|cts)$/;
const excluded=new Set(["node_modules","dist",".next",".git",".wrangler"]);
let count=0, failures=0;
function inspect(directory){
 for(const ent of readdirSync(directory,{withFileTypes:true})){
  if(excluded.has(ent.name))continue;
  const full=join(directory,ent.name);
  if(ent.isDirectory()){inspect(full);continue;}
  if(!ent.isFile()||!extensions.test(ent.name)||ent.name.endsWith(".d.ts"))continue;
  const kind=ent.name.endsWith(".tsx")?ts.ScriptKind.TSX:ts.ScriptKind.TS;
  const source=ts.createSourceFile(full,readFileSync(full,"utf8"),ts.ScriptTarget.Latest,true,kind);
  count++;
  for(const problem of source.parseDiagnostics){
   failures++;
   const position=source.getLineAndCharacterOfPosition(problem.start??0);
   console.error(`${relative(root,full)}:${position.line+1}:${position.character+1}: ${ts.flattenDiagnosticMessageText(problem.messageText," ")}`);
  }
 }
}
for(const dir of roots)inspect(join(root,dir));
if(failures){console.error(`Source syntax preflight failed: ${failures} errors in ${count} files.`);process.exit(1);}
console.log(`Source syntax preflight passed: ${count} files.`);
