import test from "node:test";
import assert from "node:assert/strict";
import { saveJournalEditorDraft } from "../lib/campaigns/journal-editor-save.ts";
import { mayLinkImportedAssets } from "../lib/campaigns/journal-import-retry.ts";

const draft=(content)=>({title:"Field Notes",content,visibility:"players",icon:"file-text"});
const response=(entry)=>({ok:true,json:async()=>({entry})});
test("new page with attachment stays GM-only until upload and final save",async()=>{
 const calls=[],created=[];
 const attachments=new Map([["blob:test",{file:new File(["image"],"map.png")}]]); 
 const request=async (url,options)=>{
  calls.push({url,method:options.method,body:options.method==="POST"&&String(url).endsWith("/files")?null:JSON.parse(options.body)});
  if(String(url).endsWith("/files"))return {ok:true,json:async()=>({id:"asset1"})};
  return response({id:"entry1",kind:"page",parentId:null,...JSON.parse(options.body)});
 };
 const saved=await saveJournalEditorDraft({endpoint:"/journal",id:"",kind:"page",parentId:null,draft:draft("![map](blob:test)"),attachments,onCreated:e=>created.push(e),request});
 assert.equal(calls[0].method,"POST");
 assert.equal(calls[0].body.visibility,"gm");
 assert.equal(calls[0].body.content.includes("blob:"),false);
 assert.equal(calls.at(-1).method,"PATCH");
 assert.equal(calls.at(-1).body.visibility,"players");
 assert.match(saved.content,/\/journal\/files\/asset1/);
 assert.equal(created.length,1);
});
test("failed attachment upload does not expose staged new page and retry reuses uploaded files",async()=>{
 const calls=[],created=[];
 const attachments=new Map([["blob:first",{file:new File(["a"],"a.png")}],["blob:second",{file:new File(["b"],"b.png")}]]);
 let fail=true,uploads=0;
 const request=async(url,options)=>{
  calls.push({url,method:options.method,body:options.method==="POST"&&String(url).endsWith("/files")?null:JSON.parse(options.body)});
  if(String(url).endsWith("/files")){uploads++;if(fail&&uploads===2)return {ok:false,json:async()=>({error:"upload unavailable"})};return {ok:true,json:async()=>({id:"asset"+uploads})};}
  return response({id:"entry1",kind:"page",parentId:null,...JSON.parse(options.body)});
 };
 const options={endpoint:"/journal",id:"",kind:"page",parentId:null,draft:draft("![a](blob:first) ![b](blob:second)"),attachments,onCreated:e=>created.push(e),request};
 await assert.rejects(saveJournalEditorDraft(options),/upload unavailable/);
 assert.equal(calls.filter(x=>x.method==="PATCH").length,0);
 assert.equal(created[0].visibility,"gm");
 fail=false;
 const saved=await saveJournalEditorDraft({...options,id:created[0].id});
 assert.equal(uploads,3);
 assert.match(saved.content,/asset1/);
 assert.match(saved.content,/asset3/);
});
test("edited imported pages are not rewritten by import retry",()=>{
 assert.equal(mayLinkImportedAssets("import original","GM revisions"),false);
 assert.equal(mayLinkImportedAssets("import original","linked assets","linked assets"),true);
 assert.equal(mayLinkImportedAssets("import original","GM revisions","linked assets"),false);
});

test("a failed final save does not report a successful attachment publication",async()=>{
 const attachments=new Map([["blob:map",{file:new File(["map"],"map.png")}]]);
 let published=false;
 const request=async(url,options)=>{
  if(String(url).endsWith("/files"))return {ok:true,json:async()=>({id:"asset1"})};
  if(options.method==="PATCH")return {ok:false,json:async()=>({error:"save interrupted"})};
  return response({id:"draft1",kind:"page",parentId:null,...JSON.parse(options.body)});
 };
 await assert.rejects(saveJournalEditorDraft({endpoint:"/journal",id:"",kind:"page",parentId:null,draft:draft("![map](blob:map)"),attachments,onCreated:()=>{},request}).then(()=>{published=true}),/save interrupted/);
 assert.equal(published,false);
});
