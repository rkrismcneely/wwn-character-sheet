import { getSessionActor } from "@/lib/auth-session";
import { authorizeCharacterWrite } from "@/lib/characters/authorization";
import { isPlausiblePublicCharacterId } from "@/lib/characters/identifiers";
import {
  isPortraitContentType,
  MAX_PORTRAIT_BYTES,
  portraitBytesMatchContentType,
  portraitObjectKey,
  portraitURL,
} from "@/lib/characters/portraits";
import { parseCharacter } from "@/lib/characters/sanitize";
import { retireR2ObjectWithRecovery } from "@/lib/r2-recovery";
import { findCharacterByPublicId, getD1 } from "../../db";

type Context = { params: Promise<{ id: string }> };

function notFound(): Response {
  return Response.json({ error: "Character not found." }, { status: 404 });
}

function expectedVersion(request: Request): number | null {
  const value = Number(request.headers.get("x-character-version"));
  return Number.isInteger(value) && value > 0 ? value : null;
}

export async function POST(request: Request, context: Context): Promise<Response> {
  const actor = await getSessionActor(request);
  if (!actor) {
    return Response.json({ error: "Sign in is required." }, { status: 401 });
  }

  try {
    const { id: publicId } = await context.params;
    if (!isPlausiblePublicCharacterId(publicId)) return notFound();
    const version = expectedVersion(request);
    if (!version) {
      return Response.json({ error: "A character version is required." }, { status: 400 });
    }
    const contentType =
      request.headers.get("content-type")?.split(";")[0].trim() ?? "";
    if (!isPortraitContentType(contentType)) {
      return Response.json(
        { error: "Use a JPG, PNG, WebP, or GIF image." },
        { status: 415 },
      );
    }
    const declaredLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_PORTRAIT_BYTES) {
      return Response.json(
        { error: "Portrait images must be smaller than 5 MB." },
        { status: 413 },
      );
    }

    const db = await getD1();
    const row = await findCharacterByPublicId(db, publicId);
    if (!row) return notFound();
    const authorization = authorizeCharacterWrite(actor, row);
    if (!authorization.allowed) {
      return Response.json(
        { error: authorization.status === 404 ? "Character not found." : "Not permitted." },
        { status: authorization.status },
      );
    }
    if (row.version !== version) {
      return Response.json(
        { error: "This character was updated elsewhere.", currentVersion: row.version },
        { status: 409 },
      );
    }

    const bytes = await request.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > MAX_PORTRAIT_BYTES) {
      return Response.json(
        { error: "Portrait images must be smaller than 5 MB." },
        { status: 413 },
      );
    }
    if (!portraitBytesMatchContentType(bytes, contentType)) {
      return Response.json(
        { error: "The file contents do not match the selected image type." },
        { status: 415 },
      );
    }

    const { env } = await import("cloudflare:workers");
    const key = portraitObjectKey(publicId, contentType);
    const url = portraitURL(key);
    await env.BUCKET.put(key, bytes, {
      httpMetadata: { contentType },
    });

    const character = parseCharacter(JSON.parse(row.data) as unknown);
    if (!character) throw new Error("Stored character data is invalid.");
    character.portrait = url;
    const nextVersion = row.version + 1;
    const now = new Date().toISOString();
    const result = await db
      .prepare(
        `UPDATE characters
         SET data = ?, portrait_key = ?, version = ?, updated_at = ?
         WHERE id = ? AND owner_user_id = ? AND version = ?`,
      )
      .bind(
        JSON.stringify(character),
        key,
        nextVersion,
        now,
        row.id,
        actor.userId,
        row.version,
      )
      .run();
    if (result.meta.changes !== 1) {
      await env.BUCKET.delete(key);
      return Response.json(
        { error: "This character was updated elsewhere." },
        { status: 409 },
      );
    }
    if (row.portraitKey && row.portraitKey !== key) {
      await retireR2ObjectWithRecovery(env.BUCKET, row.portraitKey);
    }
    return Response.json({ url, version: nextVersion, updatedAt: now }, { status: 201 });
  } catch {
    return Response.json(
      { error: "The portrait could not be uploaded." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: Request,
  context: Context,
): Promise<Response> {
  const actor = await getSessionActor(request);
  if (!actor) {
    return Response.json({ error: "Sign in is required." }, { status: 401 });
  }

  try {
    const { id: publicId } = await context.params;
    if (!isPlausiblePublicCharacterId(publicId)) return notFound();
    const version = expectedVersion(request);
    if (!version) {
      return Response.json({ error: "A character version is required." }, { status: 400 });
    }
    const db = await getD1();
    const row = await findCharacterByPublicId(db, publicId);
    if (!row) return notFound();
    const authorization = authorizeCharacterWrite(actor, row);
    if (!authorization.allowed) {
      return Response.json(
        { error: authorization.status === 404 ? "Character not found." : "Not permitted." },
        { status: authorization.status },
      );
    }
    if (row.version !== version) {
      return Response.json(
        { error: "This character was updated elsewhere.", currentVersion: row.version },
        { status: 409 },
      );
    }

    const character = parseCharacter(JSON.parse(row.data) as unknown);
    if (!character) throw new Error("Stored character data is invalid.");
    character.portrait = "";
    const nextVersion = row.version + 1;
    const now = new Date().toISOString();
    const result = await db
      .prepare(
        `UPDATE characters
         SET data = ?, portrait_key = NULL, version = ?, updated_at = ?
         WHERE id = ? AND owner_user_id = ? AND version = ?`,
      )
      .bind(
        JSON.stringify(character),
        nextVersion,
        now,
        row.id,
        actor.userId,
        row.version,
      )
      .run();
    if (result.meta.changes !== 1) {
      return Response.json(
        { error: "This character was updated elsewhere." },
        { status: 409 },
      );
    }
    if (row.portraitKey) {
      const { env } = await import("cloudflare:workers");
      await retireR2ObjectWithRecovery(env.BUCKET, row.portraitKey);
    }
    return Response.json({ removed: true, version: nextVersion, updatedAt: now });
  } catch {
    return Response.json(
      { error: "The portrait could not be removed." },
      { status: 500 },
    );
  }
}
