import test from "node:test";
import assert from "node:assert/strict";
import {parseJournalLayout,safeJournalImage} from "../lib/campaigns/journal-layout.ts";
test("LegendKeeper columns retain their separate content and bounded proportions",()=>{
 const nodes=parseJournalLayout('<div data-layout-section="true">\n<div data-layout-column="true" data-column-width="66.66">\nMain text\n</div>\n<div data-layout-column="true" data-column-width="33.33">\nPortrait and facts\n</div>\n</div>');
 assert.equal(nodes[0].kind,"section");
 const columns=nodes[0].children.filter(n=>n.kind==="column");
 assert.equal(columns.length,2);assert.equal(columns[0].width,66.66);
 assert.ok(columns[1].children.some(n=>n.kind==="text"&&n.content.includes("Portrait and facts")));
});
test("layout markers in code are inert; malformed layout and HTML attributes are never interpreted",()=>{
 assert.equal(parseJournalLayout('```html\n<div data-layout-section="true">\n</div>\n```'),null);
 assert.equal(parseJournalLayout('<div data-layout-section="true">\nText'),null);
 assert.equal(parseJournalLayout('<div data-layout-section="true" onclick="bad()">\nText\n</div>'),null);
 assert.equal(parseJournalLayout('<script>alert(1)</script>'),null);
});
test("image display allows authenticated attachments and exact LegendKeeper asset host only",()=>{
 assert.equal(safeJournalImage("https://assets.legendkeeper.com/portrait.png?w=1280"),true);
 for(const url of ["javascript:alert(1)","http://assets.legendkeeper.com/a.png","https://assets.legendkeeper.com.evil.test/a.png","https://assets.legendkeeper.com/a.svg","https://user@assets.legendkeeper.com/a.png","https://other.example/a.png"])assert.equal(safeJournalImage(url),false,url);
});
