import fs from 'node:fs';

const campaignPath = 'tests/campaign-api.test.mjs';
let campaign = fs.readFileSync(campaignPath, 'utf8');
const migrationList = '["0006_campaign_foundation.sql", "0008_campaign_resources.sql", "0010_campaign_live_sessions.sql", "0011_campaign_npc_templates.sql", "0012_campaign_npc_threat_stats.sql"]';
const migrationListWithBundle7 = '["0006_campaign_foundation.sql", "0008_campaign_resources.sql", "0010_campaign_live_sessions.sql", "0011_campaign_npc_templates.sql", "0012_campaign_npc_threat_stats.sql", "0017_action_bundle_7_npc_usability.sql"]';
if (!campaign.includes(migrationList)) throw new Error('campaign fixture migration list not found');
campaign = campaign.replace(migrationList, migrationListWithBundle7);
fs.writeFileSync(campaignPath, campaign);

const threatPath = 'tests/encounter-threat.test.mjs';
let threat = fs.readFileSync(threatPath, 'utf8');
const semanticTest = `\n\ntest("friendly NPCs are excluded completely from hostile encounter threat", () => {\n  const hostile = npc({ id: "hostile", name: "Hostile Guard", threatStats: { hitDice: 2, attacksPerMainAction: 1 } });\n  const ally = { ...npc({ id: "friendly", name: "Allied Beast", threatStats: { hitDice: 8, attacksPerMainAction: 4 } }), friendly: true };\n  const result = summarizeEncounterThreat(encounter([hostile, ally]), [2, 2]);\n\n  assert.equal(result.npcCount, 1);\n  assert.deepEqual(result.eligible.map(({ name }) => name), ["Hostile Guard"]);\n  assert.deepEqual(result.enemy, { totalHitDice: 2, totalAttacks: 1, score: 2 });\n  assert.equal(result.excluded.length, 0);\n});\n`;
if (!threat.includes('friendly NPCs are excluded completely from hostile encounter threat')) threat += semanticTest;
fs.writeFileSync(threatPath, threat);
