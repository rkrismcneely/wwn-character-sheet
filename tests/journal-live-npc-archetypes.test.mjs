import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const get=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
test("Both NPC creators have all Bestiary archetypes and editable draft defaults",()=>{
 const a=get("app/campaigns/gm-console.tsx"),b=get("app/campaigns/journal-npc-creator.tsx");
 for(const file of [a,b]){
  assert.match(file,/builtInBestiaryCreatures/);
  assert.match(file,/builtInBestiaryCreatureDraft/);
  assert.match(file,/Bestiary archetype/);
  assert.match(file,/sourceStats.hitDice/);
 }
 assert.match(b,/setSpells/);
 assert.match(b,/setArts/);
});
test("Journal NPC embeds resolve live library entries and can save changes",()=>{
 const document=get("app/campaigns/journal-document.tsx");
 const block=get("app/campaigns/journal-linked-npc.tsx");
 const creator=get("app/campaigns/journal-npc-creator.tsx");
 assert.match(creator,/twe-npc:/);
 assert.match(document,/JournalLinkedNpc/);
 assert.match(block,/cache:"no-store"/);
 assert.match(block,/method:"PATCH"/);
 assert.match(block,/\/npcs/);
});
