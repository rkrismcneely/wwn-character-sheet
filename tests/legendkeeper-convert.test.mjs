import test from "node:test";
import assert from "node:assert/strict";
import {convertLegendKeeperNative} from "../lib/campaigns/legendkeeper-convert.ts";

test("native LegendKeeper v1 produces importable pages, table Markdown, links and protected secret blocks",()=>{
 const input={version:1,resources:[
  {id:"location",name:"City",documents:[{type:"page",name:"Main",content:{content:[{type:"heading",attrs:{level:2},content:[{type:"text",text:"Overview"}]},{type:"table",content:[{type:"tableRow",content:[{type:"tableHeader",content:[{type:"paragraph",content:[{type:"text",text:"Name"}]}]}]},{type:"tableRow",content:[{type:"tableCell",content:[{type:"paragraph",content:[{type:"text",text:"Jrusar"}]}]}]}]},{type:"paragraph",content:[{type:"mention",attrs:{id:"npc",text:"The Guide"}}]}]}}]},
  {id:"npc",name:"Guide",parentId:"location",isLocked:true,documents:[{type:"page",content:{content:[{type:"bodiedExtension",attrs:{extensionKey:"block-secret"},content:[{type:"paragraph",content:[{type:"text",text:"Secret identity"}]}]}]}}]},
  {id:"map",name:"World",documents:[{type:"map",content:{pins:[]}}]}
 ]};
 const result=convertLegendKeeperNative(input);
 assert.equal(result.statistics.resources,3);
 assert.equal(result.statistics.pages,2);
 assert.equal(result.statistics.maps,1);
 assert.ok(result.notes.some(n=>n.content.includes("| --- |")));
 assert.ok(result.notes.some(n=>n.content.includes("[[Guide|The Guide]]")));
 assert.ok(result.notes.some(n=>n.content.includes("<!-- gm-only:start -->")));
 assert.ok(result.notes.some(n=>n.content.includes("Restricted LegendKeeper resource")));
 assert.ok(result.warnings.some(n=>n.includes("map/board")));
});
test("reject malformed, oversized and cyclic native exports",()=>{
 assert.throws(()=>convertLegendKeeperNative({version:2,resources:[]}));
 assert.throws(()=>convertLegendKeeperNative({version:1,resources:Array(1001).fill({})}));
 assert.throws(()=>convertLegendKeeperNative({version:1,resources:[{id:"a",name:"A",parentId:"b"},{id:"b",name:"B",parentId:"a"}]}));
});
