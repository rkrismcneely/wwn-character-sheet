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
  authorizeLiveSessionConnection,
  endLiveSession,
  joinLiveSession,
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
  for (const migrationName of ["0006_campaign_foundation.sql", "0008_campaign_resources.sql", "0010_campaign_live_sessions.sql"]) {
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
  await joinLiveSession(db, player, campaign.id, now);
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

test("live-session state keeps administrators read-only and does not expose durable user ids", async () => {
  const { sqlite, db } = await fixture();
  const campaign = await createCampaign(db, owner, { name: "Read only session" }, now);
  await addMember(sqlite, campaign.id, player);
  await startLiveSession(db, owner, campaign.id, now);
  const memberState = await readLiveSession(db, player, campaign.id);
  assert.equal(memberState.permissions.canJoin, true);
  assert.equal(Object.hasOwn(memberState.session.participants[0], "userId"), false);
  const adminState = await readLiveSession(db, admin, campaign.id);
  assert.equal(adminState.permissions.adminReadOnly, true);
  assert.equal(adminState.permissions.canJoin, false);
  assert.equal(adminState.permissions.canStart, false);
  await addMember(sqlite, campaign.id, admin);
  await expectServiceError(joinLiveSession(db, admin, campaign.id, now), 403);
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
