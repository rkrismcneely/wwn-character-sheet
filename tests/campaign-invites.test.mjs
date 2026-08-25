import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  CAMPAIGN_INVITE_DEFAULT_TTL_MS,
  createCampaignInvite,
  previewCampaignInvite,
  redeemCampaignInvite,
  revokeCampaignInvite,
} from "../lib/campaigns/invite-service.ts";
import {
  generateCampaignInviteToken,
  hashCampaignInviteToken,
} from "../lib/campaigns/identifiers.ts";
import { campaignInviteLink } from "../lib/campaigns/invite-link.ts";
import { CANONICAL_ORIGIN } from "../lib/auth-constants.ts";
import {
  CampaignServiceError,
  createCampaign,
  setCampaignArchived,
} from "../lib/campaigns/service.ts";

const owner = { userId: "user-owner", role: "user" };
const gm = { userId: "user-gm", role: "user" };
const player = { userId: "user-player", role: "user" };
const outsider = { userId: "user-outsider", role: "user" };
const secondOutsider = { userId: "user-second-outsider", role: "user" };
const admin = { userId: "user-admin", role: "admin" };
const now = new Date("2026-08-16T12:00:00.000Z");
const characterIds = {
  [owner.userId]: "chr_AAAAAAAAAAAAAAAAAAAAAA",
  [gm.userId]: "chr_BBBBBBBBBBBBBBBBBBBBBB",
  [player.userId]: "chr_CCCCCCCCCCCCCCCCCCCCCC",
  [outsider.userId]: "chr_DDDDDDDDDDDDDDDDDDDDDD",
  [secondOutsider.userId]: "chr_EEEEEEEEEEEEEEEEEEEEEE",
  [admin.userId]: "chr_FFFFFFFFFFFFFFFFFFFFFF",
};

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
    this.preparedSql = [];
  }

  prepare(sql) {
    this.preparedSql.push(sql);
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
      email TEXT NOT NULL,
      role TEXT DEFAULT 'user' NOT NULL
    );
    CREATE TABLE characters (
      id TEXT PRIMARY KEY NOT NULL,
      owner_user_id TEXT,
      public_id TEXT,
      visibility TEXT NOT NULL,
      name TEXT NOT NULL,
      class_label TEXT NOT NULL,
      level INTEGER NOT NULL,
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
    [secondOutsider, "Second Outsider"],
    [admin, "Site Administrator"],
  ]) {
    insertUser.run(
      actor.userId,
      name,
      `${actor.userId}@example.invalid`,
      actor.role,
    );
  }
  const insertCharacter = sqlite.prepare(
    `INSERT INTO characters
       (id, owner_user_id, public_id, visibility, name, class_label, level, updated_at)
     VALUES (?, ?, ?, 'private', ?, 'Adventurer', 1, ?)`,
  );
  for (const [actor, name] of [
    [owner, "Owner Hero"],
    [gm, "GM Hero"],
    [player, "Player Hero"],
    [outsider, "Outsider Hero"],
    [secondOutsider, "Second Outsider Hero"],
    [admin, "Admin Hero"],
  ]) {
    insertCharacter.run(
      `character-${actor.userId}`,
      actor.userId,
      characterIds[actor.userId],
      name,
      now.toISOString(),
    );
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
  return { sqlite, db: new TestD1(sqlite) };
}

async function campaignFixture() {
  const context = await fixture();
  const campaign = await createCampaign(
    context.db,
    owner,
    { name: "The Amber Company" },
    now.toISOString(),
  );
  return { ...context, campaign };
}

async function addMember(sqlite, campaignPublicId, actor, role = "player") {
  sqlite.prepare(`
    INSERT INTO campaign_members (campaign_id, user_id, role, joined_at)
    SELECT id, ?, ?, ? FROM campaigns WHERE public_id = ?
  `).run(actor.userId, role, now.toISOString(), campaignPublicId);
}

async function expectServiceError(promise, status) {
  await assert.rejects(
    promise,
    error => error instanceof CampaignServiceError && error.status === status,
  );
}

function storedInvite(sqlite, tokenHash) {
  return sqlite.prepare(`
    SELECT id, campaign_id AS campaignId, token_hash AS tokenHash, role,
           created_by_user_id AS createdByUserId, created_at AS createdAt,
           expires_at AS expiresAt, accepted_at AS acceptedAt,
           accepted_by_user_id AS acceptedByUserId, revoked_at AS revokedAt
    FROM campaign_invites WHERE token_hash = ?
  `).get(tokenHash);
}

