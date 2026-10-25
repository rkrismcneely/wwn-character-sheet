import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const editor=readFileSync(new URL("../app/campaigns/campaign-journal.tsx",import.meta.url),"utf8");
const creator=readFileSync(new URL("../app/campaigns/journal-npc-creator.tsx",import.meta.url),"utf8");
test("Journal editor provides an inline NPC creator",()=>{
 assert.match(editor,/Add NPC stat block/u);
 assert.match(editor,/JournalNpcCreator/u);
 assert.match(editor,/onInserted=\{markdown=>/u);
});
test("NPC data is saved through the existing campaign NPC library endpoint",()=>{
 assert.match(creator,/encodeURIComponent\(campaignId\)\+"\/npcs"/u);
 assert.match(creator,/method:"POST"/u);
 assert.match(creator,/hpMax:hp,armorClass:ac/u);
 assert.match(creator,/attacks,notes,friendly,spells:\[\],arts:\[\],inventory:\[\]/u);
});
test("NPC creator inserts saved stat data only after server success",()=>{
 assert.match(creator,/if\(!response\.ok\|\|!data\.npc\)throw/u);
 assert.match(creator,/onInserted\(block\)/u);
 assert.match(creator,/NPC stat block · Saved in campaign NPC library/u);
});
