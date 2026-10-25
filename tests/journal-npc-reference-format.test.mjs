import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=readFileSync(new URL("../app/campaigns/journal-document.tsx",import.meta.url),"utf8");
const npcCreator=readFileSync(new URL("../app/campaigns/journal-npc-creator.tsx",import.meta.url),"utf8");
const npcLibrary=readFileSync(new URL("../lib/campaigns/npcs.ts",import.meta.url),"utf8");
test("Journal recognizes actual generated NPC template IDs",()=>{
 assert.match(npcLibrary,/cnpc_\$\{crypto\.randomUUID\(\)\.replaceAll\("-", ""\)\}/u);
 assert.match(source,/cnpc_\[0-9a-f\]\{32\}/u);
 const token="{{twe-npc:cnpc_9570f216ec4241d19dd87be1983386d1}}";
 const tokenPattern=/(\{\{twe-npc:(?:cnpc_[0-9a-f]{32}|[0-9a-f-]{36})\}\})/giu;
 const matchPattern=/^\{\{twe-npc:((?:cnpc_[0-9a-f]{32}|[0-9a-f-]{36}))\}\}$/iu;
 assert.equal(token.split(tokenPattern)[1],token);
 assert.equal(matchPattern.exec(token)?.[1],"cnpc_9570f216ec4241d19dd87be1983386d1");
 assert.match(npcCreator,/twe-npc:/u);
});