test("owner creates a seven-day cminv_ invitation stored only as SHA-256", async () => {
  const { sqlite, db, campaign } = await campaignFixture();
  const invite = await createCampaignInvite(db, owner, campaign.id, now);

  assert.match(invite.token, /^cminv_[A-Za-z0-9_-]{43}$/u);
  assert.equal(
    Date.parse(invite.expiresAt) - now.getTime(),
    CAMPAIGN_INVITE_DEFAULT_TTL_MS,
  );
  assert.deepEqual(invite.campaign, {
    id: campaign.id,
    name: "The Amber Company",
  });

  const tokenHash = await hashCampaignInviteToken(invite.token);
  const stored = storedInvite(sqlite, tokenHash);
  assert.match(stored.tokenHash, /^[0-9a-f]{64}$/u);
  assert.equal(stored.tokenHash, tokenHash);
  assert.equal(stored.role, "player");
  assert.equal(stored.createdByUserId, owner.userId);
  assert.equal(stored.acceptedAt, null);
  assert.equal(stored.revokedAt, null);
  assert.equal(JSON.stringify(stored).includes(invite.token), false);
  assert.equal(JSON.stringify(invite).includes(tokenHash), false);
});

test("created cminv_ credentials produce canonical fragment invite links without internal IDs", async () => {
  const { db, campaign } = await campaignFixture();
  const invite = await createCampaignInvite(db, owner, campaign.id, now);
  const link = campaignInviteLink(invite.token);
  const url = new URL(link);

  assert.equal(url.origin, CANONICAL_ORIGIN);
  assert.equal(url.pathname, "/campaigns/join");
  assert.equal(url.search, "");
  assert.equal(url.hash, `#${invite.token}`);
  assert.equal(link.includes(campaign.id), false);
  assert.equal(link.includes(owner.userId), false);
});

test("campaign GM can create a player invitation", async () => {
  const { sqlite, db, campaign } = await campaignFixture();
  await addMember(sqlite, campaign.id, gm, "gm");
  const invite = await createCampaignInvite(db, gm, campaign.id, now);
  const stored = storedInvite(sqlite, await hashCampaignInviteToken(invite.token));
  assert.equal(stored.role, "player");
  assert.equal(stored.createdByUserId, gm.userId);
});

test("a campaign owner can create and revoke invites when the same account is also a site admin", async () => {
  const { sqlite, db, campaign } = await campaignFixture();
  const ownerAsAdmin = { ...owner, role: "admin" };
  const invite = await createCampaignInvite(db, ownerAsAdmin, campaign.id, now);
  const tokenHash = await hashCampaignInviteToken(invite.token);
  assert.equal(storedInvite(sqlite, tokenHash).createdByUserId, owner.userId);

  await revokeCampaignInvite(db, ownerAsAdmin, campaign.id, invite.token, now);
  assert.equal(storedInvite(sqlite, tokenHash).revokedAt, now.toISOString());
});

test("players, unrelated site admins, outsiders, and signed-out callers cannot create invites", async () => {
  const { sqlite, db, campaign } = await campaignFixture();
  await addMember(sqlite, campaign.id, player);
  await expectServiceError(createCampaignInvite(db, player, campaign.id, now), 403);
  await expectServiceError(createCampaignInvite(db, admin, campaign.id, now), 403);
  await expectServiceError(createCampaignInvite(db, outsider, campaign.id, now), 404);
  await expectServiceError(createCampaignInvite(db, null, campaign.id, now), 401);
});

test("valid signed-in redemption consumes the invite and creates one player membership", async () => {
  const { sqlite, db, campaign } = await campaignFixture();
  const invite = await createCampaignInvite(db, owner, campaign.id, now);
  const redeemedAt = new Date("2026-08-16T12:30:00.000Z");
  const redeemed = await redeemCampaignInvite(db, outsider, invite.token, characterIds[outsider.userId], redeemedAt);

  assert.deepEqual(redeemed, {
    campaign: { id: campaign.id, name: "The Amber Company" },
    membership: { role: "player", joinedAt: redeemedAt.toISOString() },
    character: {
      id: characterIds[outsider.userId],
      name: "Outsider Hero",
      classLabel: "Adventurer",
      level: 1,
    },
  });
  const membership = sqlite.prepare(`
    SELECT cm.role, cm.joined_at AS joinedAt
    FROM campaign_members cm
    JOIN campaigns c ON c.id = cm.campaign_id
    WHERE c.public_id = ? AND cm.user_id = ?
  `).get(campaign.id, outsider.userId);
  assert.deepEqual({ ...membership }, {
    role: "player",
    joinedAt: redeemedAt.toISOString(),
  });
  const stored = storedInvite(
    sqlite,
    await hashCampaignInviteToken(invite.token),
  );
  assert.equal(stored.acceptedAt, redeemedAt.toISOString());
  assert.equal(stored.acceptedByUserId, outsider.userId);
  const linked = sqlite.prepare(`
    SELECT ch.public_id AS publicId
    FROM campaign_characters cc
    JOIN characters ch ON ch.id = cc.character_id
    JOIN campaigns c ON c.id = cc.campaign_id
    WHERE c.public_id = ? AND ch.owner_user_id = ?
  `).get(campaign.id, outsider.userId);
  assert.equal(linked.publicId, characterIds[outsider.userId]);
});

