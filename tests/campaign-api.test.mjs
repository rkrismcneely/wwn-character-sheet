import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { highMagic, highMageArts, weapons } from "../app/wwn-data.ts";
import {
  CampaignServiceError,
  createCampaign,
  deleteCampaign,
  leaveCampaign,
  listCampaignMembers,
  listCampaigns,
  normalizeCampaignDescription,
  normalizeCampaignName,
  readCampaign,
  removeCampaignMember,
  removeCampaignMemberByKey,
  setCampaignArchived,
  updateCampaignDescription,
  updateCampaignName,
} from "../lib/campaigns/service.ts";
import {
  createCampaignResource,
  deleteCampaignResource,
  listCampaignResources,
  reorderCampaignResource,
  updateCampaignResource,
} from "../lib/campaigns/resources.ts";
import {
  campaignNpcEncounterSeed,
  createCampaignNpcTemplate,
  createCampaignNpcTemplateFromBestiary,
  deleteCampaignNpcTemplate,
  duplicateCampaignNpcTemplate,
  listCampaignNpcTemplates,
  updateCampaignNpcTemplate,
} from "../lib/campaigns/npcs.ts";
import { createCampaignItem, listCampaignItemsForManagement, updateCampaignItem } from "../lib/campaigns/items.ts";
import { campaignInventorySnapshot, campaignInventoryValue } from "../lib/inventory/items.ts";
import {
  builtInBestiaryCreatureDraft,
  builtInBestiaryCreatures,
  builtInBestiaryEncounterSeed,
  bestiaryNpcAttackOptions,
  bestiaryNpcMagicOptions,
  getBuiltInBestiaryCreature,
  searchBestiaryCreatures,
  searchBuiltInBestiaryCreatures,
  selectBestiaryCreature,
} from "../lib/campaigns/bestiary.ts";
import {
  authorizeLiveSessionConnection,
  authorizeLiveSessionRoll,
  authorizeEncounterCharacter,
  authorizeEncounterManagement,
  activeCharacterStatusTargets,
  endLiveSession,
  joinLiveSession,
  listActiveCharacterLiveSessionCampaigns,
  readLiveSession,
  startLiveSession,
} from "../lib/campaigns/live-session-service.ts";

const owner = { userId: "user-owner", role: "user" };
const gm = { userId: "user-gm", role: "user" };
const player = { userId: "user-player", role: "user" };
const outsider = { userId: "user-outsider", role: "user" };
const admin = { userId: "user-admin", role: "admin" };
const now = "2026-08-16T12:00:00.000Z";

class TestStatement {
  constructor(statement) {
    this.statement = statement;
    this.values = [];
  }

  bind(...values) {
    this.values = values;
    return this;
  }

  async first() {
    return this.statement.get(...this.values) ?? null;
  }

  async all() {
    return { results: this.statement.all(...this.values) };
  }

  async run() {
    const result = this.statement.run(...this.values);
    return { success: true, meta: { changes: Number(result.changes) } };
  }
}

class TestD1 {
  constructor(database) {
    this.database = database;
  }

  prepare(sql) {
    return new TestStatement(this.database.prepare(sql));
  }

