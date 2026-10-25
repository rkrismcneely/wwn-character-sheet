import test from "node:test";
import assert from "node:assert/strict";
import { createJournalMarkdownManager, initialJournalDocument } from "../lib/campaigns/journal-editor-extensions.ts";
import { visualSecretIssue, journalTemplates, safeEditorLink, journalSecretMarkersBalanced } from "../lib/campaigns/journal-editor-format.ts";
import { saveJournalEditorDraft } from "../lib/campaigns/journal-editor-save.ts";
import { editableJournalProperties,writeJournalProperties } from "../lib/campaigns/journal-editor-properties.ts";
import { parseJournalLayout } from "../lib/campaigns/journal-layout.ts";
import { readFileSync } from "node:fs";
import { convertLegendKeeperNative } from "../lib/campaigns/legendkeeper-convert.ts";
import { extractObsidianZip } from "../lib/campaigns/journal-zip.ts";
import { resolveJournalWikilinks } from "../lib/campaigns/journal-links.ts";
import { markdownTextEntities } from "../lib/markdown-entities.ts";

function nodes(document) { return [document, ...(document.content ?? []).flatMap(nodes)]; }
const manager = () => createJournalMarkdownManager();

test("visual content preserves headings, emphasis, lists, tables and hard breaks", () => {
  const m=manager(), source="## Example\n\n**Armor** 12  \n**Health** 20\n\n- First\n- Second\n\n| Stat | Value |\n| --- | --- |\n| STR | 12 |";
  const doc=initialJournalDocument(m,source), all=nodes(doc);
  for(const type of ["heading","bulletList","table","hardBreak"]) assert.ok(all.some(node=>node.type===type),type);
  const saved=m.serialize(doc), again=m.parse(saved);
  assert.ok(saved.includes("Example"));assert.ok(saved.includes("Health"));assert.ok(saved.includes("STR"));
  assert.equal(nodes(again).filter(node=>node.type==="tableCell").length,2);
});

test("horizontal rules around stat blocks cannot turn a table into frontmatter",()=>{
 const m=manager(),source="---\n\n**Armor:** 12\n\n| STR | DEX |\n| --- | --- |\n| 10 | 12 |\n\n**Spellcasting.** Knows: Light\n\n---\n\nAfter";
 const first=initialJournalDocument(m,source),saved=m.serialize(first),again=initialJournalDocument(m,saved);
 assert.equal(nodes(first).filter(node=>node.type==="table").length,1);
 assert.equal(nodes(again).filter(node=>node.type==="table").length,1);
});

test("legacy bold labels with internal trailing spaces retain emphasis; encoded text remains text",()=>{
 const m=manager(),doc=initialJournalDocument(m,"> [!NOTE]\n> **GENDER: **Male"),saved=m.serialize(doc);
 assert.ok(nodes(doc).some(node=>node.text==="GENDER:"&&node.marks?.some(mark=>mark.type==="bold")));
 assert.ok(saved.includes("**GENDER:** Male"));
 assert.equal(markdownTextEntities("A &amp; B"),"A & B");
 assert.equal(markdownTextEntities("&lt;script&gt;"),"<script>");
 assert.equal(markdownTextEntities("&#x1F409;"),"🐉");
 assert.equal(markdownTextEntities("&amp;lt;"),"&lt;");
});

test("columns, callouts, images and wiki links survive visual round trips", () => {
  const m=manager();
  const source='<div data-layout-section="true">\n<div data-layout-column="true" data-column-width="66.66">\n\n## Example\n\n[[Places/Harbour|Harbour]]\n\n</div>\n<div data-layout-column="true" data-column-width="33.33">\n\n![Portrait](https://assets.legendkeeper.com/example.png "Attachment")\n\n> [!NOTE]\n> **Role:** Guide\n\n</div>\n</div>';
  const doc=initialJournalDocument(m,source), all=nodes(doc);
  assert.equal(all.filter(node=>node.type==="journalColumn").length,2);
  assert.equal(all.filter(node=>node.type==="journalCallout").length,1);
  assert.equal(all.filter(node=>node.type==="image").length,1);
  const saved=m.serialize(doc), again=m.parse(saved);
  assert.ok(saved.includes('data-column-width="66.66"'));
  assert.ok(saved.includes("[[Places/Harbour|Harbour]]"));assert.ok(saved.includes("[!NOTE]"));
  assert.equal(nodes(again).filter(node=>node.type==="journalColumn").length,2);
  assert.equal(nodes(again).filter(node=>node.type==="image").length,1);
});