test("invite preview is non-consuming and returns only the caller's characters", async () => {
  const { sqlite, db, campaign } = await campaignFixture();
  const invite = await createCampaignInvite(db, owner, campaign.id, now);
  const preview = await previewCampaignInvite(db, outsider, invite.token, now);

  assert.equal(preview.eligibility, "eligible");
  assert.deepEqual(preview.campaign, {
    id: campaign.id,
    name: "The Amber Company",
  });
  assert.deepEqual(preview.characters.map(character => character.id), [
    characterIds[outsider.userId],
  ]);
  const stored = storedInvite(sqlite, await hashCampaignInviteToken(invite.token));
  assert.equal(stored.acceptedAt, null);
  assert.equal(
    Number(sqlite.prepare("SELECT COUNT(*) AS count FROM campaign_members WHERE user_id = ?").get(outsider.userId).count),
    0,
  );
});

test("campaign IDs, missing character selection, and another user's character are rejected without consuming the invite", async () => {
  const { sqlite, db, campaign } = await campaignFixture();
  const invite = await createCampaignInvite(db, owner, campaign.id, now);

  await expectServiceError(previewCampaignInvite(db, outsider, campaign.id, now), 400);
  await expectServiceError(
    redeemCampaignInvite(db, outsider, invite.token, undefined, now),
    422,
  );
  await expectServiceError(
    redeemCampaignInvite(db, outsider, invite.token, characterIds[owner.userId], now),
    403,
  );

  const stored = storedInvite(sqlite, await hashCampaignInviteToken(invite.token));
  assert.equal(stored.acceptedAt, null);
  assert.equal(
    Number(sqlite.prepare("SELECT COUNT(*) AS count FROM campaign_members WHERE user_id = ?").get(outsider.userId).count),
    0,
  );
  assert.equal(
    Number(sqlite.prepare("SELECT COUNT(*) AS count FROM campaign_characters").get().count),
    0,
  );
});

test("a consumed invitation cannot be redeemed a second time", async () => {
  const { db, campaign } = await campaignFixture();
  const invite = await createCampaignInvite(db, owner, campaign.id, now);
  await redeemCampaignInvite(db, outsider, invite.token, characterIds[outsider.userId], now);
  await expectServiceError(
    redeemCampaignInvite(db, secondOutsider, invite.token, characterIds[secondOutsider.userId], now),
    409,
  );
});

