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
