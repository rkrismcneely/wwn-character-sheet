import { getSessionActor } from "@/lib/auth-session";
import { generatePublicCharacterId } from "@/lib/characters/identifiers";
import {
  isPortraitContentType,
  portraitObjectKey,
  type PortraitContentType,
} from "@/lib/characters/portraits";
import { characterForStorage } from "@/lib/characters/sanitize";
import {
  characterSummary,
  findCharacterByPublicId,
  getD1,
} from "./db";

type LifecycleStatus = 401 | 403 | 404 | 409;

export class CharacterLifecycleError extends Error {
  constructor(message: string, public readonly status: LifecycleStatus) {
    super(message);
  }
}

function contentTypeForPortrait(key: string, value?: string): PortraitContentType {
  if (value && isPortraitContentType(value)) return value;
  if (/\.jpe?g$/iu.test(key)) return "image/jpeg";
  if (/\.webp$/iu.test(key)) return "image/webp";
  if (/\.gif$/iu.test(key)) return "image/gif";
  return "image/png";
}

async function requireOwnedCharacter(request: Request, publicId: string) {
  const actor = await getSessionActor(request);
  if (!actor) throw new CharacterLifecycleError("Sign in is required.", 401);
  const db = await getD1();
  const row = await findCharacterByPublicId(db, publicId);
  if (!row) throw new CharacterLifecycleError("Character not found.", 404);
  if (row.ownerUserId !== actor.userId) {
    throw new CharacterLifecycleError("Not permitted.", 403);
  }
  return { actor, db, row };
}

export async function setCharacterArchived(
  request: Request,
  publicId: string,
  archived: boolean,
  now = new Date().toISOString(),
): Promise<{ archivedAt: string | null }> {
  const { actor, db, row } = await requireOwnedCharacter(request, publicId);
  if (archived === Boolean(row.archivedAt)) {
    return { archivedAt: row.archivedAt };
  }
  const archivedAt = archived ? now : null;
  const result = await db.prepare(
    `UPDATE characters
     SET archived_at = ?, updated_at = ?
     WHERE id = ? AND owner_user_id = ?
       AND ${archived ? "archived_at IS NULL" : "archived_at IS NOT NULL"}`,
  ).bind(archivedAt, now, row.id, actor.userId).run();
  if (result.meta.changes !== 1) {
    throw new CharacterLifecycleError("The character lifecycle changed elsewhere.", 409);
  }
  return { archivedAt };
}

export async function duplicateCharacter(
  request: Request,
  publicId: string,
  now = new Date().toISOString(),
): Promise<{ id: string; name: string }> {
  const { actor, db, row } = await requireOwnedCharacter(request, publicId);
  const source = characterForStorage(JSON.parse(row.data) as unknown);
  if (!source) throw new Error("Stored character data is invalid.");
  const copyName = `${String(source.name || "Unnamed Character").slice(0, 115)} Copy`;
  const character = characterForStorage({ ...source, name: copyName, portrait: "" });
  if (!character) throw new Error("The character could not be duplicated.");
  const summary = characterSummary(character);
  const data = JSON.stringify(character);
  const { env } = await import("cloudflare:workers");

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const duplicateId = crypto.randomUUID();
    const duplicatePublicId = generatePublicCharacterId();
    let duplicatePortraitKey: string | null = null;
    try {
      if (row.portraitKey) {
        if (!env.BUCKET) throw new Error("Portrait storage is unavailable.");
        const original = await env.BUCKET.get(row.portraitKey);
        if (!original) throw new Error("The original portrait could not be copied.");
        const contentType = contentTypeForPortrait(
          row.portraitKey,
          original.httpMetadata?.contentType,
        );
        duplicatePortraitKey = portraitObjectKey(duplicatePublicId, contentType);
        await env.BUCKET.put(duplicatePortraitKey, await original.arrayBuffer(), {
          httpMetadata: { contentType },
        });
      }
      await db.prepare(
        `INSERT INTO characters
          (id, owner_user_id, public_id, visibility, portrait_key, archived_at,
           name, player, class_label, level, data, version, created_at, updated_at)
         VALUES (?, ?, ?, 'private', ?, NULL, ?, ?, ?, ?, ?, 1, ?, ?)`,
      ).bind(
        duplicateId,
        actor.userId,
        duplicatePublicId,
        duplicatePortraitKey,
        summary.name,
        summary.player,
        summary.classLabel,
        summary.level,
        data,
        now,
        now,
      ).run();
      return { id: duplicatePublicId, name: summary.name };
    } catch (error) {
      if (duplicatePortraitKey && env.BUCKET) {
        await env.BUCKET.delete(duplicatePortraitKey).catch(() => undefined);
      }
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("public_id") && attempt < 4) continue;
      throw error;
    }
  }
  throw new Error("Could not allocate a public character identifier.");
}

export function characterLifecycleErrorResponse(error: unknown, fallback: string): Response {
  if (error instanceof CharacterLifecycleError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  return Response.json({ error: fallback }, { status: 500 });
}