  async batch(statements) {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

async function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE user (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      display_name TEXT,
      email TEXT NOT NULL
    );
    CREATE TABLE characters (
      id TEXT PRIMARY KEY NOT NULL,
      owner_user_id TEXT,
      public_id TEXT,
      visibility TEXT NOT NULL,
      name TEXT NOT NULL,
      class_label TEXT NOT NULL DEFAULT 'Adventurer',
      level INTEGER NOT NULL DEFAULT 1,
      data TEXT NOT NULL DEFAULT '{}',
      FOREIGN KEY (owner_user_id) REFERENCES user(id) ON DELETE SET NULL
    );
  `);
  sqlite.exec("ALTER TABLE characters ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''");
  const insertUser = sqlite.prepare(
    "INSERT INTO user (id, name, email) VALUES (?, ?, ?)",
  );
  for (const [id, name] of [
    [owner.userId, "Campaign Owner"],
    [gm.userId, "Campaign GM"],
    [player.userId, "Campaign Player"],
    [outsider.userId, "Campaign Outsider"],
    [admin.userId, "Site Administrator"],
  ]) {
    insertUser.run(id, name, `${id}@example.invalid`);
  }
  for (const migrationName of ["0006_campaign_foundation.sql", "0008_campaign_resources.sql", "0010_campaign_live_sessions.sql", "0011_campaign_npc_templates.sql", "0012_campaign_npc_threat_stats.sql", "0016_campaign_items.sql", "0017_action_bundle_7_npc_usability.sql", "0018_action_bundle_13_npc_inventory.sql", "0019_campaign_item_equipment.sql"]) {
    const migration = await readFile(new URL(`../drizzle/${migrationName}`, import.meta.url), "utf8");
    for (const statement of migration.split("--> statement-breakpoint")) {
      if (statement.trim()) sqlite.exec(statement);
    }
  }
  // This focused service fixture intentionally has a reduced character table,
  // so add the lifecycle columns directly instead of applying the production
  // migration indexes against columns the fixture does not model.
  sqlite.exec("ALTER TABLE characters ADD COLUMN archived_at TEXT; ALTER TABLE campaigns ADD COLUMN archived_at TEXT;");
  return { sqlite, db: new TestD1(sqlite) };
}

test("live sessions preserve owner-only lifecycle, member participation, and historical restart", async () => {
  const { sqlite, db } = await fixture();
  const campaign = await createCampaign(db, owner, { name: "Session Company" }, now);
  await addMember(sqlite, campaign.id, player);
  await expectServiceError(startLiveSession(db, player, campaign.id, now), 403);
  await expectServiceError(startLiveSession(db, admin, campaign.id, now), 403);
  const started = await startLiveSession(db, owner, campaign.id, now);
  assert.ok(started.state.session);
  assert.equal(started.state.session.participants.length, 1);
  assert.equal(started.state.permissions.canEnd, true);
  const duplicateStart = await startLiveSession(db, owner, campaign.id, now);
  assert.equal(duplicateStart.state.session.id, started.state.session.id);
  await expectServiceError(joinLiveSession(db, outsider, campaign.id, now), 404);
  await expectServiceError(joinLiveSession(db, admin, campaign.id, now), 403);
  const joined = await joinLiveSession(db, player, campaign.id, now);
  assert.equal(joined.state.session.participants.length, 2);
  assert.equal(joined.state.permissions.joined, true);
  assert.equal(joined.state.permissions.canJoin, false);
  await joinLiveSession(db, player, campaign.id, now);
  const encounterManagement = await authorizeEncounterManagement(db, owner, campaign.id);
  assert.equal(encounterManagement.sessionId, started.state.session.id);
  await expectServiceError(authorizeEncounterManagement(db, player, campaign.id), 403);
  await expectServiceError(authorizeEncounterManagement(db, admin, campaign.id), 403);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM campaign_session_participants").get().count, 2);
  const connection = await authorizeLiveSessionConnection(db, player, campaign.id);
  assert.equal(connection.sessionId, started.state.session.id);
  assert.match(connection.participantKey, /^cspt_[0-9a-f]{32}$/u);
  await expectServiceError(endLiveSession(db, player, campaign.id, now), 403);
  const ended = await endLiveSession(db, owner, campaign.id, now);
  assert.equal(ended.state.session, null);
  await expectServiceError(authorizeLiveSessionConnection(db, player, campaign.id), 409);
  const restarted = await startLiveSession(db, owner, campaign.id, "2026-08-16T13:00:00.000Z");
  assert.notEqual(restarted.state.session.id, started.state.session.id);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM campaign_sessions").get().count, 2);
});

test("shared rolls require a joined participant's own linked character", async () => {
  const { sqlite, db } = await fixture();
  const campaign = await createCampaign(db, owner, { name: "Shared rolls" }, now);
  await addMember(sqlite, campaign.id, player);
  sqlite.prepare("INSERT INTO characters (id, owner_user_id, public_id, visibility, name, class_label, level, data) VALUES (?, ?, ?, 'private', ?, ?, ?, ?)")
    .run("character-player", player.userId, "chr_1234567890123456789012", "Player Hero", "High Mage", 5, JSON.stringify({
      level: 5, classMode: "full", classOne: "High Mage", attrs: { DEX: 12, CON: 10 },
      armor: "Mail Shirt", shield: "", armorBonus: 0, hpCurrent: 9, hpMax: 13,
    }));
  sqlite.prepare("INSERT INTO characters (id, owner_user_id, public_id, visibility, name) VALUES (?, ?, ?, 'private', ?)")
    .run("character-owner", owner.userId, "chr_abcdefghijklmnopqrstuv", "Owner Hero");
  const campaignRow = internalCampaign(sqlite, campaign.id);
  sqlite.prepare("INSERT INTO campaign_characters (campaign_id, character_id, added_at) VALUES (?, ?, ?)")
    .run(campaignRow.id, "character-player", now);
  sqlite.prepare("INSERT INTO campaign_characters (campaign_id, character_id, added_at) VALUES (?, ?, ?)")
    .run(campaignRow.id, "character-owner", now);
  const started = await startLiveSession(db, owner, campaign.id, now);
  assert.equal(started.state.session?.participants[0]?.character?.name, "Owner Hero");
  await expectServiceError(authorizeLiveSessionRoll(db, player, campaign.id, "chr_1234567890123456789012"), 409);
  await joinLiveSession(db, player, campaign.id, now);
  const authorization = await authorizeLiveSessionRoll(db, player, campaign.id, "chr_1234567890123456789012");
  assert.equal(authorization.character.name, "Player Hero");
  assert.equal((await authorizeEncounterCharacter(db, authorization.campaignId, authorization.sessionId, "chr_1234567890123456789012")).id, "chr_1234567890123456789012");
  await expectServiceError(authorizeEncounterCharacter(db, authorization.campaignId, authorization.sessionId, "chr_missing"), 422);
  const liveState = await readLiveSession(db, player, campaign.id);
  assert.deepEqual(liveState.session.participants.find(participant => participant.character?.id === "chr_1234567890123456789012")?.character, {
    id: "chr_1234567890123456789012", name: "Player Hero", level: 5, classLabel: "High Mage", hpCurrent: 9, hpMax: 13, armorClass: 14,
  });
  const targets = await activeCharacterStatusTargets(db, player.userId, "character-player");
  assert.equal(targets.length, 1);
  assert.equal(targets[0].sessionId, authorization.sessionId);
  assert.deepEqual([...await listActiveCharacterLiveSessionCampaigns(db, player, "chr_1234567890123456789012")], [{ id: campaign.id, name: "Shared rolls" }]);
  assert.deepEqual(await listActiveCharacterLiveSessionCampaigns(db, outsider, "chr_1234567890123456789012"), []);
  await expectServiceError(authorizeLiveSessionRoll(db, player, campaign.id, "chr_abcdefghijklmnopqrstuv"), 403);
  await expectServiceError(authorizeLiveSessionRoll(db, outsider, campaign.id, "chr_1234567890123456789012"), 404);
  await endLiveSession(db, owner, campaign.id, now);
  assert.deepEqual(await listActiveCharacterLiveSessionCampaigns(db, player, "chr_1234567890123456789012"), []);
  assert.deepEqual(await activeCharacterStatusTargets(db, player.userId, "character-player"), []);
  await expectServiceError(authorizeLiveSessionRoll(db, player, campaign.id, "chr_1234567890123456789012"), 409);
});

test("live-session state keeps non-member administrators read-only but lets admin members join as players", async () => {
  const { sqlite, db } = await fixture();
  const campaign = await createCampaign(db, owner, { name: "Read only session" }, now);
  await addMember(sqlite, campaign.id, player);
  await startLiveSession(db, owner, campaign.id, now);
  const memberState = await readLiveSession(db, player, campaign.id);
  assert.equal(memberState.permissions.canJoin, true);
  assert.ok(memberState.session.participants.every(participant => participant.character === null));
  assert.equal(Object.hasOwn(memberState.session.participants[0], "userId"), false);
  const adminState = await readLiveSession(db, admin, campaign.id);
  assert.equal(adminState.permissions.adminReadOnly, true);
  assert.equal(adminState.permissions.canJoin, false);
  assert.equal(adminState.permissions.canStart, false);

  await addMember(sqlite, campaign.id, admin);
  sqlite.prepare("INSERT INTO characters (id, owner_user_id, public_id, visibility, name, class_label, level, data) VALUES (?, ?, ?, 'private', ?, ?, ?, ?)")
    .run("character-admin", admin.userId, "chr_adminplayer000000000001", "Admin Player", "Expert", 2, JSON.stringify({
      level: 2, classMode: "full", classOne: "Expert", attrs: { DEX: 10, CON: 10 },
      armor: "No Armor", shield: "", armorBonus: 0, hpCurrent: 7, hpMax: 7,
    }));
  const campaignRow = internalCampaign(sqlite, campaign.id);
  sqlite.prepare("INSERT INTO campaign_characters (campaign_id, character_id, added_at) VALUES (?, ?, ?)")
    .run(campaignRow.id, "character-admin", now);

  const adminMemberState = await readLiveSession(db, admin, campaign.id);
  assert.equal(adminMemberState.permissions.adminReadOnly, false);
  assert.equal(adminMemberState.permissions.canJoin, true);
  assert.equal(adminMemberState.permissions.canStart, false);
  const joinedAdmin = await joinLiveSession(db, admin, campaign.id, now);
  assert.equal(joinedAdmin.state.permissions.joined, true);
  assert.equal(joinedAdmin.state.permissions.adminReadOnly, false);
  assert.equal(joinedAdmin.state.session.participants.find(participant => participant.character?.id === "chr_adminplayer000000000001")?.character?.name, "Admin Player");
  const connection = await authorizeLiveSessionConnection(db, admin, campaign.id);
  assert.equal(connection.sessionId, joinedAdmin.state.session.id);
  const rollAuthorization = await authorizeLiveSessionRoll(db, admin, campaign.id, "chr_adminplayer000000000001");
  assert.equal(rollAuthorization.character.name, "Admin Player");
  await expectServiceError(authorizeEncounterManagement(db, admin, campaign.id), 403);
});

test("NPC templates are owner-only, campaign-scoped, and seed independent encounter instances", async () => {
  const { sqlite, db } = await fixture();
  const campaign = await createCampaign(db, owner, { name: "NPC Company" }, now);
  await addMember(sqlite, campaign.id, player);
  const item = await createCampaignItem(db, owner, campaign.id, { name: "Healing Tonic", kind: "magical", description: "Restores a small amount of vitality." }, now);
  const itemSnapshot = campaignInventoryValue(item);
  const draft = { name: "Orc Warrior", hpMax: 12, armorClass: 15, physicalSave: 13, evasionSave: 15, mentalSave: 16, attacks: [{ name: "Axe", attackBonus: 4, damage: "1d8+2", shock: "2/AC 13", description: "" }], hitDice: 2, attacksPerMainAction: 1, inventory: [itemSnapshot], notes: "Shield wall" };
  await expectServiceError(createCampaignNpcTemplate(db, player, campaign.id, draft), 403);
  const npc = await createCampaignNpcTemplate(db, owner, campaign.id, draft, now);
  assert.deepEqual(npc.inventory, [itemSnapshot]);
  assert.deepEqual(campaignInventorySnapshot(npc.inventory[0]), { id: item.id, campaignId: campaign.id, name: "Healing Tonic", kind: "magical", description: "Restores a small amount of vitality." });
  assert.equal((await listCampaignNpcTemplates(db, owner, campaign.id))[0].name, "Orc Warrior");
  assert.equal(npc.hitDice, 2);
  assert.equal(npc.attacks[0].shock, "2/AC 13");
  await expectServiceError(listCampaignNpcTemplates(db, player, campaign.id), 403);
  await expectServiceError(listCampaignNpcTemplates(db, admin, campaign.id), 403);
  const duplicate = await duplicateCampaignNpcTemplate(db, owner, campaign.id, npc.id, now);
  assert.equal(duplicate.name, "Orc Warrior Copy");
  assert.deepEqual(duplicate.inventory, [itemSnapshot]);
  const updated = await updateCampaignNpcTemplate(db, owner, campaign.id, npc.id, { ...draft, hpMax: 18, notes: "Updated template" }, now);
  await updateCampaignItem(db, owner, campaign.id, item.id, { name: "Replaced Tonic", kind: "magical", description: "A changed library definition." }, now);
  const encounterSeed = await campaignNpcEncounterSeed(db, internalCampaign(sqlite, campaign.id).id, npc.id);
  encounterSeed.hpCurrent = 3;
  const secondEncounterSeed = await campaignNpcEncounterSeed(db, internalCampaign(sqlite, campaign.id).id, npc.id);
  assert.equal(updated.hpMax, 18);
  assert.equal((await listCampaignNpcTemplates(db, owner, campaign.id)).find(candidate => candidate.id === npc.id)?.hpMax, 18);
  assert.equal(encounterSeed.hpMax, 18);
  assert.equal(secondEncounterSeed.hpCurrent, 18);
  assert.deepEqual(encounterSeed.inventory, [itemSnapshot]);
  assert.deepEqual((await listCampaignNpcTemplates(db, owner, campaign.id)).find(candidate => candidate.id === npc.id)?.inventory, [itemSnapshot]);
  assert.deepEqual(secondEncounterSeed.combatStats.threatStats, { hitDice: 2, attacksPerMainAction: 1 });
  const otherCampaign = await createCampaign(db, owner, { name: "Other NPC Company" }, now);
  await expectServiceError(campaignNpcEncounterSeed(db, internalCampaign(sqlite, otherCampaign.id).id, npc.id), 404);
  await deleteCampaignNpcTemplate(db, owner, campaign.id, duplicate.id);
  assert.equal((await listCampaignNpcTemplates(db, owner, campaign.id)).length, 1);
});

test("campaign item categories validate and persist WWN equipment properties", async () => {
  const { db } = await fixture();
  const campaign = await createCampaign(db, owner, { name: "Equipment Company" }, now);
  const weapon = await createCampaignItem(db, owner, campaign.id, {
    name: "Harbor Spear", kind: "weapon", description: "Dockside defense.",
    properties: { damage: "1d6", shock: "2/AC 13", range: "30/60", attribute: "Str/Dex", skill: "Stab", encumbrance: 1, traits: "T" },
  }, now);
  assert.equal(weapon.kind, "weapon");
  assert.equal(weapon.properties.weapon?.skill, "Stab");
  const armor = await createCampaignItem(db, owner, campaign.id, {
    name: "Harbor Buckler", kind: "armor", description: "A compact shield.",
    properties: { armorClass: 13, encumbrance: 1, shield: "small", restrictions: "", properties: "Ignores the first Shock instance each round." },
  }, now);
  assert.equal(armor.properties.armor?.armorClass, 13);
  assert.equal(armor.properties.armor?.shield, "small");
  const magic = await createCampaignItem(db, owner, campaign.id, {
    name: "Lantern of Echoes", kind: "magical", description: "A strange lantern.",
    properties: { bonuses: "+1 to Notice", abilities: "Reveals hidden writing.", charges: 3, uses: "One charge per scene.", rulesText: "The GM decides what qualifies as hidden writing." },
  }, now);
  assert.equal(magic.properties.magical?.charges, 3);
  await expectServiceError(createCampaignItem(db, owner, campaign.id, { name: "Invalid Weapon", kind: "weapon", description: "" }, now), 422);
  const persisted = await listCampaignItemsForManagement(db, owner, campaign.id);
  assert.deepEqual(persisted.items.map(item => item.kind).sort(), ["armor", "magical", "weapon"]);
  assert.equal(persisted.items.find(item => item.id === weapon.id)?.properties.weapon?.damage, "1d6");
});

test("CC0 built-in bestiary definitions search and create independent campaign and encounter copies", async () => {
  const apex = getBuiltInBestiaryCreature("apex-predator");
  assert.ok(apex);
  assert.equal(apex.name, "Apex Predator");
  assert.equal(apex.armorClass, 13);
  assert.equal(apex.attacks[0].damage, "1d8");
  assert.equal(apex.attacks[0].name, "Rending Bite");
  assert.equal(apex.sourceAttacks[0].name, "Attack");
  assert.deepEqual(apex.source, { name: "Worlds Without Number SRD", license: "CC0" });
  assert.equal(Object.isFrozen(apex), true);
  assert.equal(Object.isFrozen(apex.attacks), true);
  assert.equal(Object.isFrozen(apex.source), true);
  assert.equal(Object.isFrozen(apex.sourceStats), true);
  assert.ok(searchBuiltInBestiaryCreatures("apex").some(creature => creature.id === "apex-predator"));
  const catalog = searchBuiltInBestiaryCreatures("");
  assert.equal(catalog.length, 76);
  assert.deepEqual(catalog.map(creature => creature.name), [...catalog.map(creature => creature.name)].sort((left, right) => left.localeCompare(right)));
  assert.ok(searchBuiltInBestiaryCreatures("automaton").some(creature => creature.id === "automaton-military"));
  assert.deepEqual(searchBuiltInBestiaryCreatures("amorphous").map(creature => creature.id), ["slime-or-ooze"]);
  assert.deepEqual(searchBuiltInBestiaryCreatures("no such creature"), []);
  assert.equal(selectBestiaryCreature(catalog, "apex-predator")?.id, "apex-predator");
  assert.equal(selectBestiaryCreature(catalog, "filtered-out")?.id, catalog[0]?.id);

  const originalIds = ["small-pack-predator", "large-solitary-predator", "apex-predator", "herd-beast", "vicious-large-herbivore", "elephantine-grazer", "automaton-humanlike", "automaton-laborer", "automaton-military", "slime-or-ooze", "small-vicious-predator", "large-vicious-predator", "hulking-predator", "unnatural-swarm", "terrible-warbeast", "legendary-god-titan"];
  for (const id of originalIds) assert.ok(catalog.some(creature => creature.id === id), `existing creature ${id} remains present`);

  const canonicalSrdEntries = [
    ["small-pack-predator", "Small Pack Predator", 1, 1, 5, 12, 2, "1d4", "1/13", "40'", 7, 6, 1, 15],
    ["large-solitary-predator", "Large Solitary Predator", 5, 1, 23, 13, 6, "1d8", "2/13", "30'", 8, 6, 1, 13],
    ["apex-predator", "Apex Predator", 6, 2, 27, 13, 6, "1d8", "2/13", "40'", 8, 6, 2, 12],
    ["herd-beast", "Herd Beast", 2, 1, 9, 11, 2, "1d4", "None", "40'", 7, 6, 1, 14],
    ["vicious-large-herbivore", "Vicious Large Herbivore", 4, 1, 18, 13, 5, "1d10", "1/13", "40'", 9, 6, 1, 13],
    ["elephantine-grazer", "Elephantine Grazer", 6, 1, 27, 13, 5, "2d8", "None", "40'", 7, 6, 1, 12],
    ["automaton-humanlike", "Automaton, Humanlike", 2, 1, 9, 13, 2, "Weapon", "Weapon", "30'", 12, 3, 1, 14],
    ["automaton-laborer", "Automaton, Laborer", 2, 1, 9, 15, 2, "1d6", "1/13", "30'", 12, 3, 1, 14],
    ["automaton-military", "Automaton, Military", 4, 1, 18, 18, 5, "1d10+2", "4/15", "30'", 12, 3, 1, 13],
    ["slime-or-ooze", "Slime or Ooze", 6, 2, 27, 10, 6, "1d8", "1/-", "20'", 12, 5, 1, 12],
    ["small-vicious-predator", "Predator, Small Vicious", 1, 1, 5, 14, 1, "1d4", "1/13", "30'", 7, 5, 1, 15],
    ["large-vicious-predator", "Predator, Large Vicious", 6, 2, 27, 13, 7, "2d6", "2/15", "40'", 9, 5, 2, 13],
    ["hulking-predator", "Predator, Hulking", 10, 2, 45, 15, 12, "2d6+3", "6/15", "30'", 10, 4, 1, 10],
    ["unnatural-swarm", "Unnatural Swarm", 4, 3, 18, 10, 6, "1d6", "1/-", "30'", 10, 5, 1, 13],
    ["terrible-warbeast", "Terrible Warbeast", 8, 2, 36, 15, 10, "2d6+4", "7/15", "40'", 9, 4, 2, 11],
    ["legendary-god-titan", "Legendary God-Titan", 20, 3, 90, 22, 20, "2d10+5", "10/-", "40'", 10, 3, 3, 2],
    ["peaceful-human", "Peaceful Human", 1, 1, 5, 10, 0, "Weapon", "Weapon", "30'", 7, 5, 1, 15],
    ["thug-or-militia", "Thug or Militia", 1, 1, 5, 13, 1, "Weapon", "Weapon", "30'", 8, 4, 1, 15],
    ["barbarian-fighter", "Barbarian Fighter", 1, 1, 5, 13, 2, "Weapon +1", "Weapon +1", "30'", 8, 5, 1, 15],
    ["veteran-soldier", "Veteran Soldier", 1, 1, 5, 13, 2, "Weapon +1", "Weapon +1", "30'", 8, 3, 1, 15],
    ["skilled-veteran", "Skilled Veteran", 2, 1, 9, 15, 3, "Weapon +1", "Weapon +1", "30'", 9, 2, 1, 14],
    ["elites-or-special-guards", "Elites or Special Guards", 3, 1, 14, 18, 4, "Weapon +2", "Weapon +2", "30'", 10, 2, 2, 14],
    ["knight-or-minor-hero", "Knight or Minor Hero", 4, 1, 18, 18, 6, "Weapon +2", "Weapon +2", "30'", 10, 1, 2, 13],
    ["warrior-baron", "Warrior Baron", 6, 1, 27, 18, 8, "Weapon +3", "Weapon +3", "30'", 9, 1, 2, 12],
    ["barbarian-warlord", "Barbarian Warlord", 8, 2, 36, 16, 10, "Weapon +4", "Weapon +4/-", "30'", 10, 3, 2, 11],
    ["mighty-general", "Mighty General", 8, 1, 36, 18, 10, "Weapon +4", "Weapon +4/-", "30'", 10, 1, 3, 11],
    ["major-hero", "Major Hero", 10, 2, 45, 18, 12, "Weapon +5", "Weapon +5/-", "30'", 10, 2, 3, 10],
    ["great-warrior-king", "Great Warrior King", 12, 2, 54, 18, 14, "Weapon +5", "Weapon +5/-", "30'", 10, 1, 3, 9],
    ["petty-mage", "Petty Mage", 2, 1, 9, 10, 1, "Weapon", "Weapon", "30'", 8, 4, 1, 14],
    ["tribal-shaman", "Tribal Shaman", 4, 1, 18, 10, 3, "Weapon +1", "Weapon +1", "30'", 9, 4, 1, 13],
    ["skilled-sorcerer", "Skilled Sorcerer", 5, 1, 23, 10, 1, "Weapon", "Weapon", "30'", 9, 4, 2, 13],
    ["master-wizard", "Master Wizard", 8, 1, 36, 13, 1, "Weapon", "Weapon", "30'", 9, 3, 2, 11],
    ["famous-arch-mage", "Famous Arch-Mage", 10, 1, 45, 13, 2, "Weapon", "Weapon", "30'", 9, 2, 3, 10],
    ["automaton-warbot", "Automaton, Warbot", 10, 3, 45, 20, 12, "1d12+5", "7/-", "40'", 12, 2, 2, 10],
    ["predator-hellbeast", "Predator, Hellbeast", 10, 4, 45, 18, 12, "1d10+5", "6/-", "60'", 11, 4, 3, 10],
  ];
  for (const [id, name, hitDice, attacksPerMainAction, hpMax, armorClass, attackBonus, damage, shock, move, morale, instinct, skill, save] of canonicalSrdEntries) {
    const creature = getBuiltInBestiaryCreature(id);
    assert.ok(creature, `${name} exists`);
    assert.deepEqual({ name: creature.name, hpMax: creature.hpMax, armorClass: creature.armorClass, attackBonus: creature.sourceAttacks[0]?.attackBonus, damage: creature.sourceAttacks[0]?.damage, sourceStats: creature.sourceStats, saves: [creature.physicalSave, creature.evasionSave, creature.mentalSave], source: creature.source }, { name, hpMax, armorClass, attackBonus, damage, sourceStats: { hitDice, attacksPerMainAction, shock, move, morale, instinct, skill }, saves: [save, save, save], source: { name: "Worlds Without Number SRD", license: "CC0" } });
    assert.equal(Object.isFrozen(creature), true);
    assert.equal(Object.isFrozen(creature.sourceStats), true);
  }
  assert.notEqual(getBuiltInBestiaryCreature("barbarian-fighter")?.sourceStats.instinct, getBuiltInBestiaryCreature("veteran-soldier")?.sourceStats.instinct);
  assert.equal(canonicalSrdEntries.length, 35);
  const srdCatalog = catalog.filter(creature => creature.source.license === "CC0");
  assert.equal(srdCatalog.length, 35);
  assert.ok(srdCatalog.every(creature => creature.attacks.length > 0 && creature.attacks.every(attack => attack.name !== "Attack" && !attack.damage.startsWith("Weapon"))));
  assert.ok(srdCatalog.every(creature => creature.sourceAttacks.length > 0 && creature.sourceAttacks.every(attack => attack.name === "Attack")));
  assert.deepEqual(getBuiltInBestiaryCreature("automaton-military")?.attacks[0], { name: "Halberd", attackBonus: 5, damage: "1d10+2", shock: "4/AC 15", description: "Traits 2H, L" });
  assert.deepEqual(getBuiltInBestiaryCreature("veteran-soldier")?.attacks[0], { name: "Sword, Long", attackBonus: 2, damage: "1d8+1", shock: "3/AC 13", description: "" });
  assert.deepEqual(getBuiltInBestiaryCreature("barbarian-warlord")?.attacks[0], { name: "Axe, War", attackBonus: 10, damage: "1d10+4", shock: "7/-", description: "Traits 2H" });
  assert.deepEqual(getBuiltInBestiaryCreature("great-warrior-king")?.attacks[0], { name: "Hammer, Great", attackBonus: 14, damage: "1d10+5", shock: "7/-", description: "Traits 2H" });
  assert.equal(getBuiltInBestiaryCreature("automaton-warbot")?.attacks[0]?.name, "Warbot Crusher");
  assert.equal(getBuiltInBestiaryCreature("predator-hellbeast")?.attacks[0]?.name, "Hellfire Claws");
  for (const creature of srdCatalog.filter(candidate => candidate.sourceAttacks[0]?.damage.startsWith("Weapon"))) {
    const sourceAttack = creature.sourceAttacks[0];
    const attack = creature.attacks[0];
    const weapon = weapons.find(candidate => candidate.name === attack.name);
    const bonus = Number(/^Weapon(?: \+(\d+))?$/u.exec(sourceAttack.damage)?.[1] ?? 0);
    assert.ok(weapon, `${creature.name} uses a weapon from the imported CC0 SRD catalog`);
    assert.equal(attack.damage, bonus ? `${weapon.damage}+${bonus}` : weapon.damage);
  }
  assert.equal(getBuiltInBestiaryCreature("barbarian-warlord")?.sourceStats.attacksPerMainAction, 2);
  assert.equal(getBuiltInBestiaryCreature("automaton-warbot")?.sourceStats.attacksPerMainAction, 3);
  assert.equal(getBuiltInBestiaryCreature("predator-hellbeast")?.sourceStats.attacksPerMainAction, 4);
  assert.equal(getBuiltInBestiaryCreature("elites-or-special-guards")?.armorAnnotation, "a");
  assert.equal(getBuiltInBestiaryCreature("automaton-military")?.armorAnnotation, undefined);
  assert.deepEqual(srdCatalog.filter(creature => creature.notes).map(creature => creature.id), ["famous-arch-mage", "master-wizard", "petty-mage", "skilled-sorcerer", "tribal-shaman"]);
  for (const [id, level, effort] of [["petty-mage", 2, 3], ["tribal-shaman", 4, 3], ["skilled-sorcerer", 5, 4], ["master-wizard", 8, 4], ["famous-arch-mage", 10, 5]]) {
    const creature = getBuiltInBestiaryCreature(id);
    assert.equal(creature?.spellcasting?.level, level);
    assert.equal(creature?.spellcasting?.effort, effort);
    assert.equal(creature?.spellcasting?.tradition, "High Magic");
    assert.ok(creature?.spellcasting?.spells.length && creature.spellcasting.spells.every(spell => spell.level <= level));
    assert.ok(creature?.spellcasting?.arts.length);
    for (const spell of creature?.spellcasting?.spells ?? []) assert.equal(highMagic.find(candidate => candidate.name === spell.name)?.level, spell.level, `${spell.name} is an imported, level-legal CC0 High Magic spell`);
    for (const art of creature?.spellcasting?.arts ?? []) assert.ok(highMageArts.some(candidate => candidate.name === art.name), `${art.name} is an imported CC0 High Mage Art`);
    assert.match(creature?.notes ?? "", new RegExp(`Mage level ${level}; Effort ${effort}`, "u"));
    assert.match(creature?.notes ?? "", /TWE representative High Magic loadout/u);
  }
  assert.ok(searchBuiltInBestiaryCreatures("bandit").some(creature => creature.id === "thug-or-militia"));
  assert.ok(searchBuiltInBestiaryCreatures("soldier").some(creature => creature.id === "veteran-soldier"));
  assert.ok(searchBuiltInBestiaryCreatures("guard").some(creature => creature.id === "elites-or-special-guards"));
  assert.ok(searchBuiltInBestiaryCreatures("wizard").some(creature => creature.id === "master-wizard"));
  assert.deepEqual(searchBuiltInBestiaryCreatures("shaman").map(creature => creature.id), ["tribal-shaman"]);
  assert.ok(searchBuiltInBestiaryCreatures("Apex Predator").some(creature => creature.id === "apex-predator"));
  assert.deepEqual(searchBuiltInBestiaryCreatures("warbot").map(creature => creature.id), ["automaton-warbot"]);
  assert.deepEqual(searchBuiltInBestiaryCreatures("hellbeast").map(creature => creature.id), ["predator-hellbeast"]);

  const syntheticCatalog = Array.from({ length: 512 }, (_, index) => ({
    ...apex,
    id: `synthetic-${index}`,
    name: `Synthetic Creature ${String(512 - index).padStart(3, "0")}`,
    description: index === 311 ? "Needle-in-a-haystack synthetic creature." : "Synthetic performance fixture.",
  }));
  const syntheticResults = searchBestiaryCreatures(syntheticCatalog, "");
  assert.equal(syntheticResults.length, 512);
  assert.equal(syntheticResults[0]?.name, "Synthetic Creature 001");
  assert.deepEqual(searchBestiaryCreatures(syntheticCatalog, "needle-in-a-haystack").map(creature => creature.id), ["synthetic-311"]);
  assert.equal(selectBestiaryCreature(syntheticResults, "filtered-out")?.id, "synthetic-511");
  const firstDraft = builtInBestiaryCreatureDraft("apex-predator");
  const secondDraft = builtInBestiaryCreatureDraft("apex-predator");
  assert.ok(firstDraft && secondDraft);
  firstDraft.hpMax = 1;
  firstDraft.attacks[0].damage = "0";
  assert.equal(secondDraft.hpMax, apex.hpMax);
  assert.equal(secondDraft.attacks[0].damage, apex.attacks[0].damage);
  const firstEncounter = builtInBestiaryEncounterSeed("apex-predator");
  const secondEncounter = builtInBestiaryEncounterSeed("apex-predator");
  assert.ok(firstEncounter && secondEncounter);
  firstEncounter.hpCurrent = 1;
  assert.equal(secondEncounter.hpCurrent, apex.hpMax);
  assert.equal(apex.hpMax, 27);
  for (const id of ["apex-predator", "thug-or-militia", "automaton-warbot", "master-wizard"]) {
    const draft = builtInBestiaryCreatureDraft(id);
    const firstSeed = builtInBestiaryEncounterSeed(id);
    const secondSeed = builtInBestiaryEncounterSeed(id);
    assert.ok(draft && firstSeed && secondSeed);
    const expectedNotes = getBuiltInBestiaryCreature(id)?.notes;
    assert.equal(draft.notes, expectedNotes);
    assert.equal(firstSeed.notes, expectedNotes);
    assert.equal(firstSeed.combatStats.notes, expectedNotes);
    firstSeed.notes = "changed";
    firstSeed.combatStats.notes = "changed";
    assert.equal(secondSeed.notes, expectedNotes);
    assert.equal(secondSeed.combatStats.notes, expectedNotes);
  }
  for (const id of ["thug-or-militia", "petty-mage", "automaton-warbot", "predator-hellbeast"]) {
    const builtIn = getBuiltInBestiaryCreature(id);
    const firstSeed = builtInBestiaryEncounterSeed(id);
    const secondSeed = builtInBestiaryEncounterSeed(id);
    assert.ok(builtIn && firstSeed && secondSeed);
    firstSeed.hpCurrent = 1;
    firstSeed.combatStats.attacks[0].damage = "changed";
    assert.equal(secondSeed.hpCurrent, builtIn.hpMax);
    assert.equal(secondSeed.combatStats.attacks[0].damage, builtIn.attacks[0].damage);
  }

  const { sqlite, db } = await fixture();
  const campaign = await createCampaign(db, owner, { name: "Bestiary Company" }, now);
  await addMember(sqlite, campaign.id, player);
  await expectServiceError(createCampaignNpcTemplateFromBestiary(db, player, campaign.id, "apex-predator"), 403);
  const template = await createCampaignNpcTemplateFromBestiary(db, owner, campaign.id, "petty-mage", now);
  assert.equal(template.name, "Petty Mage");
  assert.deepEqual({ hitDice: template.hitDice, attacksPerMainAction: template.attacksPerMainAction }, { hitDice: 2, attacksPerMainAction: 1 });
  assert.deepEqual(template.attacks[0], getBuiltInBestiaryCreature("petty-mage")?.attacks[0]);
  assert.match(template.notes, /The Coruscating Coffin/u);
  assert.match(template.notes, /Sense Magic/u);
  const koboldTemplate = await createCampaignNpcTemplateFromBestiary(db, owner, campaign.id, "totw-kobold", now);
  const stirgeTemplate = await createCampaignNpcTemplateFromBestiary(db, owner, campaign.id, "totw-stirge", now);
  assert.deepEqual({ hitDice: koboldTemplate.hitDice, hpMax: koboldTemplate.hpMax }, { hitDice: 0.5, hpMax: 3 });
  assert.deepEqual({ hitDice: stirgeTemplate.hitDice, hpMax: stirgeTemplate.hpMax }, { hitDice: 0, hpMax: 1 });
  assert.match(koboldTemplate.notes, /Horde/u);
  const edited = await updateCampaignNpcTemplate(db, owner, campaign.id, template.id, { ...template, hpMax: 7, notes: "Campaign-owned copy" }, now);
  assert.equal(edited.hpMax, 7);
  assert.equal(getBuiltInBestiaryCreature("petty-mage")?.hpMax, 9);
  assert.equal(getBuiltInBestiaryCreature("apex-predator")?.hpMax, 27);
  assert.equal(builtInBestiaryCreatureDraft("missing-creature"), null);
  assert.equal(builtInBestiaryEncounterSeed("missing-creature"), null);
});

test("Bestiary-backed NPC magic options are deduplicated and keep structured rules details", () => {
  const spells = bestiaryNpcMagicOptions("spells");
  const arts = bestiaryNpcMagicOptions("arts");
  assert.ok(spells.length > 0);
  assert.ok(arts.length > 0);
  assert.equal(new Set(spells.map(option => option.key)).size, spells.length);
  assert.equal(new Set(arts.map(option => option.key)).size, arts.length);
  assert.equal(new Set(spells.map(option => option.name.toLocaleLowerCase().replace(/^the\s+/u, ""))).size, spells.length);
  assert.equal(new Set(arts.map(option => option.name.toLocaleLowerCase())).size, arts.length);
  assert.ok(spells.every(option => Number.isInteger(option.level) && option.level >= 1 && option.level <= 5));
  assert.deepEqual(spells, [...spells].sort((left, right) => left.level - right.level || left.name.localeCompare(right.name) || left.summary.localeCompare(right.summary)));
  assert.ok(spells.some(option => option.name === "The Coruscating Coffin" && option.level === 1 && option.summary.includes("Physical save")));
  assert.ok(spells.some(option => option.name === "The Torment of Tumefaction" && option.level === 3));
  assert.ok(arts.some(option => option.name === "Sense Magic" && option.summary.includes("inspect magical effects")));
  assert.equal(builtInBestiaryCreatures.find(creature => creature.id === "totw-petty-tyrant")?.spellcasting?.spells.filter(spell => spell.name === "The Howl of Light").length, 1);
  assert.ok(builtInBestiaryCreatures.find(creature => creature.id === "totw-petty-tyrant")?.notes.includes("The Howl of Light (L3)"));
  const monsterAttacks = bestiaryNpcAttackOptions();
  assert.ok(monsterAttacks.length > 0);
  assert.equal(new Set(monsterAttacks.map(option => option.key)).size, monsterAttacks.length);
  assert.ok(monsterAttacks.some(option => option.name === "Ghostly Touch" && option.damage === "1d8+1"));
});

test("Bundle 13 keeps NPC magic selectors and campaign-item inventory GM-scoped", async () => {
  const [consoleSource, liveSessionSource, npcSource] = await Promise.all([
    readFile(new URL("../app/campaigns/gm-console.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-live-session.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/campaigns/npcs.ts", import.meta.url), "utf8"),
  ]);
  assert.match(consoleSource, /bestiaryNpcMagicOptions\("spells"\)/u);
  assert.match(consoleSource, /bestiaryNpcMagicOptions\("arts"\)/u);
  assert.match(consoleSource, /<option value=\{OTHER_MAGIC_VALUE\}>Other…<\/option>/u);
  assert.match(consoleSource, /NpcMagicAdd kind="Spell"/u);
  assert.match(consoleSource, /NpcMagicAdd kind="Art"/u);
  assert.match(consoleSource, /Add attack from weapon or monster catalog/u);
  assert.match(consoleSource, /<optgroup label="Monster attacks">/u);
  assert.match(consoleSource, /magicOptionFor\(value, options\)/u);
  assert.match(consoleSource, /fetch\(`\/api\/campaigns\/\$\{campaignId\}\/items`/u);
  assert.match(consoleSource, /campaignInventoryValue\(item\)/u);
  assert.match(liveSessionSource, /inventory=\{combatant\.inventory\}/u);
  assert.match(liveSessionSource, /campaignInventorySnapshot\(item\)/u);
  assert.match(npcSource, /inventory_json AS inventoryJson/u);
  assert.match(npcSource, /inventory: \[\.\.\.npc\.inventory\]/u);
});

test("live-session transport keeps authentication in the Worker and uses hibernating Durable Object presence", async () => {
  const [worker, durableObject, migration] = await Promise.all([
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../worker/campaign-live-session.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0010_campaign_live_sessions.sql", import.meta.url), "utf8"),
  ]);
  assert.match(worker, /getSessionActor\(request\)/u);
  assert.match(worker, /authorizeLiveSessionConnection\(env\.DB/u);
  assert.match(durableObject, /acceptWebSocket/u);
  assert.match(durableObject, /serializeAttachment/u);
  assert.match(durableObject, /webSocketClose/u);
  assert.match(durableObject, /session\.presence/u);
  assert.match(durableObject, /session\.ended/u);
  assert.match(migration, /campaign_sessions_one_active_idx/u);
  assert.match(migration, /WHERE ended_at IS NULL/u);
});

async function expectServiceError(promise, status) {
  await assert.rejects(
    promise,
    error => error instanceof CampaignServiceError && error.status === status,
  );
}

async function addMember(sqlite, campaignPublicId, actor, role = "player") {
  sqlite.prepare(`
    INSERT INTO campaign_members (campaign_id, user_id, role, joined_at)
    SELECT id, ?, ?, ? FROM campaigns WHERE public_id = ?
  `).run(actor.userId, role, now, campaignPublicId);
}

function internalCampaign(sqlite, publicId) {
  return sqlite.prepare(
    "SELECT id, owner_user_id AS ownerUserId FROM campaigns WHERE public_id = ?",
  ).get(publicId);
}

test("campaign names are bounded, trimmed application text", () => {
  assert.equal(normalizeCampaignName("  The Amber Company  "), "The Amber Company");
  assert.throws(() => normalizeCampaignName(""), CampaignServiceError);
  assert.throws(() => normalizeCampaignName("x".repeat(121)), CampaignServiceError);
  assert.throws(() => normalizeCampaignName("unsafe\u0000name"), CampaignServiceError);
});

test("campaign descriptions stay bounded plain text and owner/GM mutation is protected", async () => {
  assert.equal(normalizeCampaignDescription("  First line\nSecond line  "), "First line\nSecond line");
  assert.equal(normalizeCampaignDescription(""), null);
  assert.throws(() => normalizeCampaignDescription("x".repeat(4001)), CampaignServiceError);
  assert.throws(() => normalizeCampaignDescription("bad\u0000text"), CampaignServiceError);
  const { sqlite, db } = await fixture();
  const campaign = await createCampaign(db, owner, { name: "Briefing" }, now);
  await addMember(sqlite, campaign.id, gm, "gm");
  const updated = await updateCampaignDescription(db, gm, campaign.id, { description: "Meet at dusk.", version: 1 }, now);
  assert.equal(updated.description, "Meet at dusk.");
  assert.equal(updated.version, 2);
  await expectServiceError(updateCampaignDescription(db, player, campaign.id, { description: "No", version: 2 }), 404);
  await expectServiceError(updateCampaignDescription(db, admin, campaign.id, { description: "No", version: 2 }), 403);
  const playerView = await readCampaign(db, gm, campaign.id);
  assert.equal(playerView.description, "Meet at dusk.");
});

test("signed-in creation atomically establishes the creator as owner and GM", async () => {
  const { sqlite, db } = await fixture();
  const campaign = await createCampaign(db, owner, { name: "Amber Company" }, now);
  assert.match(campaign.id, /^cmp_[A-Za-z0-9_-]{22}$/u);
  assert.equal(campaign.name, "Amber Company");
  assert.equal(campaign.membershipRole, "gm");
  assert.equal(campaign.isOwner, true);
  assert.deepEqual(campaign.permissions, {
    canManageSettings: true,
    canManageContent: true,
    canDelete: true,
    canArchive: true,
    canRestore: false,
    canInviteMembers: true,
    canRemovePlayers: true,
    canLeave: false,
    canLinkCharacters: true,
    adminReadOnly: false,
  });
  assert.equal(campaign.memberCount, 1);
  const stored = sqlite.prepare(`
    SELECT c.owner_user_id AS ownerUserId, cm.role
    FROM campaigns c
    JOIN campaign_members cm ON cm.campaign_id = c.id
    WHERE c.public_id = ? AND cm.user_id = c.owner_user_id
  `).get(campaign.id);
  assert.deepEqual({ ...stored }, { ownerUserId: owner.userId, role: "gm" });
});

test("new and existing campaigns with no resources return a valid empty list", async () => {
  const { sqlite, db } = await fixture();
  const campaign = await createCampaign(db, owner, { name: "Empty Resources" }, now);
  await addMember(sqlite, campaign.id, player);

  assert.equal((await readCampaign(db, owner, campaign.id)).description, null);
  assert.deepEqual(await listCampaignResources(db, owner, campaign.id), []);
  assert.deepEqual(await listCampaignResources(db, player, campaign.id), []);
});

test("campaign resources are private, ordered, and mutable only by owner or GM", async () => {
  const { sqlite, db } = await fixture();
  const campaign = await createCampaign(db, owner, { name: "Resources" }, now);
  await addMember(sqlite, campaign.id, gm, "gm");
  await addMember(sqlite, campaign.id, player);
  const first = await createCampaignResource(db, owner, campaign.id, { title: "Discord", type: "link", content: "https://discord.com/example" }, now);
  assert.equal(first.length, 1);
  assert.match(first[0].resourceKey, /^cres_[0-9a-f]{32}$/u);
  assert.equal(first[0].resourceKey.includes(campaign.id), false);
  await createCampaignResource(db, gm, campaign.id, { title: "Briefing", type: "text", content: "Meet at dusk." }, now);
  const playerResources = await listCampaignResources(db, player, campaign.id);
  assert.deepEqual(playerResources.map(resource => resource.title), ["Discord", "Briefing"]);
  await expectServiceError(createCampaignResource(db, player, campaign.id, { title: "No", type: "text", content: "No" }), 403);
  await expectServiceError(createCampaignResource(db, admin, campaign.id, { title: "No", type: "text", content: "No" }), 403);
  await expectServiceError(listCampaignResources(db, outsider, campaign.id), 404);
  const moved = await reorderCampaignResource(db, gm, campaign.id, playerResources[1].resourceKey, "up");
  assert.deepEqual(moved.map(resource => resource.title), ["Briefing", "Discord"]);
  const edited = await updateCampaignResource(db, owner, campaign.id, moved[0].resourceKey, { title: "Session Notes", type: "text", content: "Updated." });
  assert.equal(edited[0].title, "Session Notes");
  const deleted = await deleteCampaignResource(db, owner, campaign.id, moved[1].resourceKey);
  assert.deepEqual(deleted.map(resource => resource.title), ["Session Notes"]);
  await assert.rejects(() => createCampaignResource(db, owner, campaign.id, { title: "Unsafe", type: "link", content: "javascript:alert(1)" }), CampaignServiceError);
});

test("unauthenticated users cannot create campaigns", async () => {
  const { db } = await fixture();
  await expectServiceError(createCampaign(db, null, { name: "No" }, now), 401);
});

test("creation ignores client-supplied ownership and admin-like fields", async () => {
  const { sqlite, db } = await fixture();
  const campaign = await createCampaign(db, owner, {
    name: "Owner Controlled",
    ownerUserId: outsider.userId,
    role: "admin",
  }, now);
  assert.equal(internalCampaign(sqlite, campaign.id).ownerUserId, owner.userId);
});

test("campaign listing includes memberships and excludes unrelated campaigns", async () => {
  const { sqlite, db } = await fixture();
  const owned = await createCampaign(db, owner, { name: "Owned" }, now);
  const joined = await createCampaign(db, player, { name: "Joined" }, now);
  await addMember(sqlite, joined.id, owner);
  await createCampaign(db, outsider, { name: "Unrelated" }, now);
  const campaigns = await listCampaigns(db, owner);
  assert.deepEqual(
    new Set(campaigns.map(campaign => campaign.name)),
    new Set(["Owned", "Joined"]),
  );
  assert.equal(campaigns.find(campaign => campaign.id === owned.id)?.isOwner, true);
  assert.equal(campaigns.find(campaign => campaign.id === joined.id)?.membershipRole, "player");
  assert.equal(campaigns.find(campaign => campaign.id === joined.id)?.memberCount, 2);
});

test("private campaign listing requires authentication", async () => {
  const { db } = await fixture();
  await expectServiceError(listCampaigns(db, null), 401);
});

test("owner, member, and site admin can read while outsiders cannot enumerate", async () => {
  const { sqlite, db } = await fixture();
  const campaign = await createCampaign(db, owner, { name: "Private" }, now);
  await addMember(sqlite, campaign.id, player);
  assert.equal((await readCampaign(db, owner, campaign.id)).isOwner, true);
  assert.equal((await readCampaign(db, player, campaign.id)).membershipRole, "player");
  const adminView = await readCampaign(db, admin, campaign.id);
  assert.equal(adminView.permissions.adminReadOnly, true);
  assert.equal(adminView.permissions.canManageSettings, false);
  assert.equal(adminView.permissions.canManageContent, false);
  assert.equal(adminView.permissions.canInviteMembers, false);
  assert.equal(adminView.permissions.canRemovePlayers, false);
  assert.equal(adminView.permissions.canLeave, false);
  await expectServiceError(readCampaign(db, outsider, campaign.id), 404);
  await expectServiceError(readCampaign(db, null, campaign.id), 401);
});

test("campaign ownership remains authoritative when the owner also has the site-admin role", async () => {
  const { db } = await fixture();
  const campaign = await createCampaign(db, owner, { name: "Owner Admin" }, now);
  const ownerAsAdmin = { ...owner, role: "admin" };
  const ownerView = await readCampaign(db, ownerAsAdmin, campaign.id);

  assert.equal(ownerView.isOwner, true);
  assert.equal(ownerView.membershipRole, "gm");
  assert.equal(ownerView.permissions.canInviteMembers, true);
  assert.equal(ownerView.permissions.canManageContent, true);
  assert.equal(ownerView.permissions.canLinkCharacters, true);
  assert.equal(ownerView.permissions.adminReadOnly, false);

  const described = await updateCampaignDescription(db, ownerAsAdmin, campaign.id, {
    description: "Owner-authored briefing.",
    version: ownerView.version,
  }, now);
  assert.equal(described.description, "Owner-authored briefing.");

  let resources = await createCampaignResource(db, ownerAsAdmin, campaign.id, {
    title: "Table Rules",
    type: "text",
    content: "Bring a character.",
  }, now);
  resources = await createCampaignResource(db, ownerAsAdmin, campaign.id, {
    title: "Campaign Map",
    type: "link",
    content: "https://example.com/map",
  }, now);
  resources = await reorderCampaignResource(
    db,
    ownerAsAdmin,
    campaign.id,
    resources[1].resourceKey,
    "up",
  );
  resources = await updateCampaignResource(
    db,
    ownerAsAdmin,
    campaign.id,
    resources[0].resourceKey,
    { title: "Regional Map", type: "link", content: "https://example.com/map" },
  );
  assert.deepEqual(resources.map(resource => resource.title), ["Regional Map", "Table Rules"]);
  resources = await deleteCampaignResource(
    db,
    ownerAsAdmin,
    campaign.id,
    resources[1].resourceKey,
  );
  assert.deepEqual(resources.map(resource => resource.title), ["Regional Map"]);
});

test("campaign and roster payloads omit emails, internal user IDs, and invite data", async () => {
  const { sqlite, db } = await fixture();
  const campaign = await createCampaign(db, owner, { name: "Private" }, now);
  await addMember(sqlite, campaign.id, player);
  const payload = JSON.stringify({
    campaign: await readCampaign(db, player, campaign.id),
    members: await listCampaignMembers(db, player, campaign.id),
  });
  for (const forbidden of [
    owner.userId,
    player.userId,
    "@example.invalid",
    "tokenHash",
    "token_hash",
    "invite",
  ]) {
    assert.equal(payload.includes(forbidden), false);
  }
});

test("only the owner can rename with optimistic version protection", async () => {
  const { db } = await fixture();
  const campaign = await createCampaign(db, owner, { name: "Before" }, now);
  const renamed = await updateCampaignName(db, owner, campaign.id, {
    name: "After",
    version: 1,
  }, "2026-08-16T13:00:00.000Z");
  assert.equal(renamed.name, "After");
  assert.equal(renamed.version, 2);
  await expectServiceError(updateCampaignName(db, owner, campaign.id, {
    name: "Stale",
    version: 1,
  }), 409);
});

test("member, admin, outsider, and unauthenticated settings changes are denied", async () => {
  const { sqlite, db } = await fixture();
  const campaign = await createCampaign(db, owner, { name: "Private" }, now);
  await addMember(sqlite, campaign.id, player);
  await expectServiceError(updateCampaignName(db, player, campaign.id, { name: "No", version: 1 }), 403);
  await expectServiceError(updateCampaignName(db, admin, campaign.id, { name: "No", version: 1 }), 403);
  await expectServiceError(updateCampaignName(db, outsider, campaign.id, { name: "No", version: 1 }), 404);
  await expectServiceError(updateCampaignName(db, null, campaign.id, { name: "No", version: 1 }), 401);
});

test("owner deletion cascades campaign state without deleting or changing characters", async () => {
  const { sqlite, db } = await fixture();
  sqlite.prepare(`
    INSERT INTO characters (id, owner_user_id, public_id, visibility, name)
    VALUES ('character-player', ?, 'chr_test', 'private', 'Survivor')
  `).run(player.userId);
  const campaign = await createCampaign(db, owner, { name: "Delete Me" }, now);
  await addMember(sqlite, campaign.id, player);
  const stored = internalCampaign(sqlite, campaign.id);
  sqlite.prepare(`
    INSERT INTO campaign_characters (campaign_id, character_id, added_at)
    VALUES (?, 'character-player', ?)
  `).run(stored.id, now);
  await deleteCampaign(db, owner, campaign.id);
  assert.equal(sqlite.prepare("SELECT count(*) AS count FROM campaigns").get().count, 0);
  assert.deepEqual(
    { ...sqlite.prepare(`
      SELECT owner_user_id AS ownerUserId, visibility
      FROM characters WHERE id = 'character-player'
    `).get() },
    { ownerUserId: player.userId, visibility: "private" },
  );
});

test("player, admin, outsider, and unauthenticated users cannot delete campaigns", async () => {
  const { sqlite, db } = await fixture();
  const campaign = await createCampaign(db, owner, { name: "Keep" }, now);
  await addMember(sqlite, campaign.id, player);
  await expectServiceError(deleteCampaign(db, player, campaign.id), 403);
  await expectServiceError(deleteCampaign(db, admin, campaign.id), 403);
  await expectServiceError(deleteCampaign(db, outsider, campaign.id), 404);
  await expectServiceError(deleteCampaign(db, null, campaign.id), 401);
  assert.equal(sqlite.prepare("SELECT count(*) AS count FROM campaigns").get().count, 1);
});

test("member removal cleans only that member's campaign links", async () => {
  const { sqlite, db } = await fixture();
  sqlite.prepare(`
    INSERT INTO characters (id, owner_user_id, public_id, visibility, name)
    VALUES ('character-player', ?, 'chr_player', 'unlisted', 'Player Character')
  `).run(player.userId);
  const campaign = await createCampaign(db, owner, { name: "Roster" }, now);
  await addMember(sqlite, campaign.id, gm, "gm");
  await addMember(sqlite, campaign.id, player);
  const stored = internalCampaign(sqlite, campaign.id);
  sqlite.prepare(`
    INSERT INTO campaign_characters (campaign_id, character_id, added_at)
    VALUES (?, 'character-player', ?)
  `).run(stored.id, now);
  await removeCampaignMember(db, gm, campaign.id, player.userId);
  assert.equal(sqlite.prepare("SELECT count(*) AS count FROM campaign_members WHERE user_id = ?").get(player.userId).count, 0);
  assert.equal(sqlite.prepare("SELECT count(*) AS count FROM campaign_characters").get().count, 0);
  assert.deepEqual(
    { ...sqlite.prepare("SELECT owner_user_id AS ownerUserId, visibility FROM characters WHERE id = 'character-player'").get() },
    { ownerUserId: player.userId, visibility: "unlisted" },
  );
});

test("privacy-safe roster keys support authorized removal without exposing user IDs", async () => {
  const { sqlite, db } = await fixture();
  const campaign = await createCampaign(db, owner, { name: "Roster" }, now);
  await addMember(sqlite, campaign.id, player);
  sqlite.prepare("UPDATE user SET display_name = ? WHERE id = ?")
    .run("Warden Rowan", player.userId);
  const roster = await listCampaignMembers(db, owner, campaign.id);
  const target = roster.find(member => member.name === "Warden Rowan");
  assert.match(target.memberKey, /^cmem_[0-9a-f]{32}$/u);
  assert.equal(target.memberKey.includes(player.userId), false);
  await removeCampaignMemberByKey(db, owner, campaign.id, target.memberKey);
  assert.equal(sqlite.prepare(
    "SELECT count(*) AS count FROM campaign_members WHERE user_id = ?",
  ).get(player.userId).count, 0);
});

test("players and site admins cannot remove members or the owner", async () => {
  const { sqlite, db } = await fixture();
  const campaign = await createCampaign(db, owner, { name: "Roster" }, now);
  await addMember(sqlite, campaign.id, player);
  await expectServiceError(removeCampaignMember(db, player, campaign.id, owner.userId), 403);
  await expectServiceError(removeCampaignMember(db, admin, campaign.id, player.userId), 403);
  await expectServiceError(removeCampaignMember(db, owner, campaign.id, owner.userId), 403);
});

test("ordinary members may leave without deleting characters; owners cannot leave", async () => {
  const { sqlite, db } = await fixture();
  sqlite.prepare(`
    INSERT INTO characters (id, owner_user_id, public_id, visibility, name)
    VALUES ('character-player', ?, 'chr_player', 'public', 'Player Character')
  `).run(player.userId);
  const campaign = await createCampaign(db, owner, { name: "Roster" }, now);
  await addMember(sqlite, campaign.id, player);
  const stored = internalCampaign(sqlite, campaign.id);
  sqlite.prepare(`
    INSERT INTO campaign_characters (campaign_id, character_id, added_at)
    VALUES (?, 'character-player', ?)
  `).run(stored.id, now);
  await leaveCampaign(db, player, campaign.id);
  assert.equal(sqlite.prepare("SELECT count(*) AS count FROM campaign_members WHERE user_id = ?").get(player.userId).count, 0);
  assert.deepEqual(
    { ...sqlite.prepare("SELECT owner_user_id AS ownerUserId, visibility FROM characters WHERE id = 'character-player'").get() },
    { ownerUserId: player.userId, visibility: "public" },
  );
  await expectServiceError(leaveCampaign(db, owner, campaign.id), 403);
});

test("route layer remains authenticated, bounded, and free of client owner IDs", async () => {
  const root = new URL("../", import.meta.url);
  const collection = await readFile(new URL("app/api/campaigns/route.ts", root), "utf8");
  const detail = await readFile(new URL("app/api/campaigns/[id]/route.ts", root), "utf8");
  const members = await readFile(new URL("app/api/campaigns/[id]/members/route.ts", root), "utf8");
  const membership = await readFile(new URL("app/api/campaigns/[id]/membership/route.ts", root), "utf8");
  const resources = await readFile(new URL("app/api/campaigns/[id]/resources/route.ts", root), "utf8");
  const resourceItem = await readFile(new URL("app/api/campaigns/[id]/resources/[resourceKey]/route.ts", root), "utf8");
  for (const route of [collection, detail, members, membership, resources, resourceItem]) {
    assert.match(route, /getSessionActor\(request\)/u);
    assert.doesNotMatch(route, /ownerUserId|email|tokenHash|token_hash/u);
  }
  assert.match(collection, /readBoundedJson\(request, 16 \* 1024\)/u);
  assert.match(detail, /readBoundedJson\(request, 16 \* 1024\)/u);
  assert.match(members, /readBoundedJson\(request, 8 \* 1024\)/u);
  assert.match(members, /removeCampaignMemberByKey/u);
  assert.match(membership, /leaveCampaign/u);
  assert.match(resources, /listCampaignResources|createCampaignResource/u);
  assert.match(resourceItem, /reorderCampaignResource|deleteCampaignResource/u);
});


test("archived campaigns remain readable while active mutations pause until owner restore", async () => {
  const { sqlite, db } = await fixture();
  const campaign = await createCampaign(db, owner, { name: "Retired Company" }, now);
  await addMember(sqlite, campaign.id, player);
  const archived = await setCampaignArchived(db, owner, campaign.id, true, now);
  assert.equal(archived.archivedAt, now);
  assert.equal(archived.permissions.canRestore, true);
  assert.equal((await readCampaign(db, player, campaign.id)).archivedAt, now);
  assert.equal((await listCampaigns(db, player))[0].archivedAt, now);
  await expectServiceError(updateCampaignDescription(db, owner, campaign.id, { description: "No", version: archived.version }), 409);
  await expectServiceError(createCampaignResource(db, owner, campaign.id, { title: "No", type: "text", content: "No" }), 409);
  await expectServiceError(removeCampaignMember(db, owner, campaign.id, player.userId), 409);
  await expectServiceError(setCampaignArchived(db, admin, campaign.id, false), 403);
  await expectServiceError(setCampaignArchived(db, player, campaign.id, false), 403);
  const restored = await setCampaignArchived(db, owner, campaign.id, false, now);
  assert.equal(restored.archivedAt, null);
  assert.equal((await updateCampaignName(db, owner, campaign.id, { name: "Returned Company", version: restored.version }, now)).name, "Returned Company");
});
