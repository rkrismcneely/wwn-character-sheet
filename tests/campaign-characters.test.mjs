import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  linkCharacterToCampaign,
  listAuthorizedCharacterCampaigns,
  listCampaignCharacters,
  listEligibleCampaignCharacters,
  readCampaignLinkedCharacter,
  replaceCampaignCharacter,
  unlinkCharacterFromCampaign,
} from "../lib/campaigns/characters.ts";
import { listGmPartyCharacters } from "../lib/campaigns/gm-party.ts";
import { generatePublicCharacterId } from "../lib/characters/identifiers.ts";
import { canReadCharacter } from "../lib/characters/authorization.ts";
import {
  CampaignServiceError,
  createCampaign,
} from "../lib/campaigns/service.ts";

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
      email TEXT NOT NULL,
      role TEXT DEFAULT 'user' NOT NULL
    );
    CREATE TABLE characters (
      id TEXT PRIMARY KEY NOT NULL,
      owner_user_id TEXT,
      public_id TEXT UNIQUE,
      visibility TEXT DEFAULT 'private' NOT NULL,
      portrait_key TEXT,
      name TEXT DEFAULT '' NOT NULL,
      player TEXT DEFAULT '' NOT NULL,
      class_label TEXT DEFAULT '' NOT NULL,
      level INTEGER DEFAULT 1 NOT NULL,
      data TEXT DEFAULT '{}' NOT NULL,
      version INTEGER DEFAULT 1 NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (owner_user_id) REFERENCES user(id) ON DELETE SET NULL
    );
  `);
  const insertUser = sqlite.prepare(
    "INSERT INTO user (id, name, email, role) VALUES (?, ?, ?, ?)",
  );
  for (const [actor, name] of [
    [owner, "Campaign Owner"],
    [gm, "Campaign GM"],
    [player, "Campaign Player"],
    [outsider, "Campaign Outsider"],
    [admin, "Site Administrator"],
  ]) {
    insertUser.run(actor.userId, name, `${actor.userId}@example.invalid`, actor.role);
  }
  const migration = await readFile(
    new URL("../drizzle/0006_campaign_foundation.sql", import.meta.url),
    "utf8",
  );
  for (const statement of migration.split("--> statement-breakpoint")) {
    if (statement.trim()) sqlite.exec(statement);
  }
  const lifecycle = await readFile(new URL("../drizzle/0009_character_campaign_lifecycle.sql", import.meta.url), "utf8");
  for (const statement of lifecycle.split("--> statement-breakpoint")) {
    if (statement.trim()) sqlite.exec(statement);
  }
  const db = new TestD1(sqlite);
  const campaign = await createCampaign(db, owner, { name: "Amber Company" }, now);
  const secondCampaign = await createCampaign(db, owner, { name: "Second Company" }, now);
  for (const [actor, role] of [[gm, "gm"], [player, "player"]]) {
    for (const campaignId of [campaign.id, secondCampaign.id]) {
      sqlite.prepare(`
        INSERT INTO campaign_members (campaign_id, user_id, role, joined_at)
        SELECT id, ?, ?, ? FROM campaigns WHERE public_id = ?
      `).run(actor.userId, role, now, campaignId);
    }
  }

  const ids = {
    owner: generatePublicCharacterId(),
    gm: generatePublicCharacterId(),
    player: generatePublicCharacterId(),
    playerSecond: generatePublicCharacterId(),
    outsider: generatePublicCharacterId(),
    admin: generatePublicCharacterId(),
  };
  const insertCharacter = sqlite.prepare(`
    INSERT INTO characters
      (id, owner_user_id, public_id, visibility, portrait_key, name, player,
       class_label, level, data, version, created_at, updated_at)
    VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, 1, ?, ?)
  `);
  for (const [key, actor, name, visibility, level] of [
    ["owner", owner, "Owner Hero", "private", 4],
    ["gm", gm, "GM Hero", "unlisted", 3],
    ["player", player, "Player Hero", "private", 2],
    ["playerSecond", player, "Player Second Hero", "private", 1],
    ["outsider", outsider, "Outsider Hero", "public", 5],
    ["admin", admin, "Admin Hero", "private", 1],
  ]) {
    insertCharacter.run(
      `character-${key}`,
      actor.userId,
      ids[key],
      visibility,
      name,
      `${name} Player`,
      "Expert",
      level,
      JSON.stringify({
        name,
        classOne: "Expert",
        classMode: "full",
        level,
        attrs: { DEX: 12, CON: 10 },
        armor: "War Shirt",
        shield: "",
        armorBonus: 0,
        hpCurrent: level,
        hpMax: level + 5,
        portrait: key === "player" ? "/api/portraits/portraits/character-player/example.webp" : "",
        secretNote: `${name} secret`,
      }),
      now,
      now,
    );
  }
  sqlite.prepare("UPDATE characters SET portrait_key = ? WHERE id = ?").run("portraits/character-player/example.webp", "character-player");
  return { sqlite, db, campaign, secondCampaign, ids };
}

async function expectServiceError(promise, status) {
  await assert.rejects(
    promise,
    error => error instanceof CampaignServiceError && error.status === status,
  );
}

test("eligible characters are restricted to the current member's owned, unlinked roster", async () => {
  const { db, campaign, ids } = await fixture();
  const eligible = await listEligibleCampaignCharacters(db, player, campaign.id);
  assert.deepEqual(
    new Set(eligible.map(character => character.id)),
    new Set([ids.player, ids.playerSecond]),
  );
  assert.equal(eligible.every(character => character.isMine), true);
  assert.equal(JSON.stringify(eligible).includes("user-player"), false);
  assert.equal(JSON.stringify(eligible).includes("@example.invalid"), false);
  assert.deepEqual(
    (await listEligibleCampaignCharacters(db, admin, campaign.id)).map(character => character.id),
    [ids.admin],
  );
});

test("campaign owners, site admins, members, and GMs link only their own characters", async () => {
  const { sqlite, db, campaign, ids } = await fixture();
  const ownerAsAdmin = { ...owner, role: "admin" };
  sqlite.prepare("DELETE FROM campaign_members WHERE campaign_id = ? AND user_id = ?")
    .run(campaign.id, owner.userId);

  const ownerBefore = { ...sqlite.prepare(`
    SELECT owner_user_id AS ownerUserId, visibility, data
    FROM characters WHERE public_id = ?
  `).get(ids.owner) };
  assert.deepEqual(
    (await listEligibleCampaignCharacters(db, ownerAsAdmin, campaign.id)).map(character => character.id),
    [ids.owner],
  );
  const ownerLink = await linkCharacterToCampaign(db, ownerAsAdmin, campaign.id, ids.owner, now);
  assert.equal(ownerLink.id, ids.owner);
  assert.equal(ownerLink.permissions.canUnlink, true);
  assert.deepEqual(
    await listAuthorizedCharacterCampaigns(db, owner, ids.owner),
    [{ id: campaign.id, name: "Amber Company" }],
  );
  await expectServiceError(linkCharacterToCampaign(db, ownerAsAdmin, campaign.id, ids.outsider), 403);
  await expectServiceError(linkCharacterToCampaign(db, ownerAsAdmin, campaign.id, ids.owner, now), 409);
  await unlinkCharacterFromCampaign(db, ownerAsAdmin, campaign.id, ids.owner);
  assert.equal(Number(sqlite.prepare(`
    SELECT count(*) AS count FROM campaign_characters WHERE campaign_id = ? AND character_id = 'character-owner'
  `).get(campaign.id).count), 0);
  assert.deepEqual(
    { ...sqlite.prepare(`
      SELECT owner_user_id AS ownerUserId, visibility, data
      FROM characters WHERE public_id = ?
    `).get(ids.owner) },
    ownerBefore,
  );

  assert.equal((await linkCharacterToCampaign(db, player, campaign.id, ids.player, now)).id, ids.player);
  assert.equal((await linkCharacterToCampaign(db, gm, campaign.id, ids.gm, now)).id, ids.gm);
  await expectServiceError(linkCharacterToCampaign(db, gm, campaign.id, ids.player), 403);
  await expectServiceError(linkCharacterToCampaign(db, player, campaign.id, ids.outsider), 403);
  await expectServiceError(linkCharacterToCampaign(db, outsider, campaign.id, ids.outsider), 404);
  assert.equal((await linkCharacterToCampaign(db, admin, campaign.id, ids.admin, now)).id, ids.admin);
  await expectServiceError(linkCharacterToCampaign(db, admin, campaign.id, ids.player), 403);
  await expectServiceError(linkCharacterToCampaign(db, null, campaign.id, ids.player), 401);
});

test("one member can link only one character per campaign while a character can join multiple campaigns", async () => {
  const { sqlite, db, campaign, secondCampaign, ids } = await fixture();
  await linkCharacterToCampaign(db, player, campaign.id, ids.player, now);

  await expectServiceError(
    linkCharacterToCampaign(db, player, campaign.id, ids.player, now),
    409,
  );
  await expectServiceError(
    linkCharacterToCampaign(db, player, campaign.id, ids.playerSecond, now),
    409,
  );
  assert.deepEqual(
    (await listEligibleCampaignCharacters(db, player, campaign.id)).map(character => character.id),
    [ids.playerSecond],
  );

  await linkCharacterToCampaign(db, player, secondCampaign.id, ids.player, now);
  const linkCount = sqlite.prepare(`
    SELECT count(*) AS count FROM campaign_characters
    WHERE character_id = 'character-player'
  `).get().count;
  assert.equal(Number(linkCount), 2);
});

test("character owners receive only their authorized minimal campaign navigation", async () => {
  const { db, campaign, secondCampaign, ids } = await fixture();
  assert.deepEqual(await listAuthorizedCharacterCampaigns(db, player, ids.player), []);
  await linkCharacterToCampaign(db, player, campaign.id, ids.player, now);
  await linkCharacterToCampaign(db, player, secondCampaign.id, ids.player, now);

  assert.deepEqual(
    await listAuthorizedCharacterCampaigns(db, player, ids.player),
    [
      { id: campaign.id, name: "Amber Company" },
      { id: secondCampaign.id, name: "Second Company" },
    ],
  );
  assert.deepEqual(await listAuthorizedCharacterCampaigns(db, outsider, ids.player), []);
  assert.deepEqual(await listAuthorizedCharacterCampaigns(db, admin, ids.player), []);
  assert.deepEqual(await listAuthorizedCharacterCampaigns(db, null, ids.player), []);
  assert.deepEqual(await listAuthorizedCharacterCampaigns(db, player, ids.outsider), []);
});

test("ordinary player atomically replaces only their own linked character", async () => {
  const { sqlite, db, campaign, ids } = await fixture();
  await linkCharacterToCampaign(db, player, campaign.id, ids.player, now);
  const oldBefore = { ...sqlite.prepare(`
    SELECT owner_user_id AS ownerUserId, visibility, data
    FROM characters WHERE public_id = ?
  `).get(ids.player) };
  const replacementBefore = { ...sqlite.prepare(`
    SELECT owner_user_id AS ownerUserId, visibility, data
    FROM characters WHERE public_id = ?
  `).get(ids.playerSecond) };

  const replacement = await replaceCampaignCharacter(
    db,
    player,
    campaign.id,
    ids.player,
    ids.playerSecond,
    "2026-08-16T13:00:00.000Z",
  );
  assert.equal(replacement.id, ids.playerSecond);
  assert.equal(replacement.isMine, true);
  assert.equal(Number(sqlite.prepare(`
    SELECT count(*) AS count
    FROM campaign_characters cc
    INNER JOIN characters ch ON ch.id = cc.character_id
    WHERE cc.campaign_id = (SELECT id FROM campaigns WHERE public_id = ?)
      AND ch.owner_user_id = ?
  `).get(campaign.id, player.userId).count), 1);
  assert.equal(sqlite.prepare(`
    SELECT ch.public_id AS publicId
    FROM campaign_characters cc
    INNER JOIN characters ch ON ch.id = cc.character_id
    WHERE cc.campaign_id = (SELECT id FROM campaigns WHERE public_id = ?)
      AND ch.owner_user_id = ?
  `).get(campaign.id, player.userId).publicId, ids.playerSecond);
  assert.equal(sqlite.prepare(`
    SELECT role FROM campaign_members
    WHERE campaign_id = (SELECT id FROM campaigns WHERE public_id = ?)
      AND user_id = ?
  `).get(campaign.id, player.userId).role, "player");
  assert.deepEqual({ ...sqlite.prepare(`SELECT owner_user_id AS ownerUserId, visibility, data FROM characters WHERE public_id = ?`).get(ids.player) }, oldBefore);
  assert.deepEqual({ ...sqlite.prepare(`SELECT owner_user_id AS ownerUserId, visibility, data FROM characters WHERE public_id = ?`).get(ids.playerSecond) }, replacementBefore);

  await expectServiceError(readCampaignLinkedCharacter(db, gm, campaign.id, ids.player), 404);
  assert.equal((await readCampaignLinkedCharacter(db, gm, campaign.id, ids.playerSecond)).character.name, "Player Second Hero");
  assert.deepEqual(
    new Set((await listEligibleCampaignCharacters(db, player, campaign.id)).map(character => character.id)),
    new Set([ids.player]),
  );
});

test("replacement revalidates ownership, player role, and current link without losing it", async () => {
  const { sqlite, db, campaign, ids } = await fixture();
  await linkCharacterToCampaign(db, player, campaign.id, ids.player, now);
  for (const [actor, replacementId, status] of [
    [outsider, ids.outsider, 404],
    [gm, ids.gm, 403],
    [owner, ids.owner, 403],
    [admin, ids.admin, 403],
    [player, ids.outsider, 403],
  ]) {
    await expectServiceError(
      replaceCampaignCharacter(db, actor, campaign.id, ids.player, replacementId),
      status,
    );
  }
  assert.equal(sqlite.prepare(`
    SELECT ch.public_id AS publicId
    FROM campaign_characters cc
    INNER JOIN characters ch ON ch.id = cc.character_id
    WHERE cc.campaign_id = (SELECT id FROM campaigns WHERE public_id = ?)
  `).get(campaign.id).publicId, ids.player);

  await replaceCampaignCharacter(db, player, campaign.id, ids.player, ids.playerSecond);
  await expectServiceError(
    replaceCampaignCharacter(db, player, campaign.id, ids.player, ids.playerSecond),
    409,
  );
  assert.equal(sqlite.prepare(`
    SELECT ch.public_id AS publicId
    FROM campaign_characters cc
    INNER JOIN characters ch ON ch.id = cc.character_id
    WHERE cc.campaign_id = (SELECT id FROM campaigns WHERE public_id = ?)
  `).get(campaign.id).publicId, ids.playerSecond);
});

test("campaign character library is visible only to participants and read-only admin", async () => {
  const { sqlite, db, campaign, ids } = await fixture();
  sqlite.prepare("UPDATE user SET display_name = ? WHERE id = ?")
    .run("Warden Rowan", player.userId);
  await linkCharacterToCampaign(db, player, campaign.id, ids.player, now);
  for (const actor of [owner, gm, player, admin]) {
    const library = await listCampaignCharacters(db, actor, campaign.id);
    assert.equal(library.length, 1);
    assert.equal(library[0].ownerName, "Warden Rowan");
    assert.equal(library[0].classLabel, "Expert");
    assert.equal(library[0].portraitUrl, `/api/campaigns/${campaign.id}/characters/${ids.player}/portrait`);
    assert.equal(library[0].hpCurrent, 2);
    assert.equal(library[0].hpMax, 7);
    assert.equal(library[0].armorClass, 11);
    assert.equal(library[0].isMine, actor === player);
  }
  const adminView = await listCampaignCharacters(db, admin, campaign.id);
  assert.deepEqual(adminView[0].permissions, {
    canUnlink: false,
    canEdit: false,
    adminReadOnly: true,
  });
  await expectServiceError(listCampaignCharacters(db, outsider, campaign.id), 404);
  await expectServiceError(listCampaignCharacters(db, null, campaign.id), 401);
});

test("campaign threat levels include an owner's linked character and reject malformed stored levels", async () => {
  const { sqlite, db, campaign, ids } = await fixture();
  await linkCharacterToCampaign(db, owner, campaign.id, ids.owner, now);
  await linkCharacterToCampaign(db, player, campaign.id, ids.player, now);
  const linked = await listCampaignCharacters(db, owner, campaign.id);
  assert.deepEqual(linked.map(character => [character.id, character.threatLevel]), [[ids.owner, 4], [ids.player, 2]]);

  sqlite.prepare("UPDATE characters SET level = 0 WHERE public_id = ?").run(ids.owner);
  const malformed = await listCampaignCharacters(db, owner, campaign.id);
  assert.equal(malformed.find(character => character.id === ids.owner)?.threatLevel, null);
});

test("campaign participants can read a linked private character through campaign context", async () => {
  const { db, campaign, ids } = await fixture();
  await linkCharacterToCampaign(db, player, campaign.id, ids.player, now);
  for (const actor of [owner, gm, admin]) {
    const payload = await readCampaignLinkedCharacter(db, actor, campaign.id, ids.player);
    assert.equal(payload.character.name, "Player Hero");
    assert.equal(payload.permissions.canEdit, false);
    assert.equal(payload.campaignContext.readOnly, true);
    assert.equal(
      payload.character.portrait,
      `/api/campaigns/${campaign.id}/characters/${ids.player}/portrait`,
    );
  }
  const ownerPayload = await readCampaignLinkedCharacter(db, player, campaign.id, ids.player);
  assert.equal(ownerPayload.permissions.canEdit, true);
  assert.equal(ownerPayload.campaignContext.readOnly, false);
  assert.equal(ownerPayload.character.portrait, "/api/portraits/portraits/character-player/example.webp");
  await expectServiceError(readCampaignLinkedCharacter(db, outsider, campaign.id, ids.player), 404);
  await expectServiceError(readCampaignLinkedCharacter(db, null, campaign.id, ids.player), 401);
});

test("campaign membership without a matching link grants no character access", async () => {
  const { db, campaign, ids } = await fixture();
  await expectServiceError(readCampaignLinkedCharacter(db, gm, campaign.id, ids.player), 404);
  await linkCharacterToCampaign(db, player, campaign.id, ids.player, now);
  await expectServiceError(readCampaignLinkedCharacter(db, gm, campaign.id, ids.owner), 404);
});

test("only the character owner can unlink and unlink preserves the character", async () => {
  const { sqlite, db, campaign, ids } = await fixture();
  await linkCharacterToCampaign(db, player, campaign.id, ids.player, now);
  await expectServiceError(unlinkCharacterFromCampaign(db, gm, campaign.id, ids.player), 403);
  await expectServiceError(unlinkCharacterFromCampaign(db, owner, campaign.id, ids.player), 403);
  await expectServiceError(unlinkCharacterFromCampaign(db, admin, campaign.id, ids.player), 403);
  await unlinkCharacterFromCampaign(db, player, campaign.id, ids.player);
  assert.equal(Number(sqlite.prepare("SELECT count(*) AS count FROM campaign_characters").get().count), 0);
  assert.deepEqual(
    { ...sqlite.prepare(`
      SELECT owner_user_id AS ownerUserId, visibility, public_id AS publicId,
             portrait_key AS portraitKey, name
      FROM characters WHERE id = 'character-player'
    `).get() },
    {
      ownerUserId: player.userId,
      visibility: "private",
      publicId: ids.player,
      portraitKey: "portraits/character-player/example.webp",
      name: "Player Hero",
    },
  );
});

test("linking never widens global direct-route visibility", async () => {
  const { sqlite, db, campaign, ids } = await fixture();
  await linkCharacterToCampaign(db, player, campaign.id, ids.player, now);
  const row = sqlite.prepare(`
    SELECT id, owner_user_id AS ownerUserId, visibility
    FROM characters WHERE public_id = ?
  `).get(ids.player);
  assert.equal(row.visibility, "private");
  assert.equal(canReadCharacter(gm, row), false);
  assert.equal(canReadCharacter(outsider, row), false);
  assert.equal(canReadCharacter(player, row), true);
  await unlinkCharacterFromCampaign(db, player, campaign.id, ids.player);
  assert.equal(sqlite.prepare("SELECT visibility FROM characters WHERE public_id = ?").get(ids.player).visibility, "private");
});

test("campaign character payloads omit account IDs, emails, and unrelated private data", async () => {
  const { db, campaign, ids } = await fixture();
  await linkCharacterToCampaign(db, player, campaign.id, ids.player, now);
  const payload = JSON.stringify(await listCampaignCharacters(db, gm, campaign.id));
  for (const forbidden of [
    player.userId,
    outsider.userId,
    "@example.invalid",
    "Outsider Hero",
    "secretNote",
  ]) assert.equal(payload.includes(forbidden), false, forbidden);
  assert.equal(payload.includes("systemStrain"), false);
});

test("owner-only GM party status is derived from the current linked character snapshot", async () => {
  const { sqlite, db, campaign, ids } = await fixture();
  await linkCharacterToCampaign(db, player, campaign.id, ids.player, now);
  sqlite.prepare("UPDATE characters SET data = ? WHERE public_id = ?").run(JSON.stringify({
    name: "Player Hero", classOne: "High Mage", classMode: "full", level: 3,
    attrs: { STR: 10, DEX: 12, CON: 14, INT: 16, WIS: 9, CHA: 11 }, armor: "No Armor", shield: "",
    hpCurrent: 9, hpMax: 12, strainCurrent: 2, strainMax: 14,
    spellPicks: [{ name: "Velocitous Imbuement", prepared: true, cast: true }], artEffort: [true],
  }), ids.player);
  const [status] = await listGmPartyCharacters(db, owner, campaign.id);
  assert.equal(status.name, "Player Hero");
  assert.equal(status.player, "Player Hero Player");
  assert.deepEqual(status.systemStrain, { current: 2, max: 14 });
  assert.deepEqual(status.saves, { physical: 12, evasion: 12, mental: 13, luck: 13 });
  assert.deepEqual(status.spellUsage, { label: "Cast today", used: 1, max: 2 });
  assert.equal(status.effortCommitted, 1);
  await expectServiceError(listGmPartyCharacters(db, gm, campaign.id), 403);
  assert.equal(JSON.stringify(await listCampaignCharacters(db, gm, campaign.id)).includes("systemStrain"), false);
});


test("archived characters keep existing scoped access but cannot be newly linked", async () => {
  const { sqlite, db, campaign, ids } = await fixture();
  await linkCharacterToCampaign(db, player, campaign.id, ids.player, now);
  sqlite.prepare("UPDATE characters SET archived_at = ? WHERE public_id = ?").run(now, ids.player);
  assert.equal((await listCampaignCharacters(db, gm, campaign.id))[0].id, ids.player);
  assert.equal((await readCampaignLinkedCharacter(db, gm, campaign.id, ids.player)).archivedAt, now);
  await unlinkCharacterFromCampaign(db, player, campaign.id, ids.player);
  await expectServiceError(linkCharacterToCampaign(db, player, campaign.id, ids.player), 403);
  assert.equal((await listEligibleCampaignCharacters(db, player, campaign.id)).some(character => character.id === ids.player), false);
});

test("archived campaigns retain linked-character reads and reject link replacement", async () => {
  const { sqlite, db, campaign, ids } = await fixture();
  await linkCharacterToCampaign(db, player, campaign.id, ids.player, now);
  sqlite.prepare("UPDATE campaigns SET archived_at = ? WHERE public_id = ?").run(now, campaign.id);
  assert.equal((await listCampaignCharacters(db, gm, campaign.id))[0].id, ids.player);
  assert.deepEqual(await listEligibleCampaignCharacters(db, player, campaign.id), []);
  await expectServiceError(replaceCampaignCharacter(db, player, campaign.id, ids.player, ids.playerSecond), 409);
});
