import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
test("NPC magic catalog includes rules spells, class arts and Bestiary options",()=>{
 const catalog=read("lib/campaigns/npc-magic-catalog.ts");
 assert.match(catalog,/traditionSpells/u);
 assert.match(catalog,/traditionInfo/u);
 assert.match(catalog,/bestiaryNpcMagicOptions/u);
});
test("Both NPC creators use the game-wide spell and art catalog",()=>{
 for(const path of ["app/campaigns/gm-console.tsx","app/campaigns/journal-npc-creator.tsx"]){
  const source=read(path);
  assert.match(source,/npcMagicCatalog\("spells"\)/u);
  assert.match(source,/npcMagicCatalog\("arts"\)/u);
 }
});