test("GM-only boundaries survive nested visual edits; malformed boundaries remain protected source", () => {
  const m=manager(), source="Public\n\n<!-- gm-only:start -->\nHidden clue\n\n<!-- gm-only:start -->\nNested clue\n<!-- gm-only:end -->\n<!-- gm-only:end -->\n\nAfter";
  const doc=initialJournalDocument(m,source);
  assert.equal(nodes(doc).filter(node=>node.type==="journalSecret").length,2);
  const saved=m.serialize(doc);
  assert.equal((saved.match(/gm-only:start/gu)??[]).length,2);
  assert.equal((saved.match(/gm-only:end/gu)??[]).length,2);
  assert.ok(saved.includes("Hidden clue"));assert.equal(visualSecretIssue(saved),false);
  for(const malformed of ["<!-- gm-only:start -->\nSecret", "<!-- gm-only:end -->\nSecret", "Text <!-- gm-only:start --> Secret <!-- gm-only:end -->"]){
    const protectedDoc=initialJournalDocument(m,malformed);
    assert.equal(protectedDoc.content[0].type,"journalPreserved");assert.equal(protectedDoc.content[0].attrs.source,malformed);
    assert.equal(m.serialize(protectedDoc).trim(),malformed.trim());
  }
});

test("unknown HTML and imported properties retain their source without becoming executable content", () => {
  const m=manager();
  for(const source of ['<script>alert("bad")</script>','<div onclick="bad()">Unusual content</div>','---\nRole: "Guide"\nSession:\n  - S17\n---\n']) {
    const doc=initialJournalDocument(m,source);
    assert.equal(doc.content[0].type,"journalPreserved");
    assert.equal(m.serialize(doc).trim(),source.trim());
  }
  for(const href of ["javascript:alert(1)","data:text/html,bad","https://user:pass@example.test/"])assert.equal(safeEditorLink(href),false);
  assert.equal(safeEditorLink("https://example.test/"),true);
});

test("starter templates parse into editable documents with preserved layouts and secret blocks", () => {
  const m=manager();
  for(const [name,source] of Object.entries(journalTemplates)) {
    const doc=initialJournalDocument(m,source);
    assert.ok(doc.content?.length,name);
    if(name==="character")assert.equal(nodes(doc).filter(node=>node.type==="journalColumn").length,2);
    if(name==="location")assert.equal(nodes(doc).filter(node=>node.type==="journalSecret").length,1);
  }
});

test("property forms preserve original scalar types and list values until changed",()=>{
  const source='---\nIterum: "845"\nActive: No\nSession:\n  - S17\nReligion:\n---';
  const fields=editableJournalProperties(source);
  assert.equal(fields.length,4);assert.equal(fields[0].kind,"text");assert.equal(fields[2].kind,"list");
  assert.equal(writeJournalProperties(fields).trim(),source);
  fields[2].value+="\nS18";
  const changed=writeJournalProperties(fields);
  assert.equal(editableJournalProperties(changed)[2].value,"S17\nS18");
  assert.ok(changed.includes('Iterum: "845"'));assert.ok(changed.includes("Active: No"));
  assert.equal(editableJournalProperties('---\nNested:\n  nested: value\n---'),null);
  assert.throws(()=>writeJournalProperties([{label:"Role",kind:"text",value:"<!-- gm-only:start -->"}]),/GM-only block/u);
  assert.throws(()=>writeJournalProperties([{label:"Role",kind:"text",value:"A"},{label:"role",kind:"text",value:"B"}]),/different label/u);
});

