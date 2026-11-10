import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {journalDocumentContent} from "../lib/campaigns/journal-layout.ts";
import {
 journalItemMarker,journalItemIcon,newItemJournalContent,
 itemJournalManagedSection,updatedItemJournalContent,
} from "../lib/campaigns/journal-item-link.ts";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
const id="citem_9570f216ec4241d19dd87be1983386d1";
const item={
 id,campaignId:"cmp_example",name:"Moon-Silver Sword",kind:"weapon",
 description:"Forged from lunar silver.\nA blade that hums near ghosts.",
 properties:{weapon:{damage:"1d8",shock:"2/AC 15",range:"-",attribute:"Str/Dex",
  skill:"Stab",encumbrance:1,traits:"T, AP"}},
 visibility:"selected",characterIds:["chr_test"],createdAt:"2026-01-01T00:00:00.000Z",
 updatedAt:"2026-01-01T00:00:00.000Z",
};
test("Journal entry for an item includes its stable identity, full mechanics, and genre icon",()=>{
 const content=newItemJournalContent(item);
 assert.match(content,/<!-- twe-item:citem_9570f216ec4241d19dd87be1983386d1 -->/u);
 for(const text of ["Moon-Silver","Forged from lunar silver","A blade that hums",
  "1d8","2/AC 15","Str/Dex","Stab","T, AP"])
  assert.ok(content.includes(text)||text==="Moon-Silver",text);
 assert.equal(journalItemIcon(item),"sword");
 assert.equal(journalItemIcon({...item,kind:"magical"}),"gem");
 assert.equal(journalItemIcon({...item,kind:"armor"}),"shield-check");
 assert.equal(journalItemIcon({...item,kind:"mundane"}),"package");
 assert.throws(()=>journalItemMarker("invalid"));
});
test("Editing the campaign item only updates the managed Journal block",()=>{
 const original=newItemJournalContent(item)+"\n## GM notes\nThe party has not identified this blade.";
 const revised={...item,name:"Renamed Blade",description:"Now glows red.",
  properties:{weapon:{...item.properties.weapon,damage:"2d6"}}};
 const updated=updatedItemJournalContent(original,revised);
 assert.match(updated,/2d6/u);
 assert.match(updated,/Now glows red/u);
 assert.doesNotMatch(updated,/1d8/u);
 assert.match(updated,/## GM notes\nThe party has not identified this blade/u);
 assert.equal(updated.split("<!-- twe-item-managed:start -->").length,2);
 assert.equal(updatedItemJournalContent(original,{...item,id:"citem_00000000000000000000000000000000"}),original);
 assert.equal(updatedItemJournalContent(journalItemMarker(item.id)+"\nManual notes only",revised),
  journalItemMarker(item.id)+"\nManual notes only");
 assert.match(itemJournalManagedSection({...item,kind:"armor",properties:{
  armor:{armorClass:15,encumbrance:1,shield:"small",restrictions:"No mages",properties:"Shock immunity"}}}),
  /Shock immunity/u);
 assert.match(itemJournalManagedSection({...item,kind:"magical",properties:{
  magical:{bonuses:"+1",abilities:"Moonlight",charges:0,uses:"Dawn",rulesText:"Custom"}}}),
  /\*\*Charges:\*\* 0/u);
});
test("Journal reading view hides sync comments but preserves their stored identity",()=>{
 const source=newItemJournalContent(item)+"\n## GM notes\nThis remains editable.";
 const display=journalDocumentContent(source);
 assert.doesNotMatch(display,/<!-- twe-item(?::|-managed:)/u);
 assert.match(display,/Forged from lunar silver/u);
 assert.match(display,/Inventory availability:/u);
 assert.match(source,/<!-- twe-item-managed:start -->/u);
 assert.match(source,/<!-- twe-item:citem_/u);
 // Code examples remain literal, rather than silently changing user content.
 const code=journalDocumentContent("~~~\n<!-- twe-item-managed:start -->\n~~~");
 assert.match(code,/<!-- twe-item-managed:start -->/u);
});
test("legacy inline item markers never leak into rendered Journal prose",()=>{
 const oldPage=[
  "<!-- twe-item:"+id+" -->",
  "",
  "<!-- twe-item-managed:start --> **Item:** Censer of Solid Dreams",
  "",
  "**Category:** Magical Item",
  "",
  "## Magical Properties",
  "",
  "**Abilities:** This is a test.",
  "",
  "**Rules:** I am testing this.",
  "",
  "Some notes <!-- twe-item-managed:end --> remain visible.",
 ].join("\n");
 const display=journalDocumentContent(oldPage);
 assert.doesNotMatch(display,/<!--\s*twe-item(?::|-managed:)/u);
 for(const expected of ["Censer of Solid Dreams","**Category:** Magical Item",
  "**Abilities:** This is a test.","**Rules:** I am testing this.",
  "Some notes","remain visible."])assert.ok(display.includes(expected),expected);
 // Sync metadata is retained in the saved source for subsequent item updates.
 assert.match(oldPage,/<!-- twe-item-managed:start -->/u);
 const example="Inline code: `<!-- twe-item-managed:start -->`";
 assert.equal(journalDocumentContent(example),example);
});

test("magical item copies all populated fields and describes empty structured rules honestly",()=>{
 const magical={...item,kind:"magical",description:"Burn incense to create smoke.",
  properties:{magical:{bonuses:"+2",abilities:"Can shape dreams.",charges:0,
   uses:"Once per dawn",rulesText:"The smoke is visible."}}};
 const text=journalDocumentContent(newItemJournalContent(magical));
 for(const expected of ["Burn incense","Bonuses:","Abilities:","Charges:","0",
   "Use guidance:","Rules:","selected character"]){
  assert.ok(text.includes(expected),expected);
 }
 const blank=journalDocumentContent(newItemJournalContent({...magical,
  properties:{magical:{bonuses:"",abilities:"",charges:null,uses:"",rulesText:""}}}));
 assert.match(blank,/No separate magical properties recorded/u);
 assert.doesNotMatch(blank,/## Magical Properties/u);
});
test("Item library sends the existing item to a GM-only Journal Items page",async()=>{
 const ui=await read("app/campaigns/campaign-item-library.tsx");
 assert.match(ui,/Add to Journal/u);
 assert.match(ui,/newItemJournalContent\(item\)/u);
 assert.match(ui,/journalItemMarker\(item.id\)/u);
 assert.match(ui,/entry.icon==="twe-role:items"/u);
 assert.match(ui,/visibility:"gm"/u);
 assert.match(ui,/sameName&&!window.confirm/u);
 assert.match(ui,/linkedItemIds.includes\(item.id\)/u);
 assert.match(ui,/Refresh Journal/u);
 assert.match(ui,/refreshItemJournal\(item\)/u);
 assert.match(ui,/expectedContent:page.content,expectedUpdatedAt:page.updatedAt/u);
 assert.match(ui,/Item saved, but its Journal article could not be updated/u);
 assert.match(ui,/twe:campaign-data-changed/u);
});
