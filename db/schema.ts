import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { user } from "./auth-schema.generated";

export const characters = sqliteTable(
  "characters",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    publicId: text("public_id"),
    visibility: text("visibility").notNull().default("private"),
    portraitKey: text("portrait_key"),
    archivedAt: text("archived_at"),
    name: text("name").notNull(),
    player: text("player").notNull().default(""),
    classLabel: text("class_label").notNull().default(""),
    level: integer("level").notNull().default(1),
    data: text("data").notNull(),
    version: integer("version").notNull().default(1),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("characters_public_id_unique").on(table.publicId),
    index("characters_owner_updated_idx").on(
      table.ownerUserId,
      table.updatedAt,
    ),
    index("characters_visibility_updated_idx").on(
      table.visibility,
      table.updatedAt,
    ),
    index("characters_owner_archive_updated_idx").on(
      table.ownerUserId,
      table.archivedAt,
      table.updatedAt,
    ),
    check(
      "characters_visibility_check",
      sql`${table.visibility} in ('private', 'unlisted', 'public')`,
    ),
  ],
);

export const characterRevisions = sqliteTable("character_revisions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  characterId: text("character_id").notNull(),
  version: integer("version").notNull(),
  data: text("data").notNull(),
  savedAt: text("saved_at").notNull(),
});

export const legacyCharacterClaims = sqliteTable(
  "legacy_character_claims",
  {
    id: text("id").primaryKey(),
    tokenHash: text("token_hash").notNull(),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at").notNull(),
    claimedAt: text("claimed_at"),
    claimedByUserId: text("claimed_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    revokedAt: text("revoked_at"),
  },
  (table) => [
    uniqueIndex("legacy_character_claims_token_hash_unique").on(
      table.tokenHash,
    ),
    index("legacy_character_claims_status_idx").on(
      table.claimedAt,
      table.revokedAt,
      table.expiresAt,
    ),
  ],
);

export const legacyCharacterClaimItems = sqliteTable(
  "legacy_character_claim_items",
  {
    claimId: text("claim_id")
      .notNull()
      .references(() => legacyCharacterClaims.id, { onDelete: "cascade" }),
    characterId: text("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.claimId, table.characterId] }),
    index("legacy_character_claim_items_character_idx").on(table.characterId),
  ],
);

export const campaigns = sqliteTable(
  "campaigns",
  {
    id: text("id").primaryKey(),
    publicId: text("public_id").notNull(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    description: text("description"),
    archivedAt: text("archived_at"),
    version: integer("version").notNull().default(1),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("campaigns_public_id_unique").on(table.publicId),
    index("campaigns_owner_updated_idx").on(
      table.ownerUserId,
      table.updatedAt,
    ),
    index("campaigns_owner_archive_updated_idx").on(
      table.ownerUserId,
      table.archivedAt,
      table.updatedAt,
    ),
    check(
      "campaigns_public_id_check",
      sql`length(${table.publicId}) = 26 and substr(${table.publicId}, 1, 4) = 'cmp_'`,
    ),
  ],
);

export const campaignMembers = sqliteTable(
  "campaign_members",
  {
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["gm", "player"] }).notNull(),
    joinedAt: text("joined_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.campaignId, table.userId] }),
    index("campaign_members_user_joined_idx").on(
      table.userId,
      table.joinedAt,
    ),
    check(
      "campaign_members_role_check",
      sql`${table.role} in ('gm', 'player')`,
    ),
  ],
);

export const campaignCharacters = sqliteTable(
  "campaign_characters",
  {
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    characterId: text("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    addedAt: text("added_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.campaignId, table.characterId] }),
    index("campaign_characters_character_idx").on(table.characterId),
  ],
);

export const campaignInvites = sqliteTable(
  "campaign_invites",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    role: text("role", { enum: ["player"] }).notNull().default("player"),
    createdByUserId: text("created_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at").notNull(),
    acceptedAt: text("accepted_at"),
    acceptedByUserId: text("accepted_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    revokedAt: text("revoked_at"),
  },
  (table) => [
    uniqueIndex("campaign_invites_token_hash_unique").on(table.tokenHash),
    index("campaign_invites_campaign_status_idx").on(
      table.campaignId,
      table.acceptedAt,
      table.revokedAt,
      table.expiresAt,
    ),
    check("campaign_invites_role_check", sql`${table.role} = 'player'`),
    check(
      "campaign_invites_token_hash_check",
      sql`length(${table.tokenHash}) = 64 and ${table.tokenHash} not glob '*[^0-9a-f]*'`,
    ),
  ],
);


export const campaignResources = sqliteTable(
  "campaign_resources",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    type: text("type", { enum: ["text", "link"] }).notNull(),
    content: text("content").notNull(),
    position: integer("position").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("campaign_resources_campaign_position_idx").on(
      table.campaignId,
      table.position,
      table.createdAt,
    ),
    check(
      "campaign_resources_type_check",
      sql`${table.type} in ('text', 'link')`,
    ),
  ],
);

export const campaignSessions = sqliteTable(
  "campaign_sessions",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
    startedByUserId: text("started_by_user_id").notNull().references(() => user.id, { onDelete: "restrict" }),
    startedAt: text("started_at").notNull(),
    endedAt: text("ended_at"),
    endedByUserId: text("ended_by_user_id").references(() => user.id, { onDelete: "set null" }),
  },
  (table) => [
    index("campaign_sessions_campaign_started_idx").on(table.campaignId, table.startedAt),
  ],
);

export const campaignSessionParticipants = sqliteTable(
  "campaign_session_participants",
  {
    sessionId: text("session_id").notNull().references(() => campaignSessions.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    joinedAt: text("joined_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.sessionId, table.userId] }),
    index("campaign_session_participants_user_idx").on(table.userId),
  ],
);
