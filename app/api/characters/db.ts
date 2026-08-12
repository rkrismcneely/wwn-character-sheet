import {
  canReadCharacter,
  isCharacterOwner,
  type CharacterActor,
  type CharacterVisibility,
} from "@/lib/characters/authorization";
import { generatePublicCharacterId } from "@/lib/characters/identifiers";
import {
  characterForStorage,
  parseCharacter,
} from "@/lib/characters/sanitize";

export interface CharacterRow {
  id: string;
  ownerUserId: string | null;
  publicId: string | null;
  visibility: CharacterVisibility;
  portraitKey: string | null;
  data: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CharacterSummaryRow {
  ownerUserId: string | null;
  publicId: string;
  name: string;
  player: string;
  classLabel: string;
  level: number;
  visibility: CharacterVisibility;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export async function getD1(): Promise<D1Database> {
  const { env } = await import("cloudflare:workers");
  if (!env.DB) throw new Error("Character database is unavailable.");
  return env.DB;
}

export function characterSummary(data: Record<string, unknown>) {
  const mode = data.classMode === "adventurer";
  const classLabel = mode
    ? `${String(data.classOne || "Adventurer")} / ${String(data.classTwo || "Adventurer")}`
    : String(data.classOne || data.className || "Adventurer");
  return {
    name: String(data.name || "Unnamed Character").slice(0, 120),
    player: String(data.player || "").slice(0, 120),
    classLabel: classLabel.slice(0, 160),
    level: Math.min(10, Math.max(1, Number(data.level) || 1)),
  };
}

export { parseCharacter };

export async function findCharacterByPublicId(
  db: D1Database,
  publicId: string,
): Promise<CharacterRow | null> {
  return db
    .prepare(
      `SELECT id,
              owner_user_id AS ownerUserId,
              public_id AS publicId,
              visibility,
              portrait_key AS portraitKey,
              data,
              version,
              created_at AS createdAt,
              updated_at AS updatedAt
       FROM characters
       WHERE public_id = ?`,
    )
    .bind(publicId)
    .first<CharacterRow>();
}

export function characterApiPayload(
  row: CharacterRow,
  actor: CharacterActor | null,
) {
  const character = parseCharacter(JSON.parse(row.data) as unknown);
  if (!character) throw new Error("Stored character data is invalid.");
  return {
    id: row.publicId,
    character,
    version: row.version,
    visibility: row.visibility,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    permissions: {
      canEdit: isCharacterOwner(actor, row),
      adminReadOnly: actor?.role === "admin" && !isCharacterOwner(actor, row),
    },
  };
}

export function characterOwnerState(
  actor: CharacterActor | null,
  ownerUserId: string | null,
): "mine" | "other" | "unowned" {
  if (!ownerUserId) return "unowned";
  return actor?.userId === ownerUserId ? "mine" : "other";
}

export async function listCharacters(
  db: D1Database,
  options: {
    actor: CharacterActor | null;
    scope: "mine" | "public" | "all";
    query?: string;
  },
): Promise<CharacterSummaryRow[]> {
  if (options.scope === "all" && options.actor?.role !== "admin") return [];
  if (options.scope === "mine") {
    if (!options.actor) return [];
    const result = await db
      .prepare(
        `SELECT owner_user_id AS ownerUserId, public_id AS publicId, name, player,
                class_label AS classLabel, level, visibility, version,
                created_at AS createdAt, updated_at AS updatedAt
         FROM characters
         WHERE owner_user_id = ? AND public_id IS NOT NULL
         ORDER BY updated_at DESC`,
      )
      .bind(options.actor.userId)
      .all<CharacterSummaryRow>();
    return result.results;
  }

  const search = options.query?.trim().slice(0, 120);
  const visibilityClause = options.scope === "all"
    ? "public_id IS NOT NULL"
    : "visibility = 'public' AND public_id IS NOT NULL";
  if (search) {
    const pattern = `%${search.toLowerCase()}%`;
    const result = await db
      .prepare(
        `SELECT owner_user_id AS ownerUserId, public_id AS publicId, name, player,
                class_label AS classLabel, level, visibility, version,
                created_at AS createdAt, updated_at AS updatedAt
         FROM characters
         WHERE ${visibilityClause}
           AND (lower(name) LIKE ? OR lower(class_label) LIKE ?)
         ORDER BY updated_at DESC`,
      )
      .bind(pattern, pattern)
      .all<CharacterSummaryRow>();
    return result.results;
  }

  const result = await db
    .prepare(
      `SELECT owner_user_id AS ownerUserId, public_id AS publicId, name, player,
              class_label AS classLabel, level, visibility, version,
              created_at AS createdAt, updated_at AS updatedAt
       FROM characters
       WHERE ${visibilityClause}
       ORDER BY updated_at DESC`,
    )
    .all<CharacterSummaryRow>();
  return result.results;
}

export async function createOwnedCharacter(
  db: D1Database,
  ownerUserId: string,
  rawCharacter: unknown,
): Promise<{ publicId: string; version: number; updatedAt: string }> {
  const character = characterForStorage(rawCharacter);
  if (!character) throw new TypeError("Invalid character data.");
  const data = JSON.stringify(character);
  const summary = characterSummary(character);
  const now = new Date().toISOString();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const publicId = generatePublicCharacterId();
    try {
      await db
        .prepare(
          `INSERT INTO characters
            (id, owner_user_id, public_id, visibility, portrait_key,
             name, player, class_label, level, data, version, created_at, updated_at)
           VALUES (?, ?, ?, 'private', NULL, ?, ?, ?, ?, ?, 1, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          ownerUserId,
          publicId,
          summary.name,
          summary.player,
          summary.classLabel,
          summary.level,
          data,
          now,
          now,
        )
        .run();
      return { publicId, version: 1, updatedAt: now };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("public_id") || attempt === 4) throw error;
    }
  }

  throw new Error("Could not allocate a public character identifier.");
}

export function canReadRow(
  actor: CharacterActor | null,
  row: CharacterRow,
): boolean {
  return canReadCharacter(actor, row);
}