test("unusual content outside layout columns is preserved instead of silently discarded",()=>{
  const m=manager(), source='<div data-layout-section="true">\nUnusual heading outside columns\n<div data-layout-column="true" data-column-width="50">\n\nBody\n\n</div>\n</div>';
  const doc=initialJournalDocument(m,source);
  assert.equal(doc.content[0].type,"journalPreserved");assert.ok(m.serialize(doc).includes("Unusual heading outside columns"));
});

test("unapproved remote images retain source without becoming live editor images",()=>{
  const m=manager(),source='![Private](https://untrusted.example/track.png)';
  const doc=initialJournalDocument(m,source);
  assert.equal(nodes(doc).filter(node=>node.type==="image").length,0);
  assert.ok(m.serialize(doc).includes("https://untrusted.example/track.png"));
});

const draft={title:"New page",content:"![Portrait](blob:local-image)",visibility:"players",icon:"file-text"};
const file=()=>new File([new Uint8Array([137,80,78,71,13,10,26,10])],"portrait.png",{type:"image/png"});
const reply=(payload,status=200)=>new Response(JSON.stringify(payload),{status,headers:{"Content-Type":"application/json"}});
test("new-page attachments are staged GM-only and only published after upload succeeds", async()=>{
  const writes=[], attachments=new Map([["blob:local-image",{file:file()}]]);
  const result=await saveJournalEditorDraft({endpoint:"/api/campaigns/cmp_test/journal",id:"",kind:"page",parentId:null,draft,attachments,onCreated:()=>{},request:async(url,options)=>{
    if(url.endsWith("/files"))return reply({id:"file-id"});
    const body=JSON.parse(options.body);writes.push(body);return reply({entry:{...body,id:"entry-id"}});
  }});
  assert.equal(writes[0].visibility,"gm");assert.equal(writes[0].content.includes("blob:"),false);
  assert.equal(writes[1].visibility,"players");assert.equal(result.content.includes("/files/file-id"),true);
  assert.equal(result.content.includes("blob:"),false);
});

test("upload failure never publishes the staged page and retry reuses completed uploads", async()=>{
  const attachments=new Map([["blob:local-image",{file:file()}]]), writes=[];let id="";
  await assert.rejects(saveJournalEditorDraft({endpoint:"/journal",id,kind:"page",parentId:null,draft,attachments,onCreated:entry=>{id=entry.id;},request:async(url,options)=>{
    if(url.endsWith("/files"))return reply({error:"Storage unavailable"},503);
    const body=JSON.parse(options.body);writes.push(body);return reply({entry:{...body,id:"entry-id"}});
  }}),/Storage unavailable/u);
  assert.equal(id,"entry-id");assert.equal(writes.length,1);assert.equal(writes[0].visibility,"gm");
  let uploads=0;
  attachments.get("blob:local-image").uploadedUrl="/journal/files/reused";attachments.get("blob:local-image").entryId=id;
  const saved=await saveJournalEditorDraft({endpoint:"/journal",id,kind:"page",parentId:null,draft,attachments,onCreated:()=>assert.fail("duplicate creation"),request:async(url,options)=>{
    if(url.endsWith("/files")){uploads++;return reply({id:"extra"});}
    return reply({entry:{...JSON.parse(options.body),id}});
  }});
  assert.equal(uploads,0);assert.ok(saved.content.includes("/files/reused"));
});

test("a partial multi-file failure remains private and retry uploads only the missing file",async()=>{
  const attachments=new Map([["blob:first",{file:file()}],["blob:second",{file:file()}]]), input={...draft,content:"![One](blob:first)\n\n![Two](blob:second)"};
  let calls=0,id="";const writes=[];
  await assert.rejects(saveJournalEditorDraft({endpoint:"/journal",id,kind:"page",parentId:null,draft:input,attachments,onCreated:entry=>{id=entry.id;},request:async(url,options)=>{
    if(url.endsWith("/files"))return ++calls===1?reply({id:"first-file"}):reply({error:"Second file failed"},503);
    const body=JSON.parse(options.body);writes.push(body);return reply({entry:{...body,id:"entry-id"}});
  }}),/Second file failed/u);
  assert.equal(writes.length,1);assert.equal(writes[0].visibility,"gm");assert.ok(attachments.get("blob:first").uploadedUrl);
  let retries=0;
  const saved=await saveJournalEditorDraft({endpoint:"/journal",id,kind:"page",parentId:null,draft:input,attachments,onCreated:()=>assert.fail("duplicate creation"),request:async(url,options)=>{
    if(url.endsWith("/files")){retries++;return reply({id:"second-file"});}
    return reply({entry:{...JSON.parse(options.body),id}});
  }});
  assert.equal(retries,1);assert.equal(saved.visibility,"players");assert.ok(saved.content.includes("first-file"));assert.ok(saved.content.includes("second-file"));assert.equal(saved.content.includes("blob:"),false);
});