test("concurrent redemption permits exactly one membership", async () => {
  const { sqlite, db, campaign } = await campaignFixture();
  const invite = await createCampaignInvite(db, owner, campaign.id, now);
  const attempts = await Promise.allSettled([
    redeemCampaignInvite(db, outsider, invite.token, characterIds[outsider.userId], now),
    redeemCampaignInvite(db, secondOutsider, invite.token, characterIds[secondOutsider.userId], now),
  ]);

  assert.equal(attempts.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(attempts.filter(result => result.status === "rejected").length, 1);
  const memberships = sqlite.prepare(`
    SELECT COUNT(*) AS count
    FROM campaign_members cm
    JOIN campaigns c ON c.id = cm.campaign_id
    WHERE c.public_id = ? AND cm.user_id IN (?, ?)
  `).get(campaign.id, outsider.userId, secondOutsider.userId);
  assert.equal(Number(memberships.count), 1);
  const links = sqlite.prepare(`
    SELECT COUNT(*) AS count
    FROM campaign_characters cc
    JOIN characters ch ON ch.id = cc.character_id
    WHERE ch.owner_user_id IN (?, ?)
  `).get(outsider.userId, secondOutsider.userId);
  assert.equal(Number(links.count), 1);
});

test("expired, revoked, unknown, and malformed invitations are rejected", async () => {
  const { db, campaign } = await campaignFixture();
  const expired = await createCampaignInvite(
    db,
    owner,
    campaign.id,
    new Date(now.getTime() - CAMPAIGN_INVITE_DEFAULT_TTL_MS - 1),
  );
  await expectServiceError(redeemCampaignInvite(db, outsider, expired.token, characterIds[outsider.userId], now), 404);

  const revoked = await createCampaignInvite(db, owner, campaign.id, now);
  await revokeCampaignInvite(db, owner, campaign.id, revoked.token, now);
  await expectServiceError(redeemCampaignInvite(db, outsider, revoked.token, characterIds[outsider.userId], now), 404);

  await expectServiceError(
    redeemCampaignInvite(db, outsider, generateCampaignInviteToken(), characterIds[outsider.userId], now),
    404,
  );
  await expectServiceError(redeemCampaignInvite(db, outsider, "not-an-invite", characterIds[outsider.userId], now), 400);
});

test("existing members preview direct invites without duplication or consumption", async () => {
  const { sqlite, db, campaign } = await campaignFixture();
  await addMember(sqlite, campaign.id, player);
  const invite = await createCampaignInvite(db, owner, campaign.id, now);
  const preview = await previewCampaignInvite(db, player, invite.token, now);

  assert.equal(preview.eligibility, "member");
  assert.deepEqual(preview.campaign, { id: campaign.id, name: "The Amber Company" });
  assert.deepEqual(preview.characters, []);
  await expectServiceError(redeemCampaignInvite(db, player, invite.token, characterIds[player.userId], now), 409);
  const stored = storedInvite(sqlite, await hashCampaignInviteToken(invite.token));
  assert.equal(stored.acceptedAt, null);
  assert.equal(stored.acceptedByUserId, null);
});

test("campaign owners preview their own invites without becoming players or consuming them", async () => {
  const { sqlite, db, campaign } = await campaignFixture();
  const invite = await createCampaignInvite(db, owner, campaign.id, now);
  db.preparedSql.length = 0;
  const preview = await previewCampaignInvite(db, owner, invite.token, now);

  assert.equal(preview.eligibility, "owner");
  assert.deepEqual(preview.campaign, { id: campaign.id, name: "The Amber Company" });
  assert.deepEqual(preview.characters, []);
  assert.equal(
    db.preparedSql.some(sql => /FROM campaign_members\s+WHERE campaign_id = \? AND user_id = \?/u.test(sql)),
    false,
    "owner previews derive eligibility from the already-loaded invitation row",
  );
  await assert.rejects(
    redeemCampaignInvite(db, owner, invite.token, characterIds[owner.userId], now),
    error => error instanceof CampaignServiceError
      && error.status === 409
      && error.message === "You already own this campaign.",
  );
  const ownerMembership = sqlite.prepare(`
    SELECT role FROM campaign_members
    WHERE campaign_id = (SELECT id FROM campaigns WHERE public_id = ?)
      AND user_id = ?
  `).get(campaign.id, owner.userId);
  assert.equal(ownerMembership.role, "gm");
  const stored = storedInvite(sqlite, await hashCampaignInviteToken(invite.token));
  assert.equal(stored.acceptedAt, null);
  assert.equal(stored.acceptedByUserId, null);
});

test("redemption requires authentication", async () => {
  const { db, campaign } = await campaignFixture();
  const invite = await createCampaignInvite(db, owner, campaign.id, now);
  await expectServiceError(redeemCampaignInvite(db, null, invite.token, characterIds[outsider.userId], now), 401);
});

test("redemption grants only campaign player membership and preserves site-admin role", async () => {
  const { sqlite, db, campaign } = await campaignFixture();
  const invite = await createCampaignInvite(db, owner, campaign.id, now);
  const redeemed = await redeemCampaignInvite(db, admin, invite.token, characterIds[admin.userId], now);
  assert.equal(redeemed.membership.role, "player");
  assert.equal(
    sqlite.prepare("SELECT role FROM user WHERE id = ?").get(admin.userId).role,
    "admin",
  );
  assert.equal(
    sqlite.prepare("SELECT owner_user_id AS owner FROM campaigns WHERE public_id = ?")
      .get(campaign.id).owner,
    owner.userId,
  );
});

test("redemption links only the selected character and preserves character data", async () => {
  const { sqlite, db, campaign } = await campaignFixture();
  const otherCharacterId = "chr_GGGGGGGGGGGGGGGGGGGGGG";
  sqlite.prepare(`
    INSERT INTO characters
      (id, owner_user_id, public_id, visibility, name, class_label, level, updated_at)
    VALUES ('character-outsider-other', ?, ?, 'unlisted', 'Other Hero', 'Mage', 3, ?)
  `).run(outsider.userId, otherCharacterId, now.toISOString());
  const before = sqlite.prepare(`
    SELECT owner_user_id AS ownerUserId, visibility FROM characters
    WHERE public_id = ?
  `).get(characterIds[outsider.userId]);

  const invite = await createCampaignInvite(db, owner, campaign.id, now);
  await redeemCampaignInvite(
    db,
    outsider,
    invite.token,
    characterIds[outsider.userId],
    now,
  );

  const after = sqlite.prepare(`
    SELECT owner_user_id AS ownerUserId, visibility FROM characters
    WHERE public_id = ?
  `).get(characterIds[outsider.userId]);
  assert.deepEqual({ ...after }, { ...before });
  const links = sqlite.prepare(`
    SELECT ch.public_id AS publicId
    FROM campaign_characters cc
    JOIN characters ch ON ch.id = cc.character_id
    JOIN campaigns c ON c.id = cc.campaign_id
    WHERE c.public_id = ? AND ch.owner_user_id = ?
  `).all(campaign.id, outsider.userId);
  assert.deepEqual(links.map(link => link.publicId), [characterIds[outsider.userId]]);
  assert.equal(links.some(link => link.publicId === otherCharacterId), false);
});

test("owner and GM can revoke while preserving the historical invite row", async () => {
  const { sqlite, db, campaign } = await campaignFixture();
  await addMember(sqlite, campaign.id, gm, "gm");
  for (const actor of [owner, gm]) {
    const invite = await createCampaignInvite(db, actor, campaign.id, now);
    const tokenHash = await hashCampaignInviteToken(invite.token);
    await revokeCampaignInvite(db, actor, campaign.id, invite.token, now);
    const stored = storedInvite(sqlite, tokenHash);
    assert.equal(stored.revokedAt, now.toISOString());
    assert.equal(stored.acceptedAt, null);
  }
  assert.equal(
    Number(sqlite.prepare("SELECT COUNT(*) AS count FROM campaign_invites").get().count),
    2,
  );
});

test("players, site admins, outsiders, and signed-out callers cannot revoke", async () => {
  const { sqlite, db, campaign } = await campaignFixture();
  await addMember(sqlite, campaign.id, player);
  const invite = await createCampaignInvite(db, owner, campaign.id, now);
  await expectServiceError(revokeCampaignInvite(db, player, campaign.id, invite.token, now), 403);
  await expectServiceError(revokeCampaignInvite(db, admin, campaign.id, invite.token, now), 403);
  await expectServiceError(revokeCampaignInvite(db, outsider, campaign.id, invite.token, now), 404);
  await expectServiceError(revokeCampaignInvite(db, null, campaign.id, invite.token, now), 401);
});

test("invite payloads expose no hashes, internal user IDs, or email addresses", async () => {
  const { db, campaign } = await campaignFixture();
  const invite = await createCampaignInvite(db, owner, campaign.id, now);
  const creationPayload = JSON.stringify(invite);
  const redeemedPayload = JSON.stringify(
    await redeemCampaignInvite(db, outsider, invite.token, characterIds[outsider.userId], now),
  );
  for (const payload of [creationPayload, redeemedPayload]) {
    assert.equal(payload.includes("tokenHash"), false);
    assert.equal(payload.includes("token_hash"), false);
    assert.equal(payload.includes("@example.invalid"), false);
    assert.equal(payload.includes(owner.userId), false);
    assert.equal(payload.includes(outsider.userId), false);
  }
  assert.equal(creationPayload.includes(invite.token), true);
  assert.equal(redeemedPayload.includes(invite.token), false);
});


test("archiving pauses valid invitations without consuming them and restore resumes them", async () => {
  const { db, campaign } = await campaignFixture();
  const invite = await createCampaignInvite(db, owner, campaign.id, now);
  await setCampaignArchived(db, owner, campaign.id, true, now.toISOString());
  await expectServiceError(previewCampaignInvite(db, outsider, invite.token, now), 409);
  await expectServiceError(redeemCampaignInvite(db, outsider, invite.token, characterIds[outsider.userId], now), 409);
  await setCampaignArchived(db, owner, campaign.id, false, now.toISOString());
  const preview = await previewCampaignInvite(db, outsider, invite.token, now);
  assert.equal(preview.eligibility, "eligible");
  assert.equal(preview.characters.some(character => character.id === characterIds[outsider.userId]), true);
});
