import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  CampaignServiceError,
  createCampaign,
  deleteCampaign,
  leaveCampaign,
  listCampaignMembers,
  listCampaigns,
  normalizeCampaignName,
  readCampaign,
  removeCampaignMember,
  removeCampaignMemberByKey,
  updateCampaignName,
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
      email TEXT NOT NULL
    );
    CREATE TABLE characters (
      id TEXT PRIMARY KEY NOT NULL,
      owner_user_id TEXT,
      public_id TEXT,
      visibility TEXT NOT NULL,
      name TEXT NOT NULL,
      FOREIGN KEY (owner_user_id) REFERENCES user(id) ON DELETE SET NULL
    );
  `);
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
  const migration = await readFile(
    new URL("../drizzle/0006_campaign_foundation.sql", import.meta.url),
    "utf8",
  );
  for (const statement of migration.split("--> statement-breakpoint")) {
    if (statement.trim()) sqlite.exec(statement);
  }
  return { sqlite, db: new TestD1(sqlite) };
}

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

test("signed-in creation atomically establishes the creator as owner and GM", async () => {
  const { sqlite, db } = await fixture();
  const campaign = await createCampaign(db, owner, { name: "Amber Company" }, now);
  assert.match(campaign.id, /^cmp_[A-Za-z0-9_-]{22}$/u);
  assert.equal(campaign.name, "Amber Company");
  assert.equal(campaign.membershipRole, "gm");
  assert.equal(campaign.isOwner, true);
  assert.deepEqual(campaign.permissions, {
    canManageSettings: true,
    canDelete: true,
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
  assert.equal(adminView.permissions.canInviteMembers, false);
  assert.equal(adminView.permissions.canRemovePlayers, false);
  assert.equal(adminView.permissions.canLeave, false);
  await expectServiceError(readCampaign(db, outsider, campaign.id), 404);
  await expectServiceError(readCampaign(db, null, campaign.id), 401);
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
  const roster = await listCampaignMembers(db, owner, campaign.id);
  const target = roster.find(member => member.name === "Campaign Player");
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
  for (const route of [collection, detail, members, membership]) {
    assert.match(route, /getSessionActor\(request\)/u);
    assert.doesNotMatch(route, /ownerUserId|email|tokenHash|token_hash/u);
  }
  assert.match(collection, /readBoundedJson\(request, 16 \* 1024\)/u);
  assert.match(detail, /readBoundedJson\(request, 16 \* 1024\)/u);
  assert.match(members, /readBoundedJson\(request, 8 \* 1024\)/u);
  assert.match(members, /removeCampaignMemberByKey/u);
  assert.match(membership, /leaveCampaign/u);
});