test("unmatched markers inside code cannot prematurely end a saved GM-only block",async()=>{
  const source="<!-- gm-only:start -->\nSecret before\n\n```html\n<!-- gm-only:end -->\n```\nSecret after\n<!-- gm-only:end -->";
  assert.equal(journalSecretMarkersBalanced(source),false);assert.equal(visualSecretIssue(source),true);
  await assert.rejects(saveJournalEditorDraft({endpoint:"/journal",id:"existing",kind:"page",parentId:null,draft:{...draft,content:source},attachments:new Map(),onCreated:()=>{},request:async()=>assert.fail("unsafe write")}),/unmatched secret marker/u);
});

test("the reading model represents GM-only sections without treating code examples as controls",()=>{
  const source="<!-- gm-only:start -->\nPrivate\n<div data-layout-section=\"true\">\n<div data-layout-column=\"true\">\nBody\n</div>\n</div>\n<!-- gm-only:end -->";
  const parsed=parseJournalLayout(source);
  assert.equal(parsed[0].kind,"secret");assert.equal(parsed[0].children.some(node=>node.kind==="section"),true);
  assert.equal(parseJournalLayout("```html\n<!-- gm-only:start -->\n<!-- gm-only:end -->\n```"),null);
  assert.equal(parseJournalLayout("<!-- gm-only:start -->\nUnclosed"),null);
});

test("real LegendKeeper exports preserve document structures and resolved links through the visual editor when samples are supplied",async()=>{
  if(!process.env.TWE_JOURNAL_SAMPLE_DIR){assert.ok(initialJournalDocument(manager(),journalTemplates.character));return;}
  const root=process.env.TWE_JOURNAL_SAMPLE_DIR;
  const native=convertLegendKeeperNative(JSON.parse(readFileSync(root+"/The Fiery Gaze.json","utf8")));
  const binary=readFileSync(root+"/The Fiery Gaze.zip"),zip=await extractObsidianZip(binary.buffer.slice(binary.byteOffset,binary.byteOffset+binary.byteLength));
  const rootPrefix=zip.notes.every(note=>note.path.startsWith("The Fiery Gaze/"))?"The Fiery Gaze/":"";
  for(const dataset of [native.notes,zip.notes.map(note=>({...note,path:note.path.slice(rootPrefix.length)}))]){
    const pages=dataset.map((note,index)=>({id:String(index),title:note.path.split("/").at(-1).replace(/\.md$/iu,""),sourcePath:note.path,parentId:null}));
    const m=manager();
    for(const [index,note] of dataset.entries()){
      const doc=initialJournalDocument(m,note.content),saved=m.serialize(doc),again=initialJournalDocument(m,saved);
      for(const type of ["journalColumn","journalCallout","journalSecret","image","table","journalWikiLink"]){
        assert.equal(nodes(again).filter(node=>node.type===type).length,nodes(doc).filter(node=>node.type===type).length,note.path+": "+type);
      }
      const links=text=>(resolveJournalWikilinks(text,pages[index],pages).match(/\/journal-page\//gu)??[]).length;
      assert.equal(links(saved),links(note.content),note.path+": resolved links");
      if(note.content.trim())assert.ok(saved.trim(),note.path+": content retained");
    }
    console.log("Visual round-trip: "+dataset.length+" real notes preserved");
  }
});
