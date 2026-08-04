import { getSessionActor } from "@/lib/auth-session";
import {
  authorizeCharacterWrite,
  isCharacterVisibility,
} from "@/lib/characters/authorization";
import { isPlausiblePublicCharacterId } from "@/lib/characters/identifiers";
import { readBoundedJson, RequestBodyError } from "@/lib/http-json";
import {
  canReadRow,
  characterApiPayload,
  characterSummary,
  findCharacterByPublicId,
  getD1,
  parseCharacter,
} from "../db";

type Context = { params: Promise<{ id: string }> };

function characterNotFound(): Response {
  return Response.json({ error: "Character not found." }, { status: 404 });
}

export async function GET(request: Request, context: Context): Promise<Response> {
  try {
    const { id: publicId } = await context.params;
    if (!isPlausiblePublicCharacterId(publicId)) return characterNotFound();
    const actor = await getSessionActor(request);
    const row = await findCharacterByPublicId(await getD1(), publicId);
    if (!row || !canReadRow(actor, row)) return characterNotFound();
    return Response.json(characterApiPayload(row, actor));
  } catch {
    return Response.json(
      { error: "The character could not be opened." },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request, context: Context): Promise<Response> {
  const actor = await getSessionActor(request);
  if (!actor) {
    return Response.json({ error: "Sign in is required." }, { status: 401 });
  }

  try {
    const { id: publicId } = await context.params;
    if (!isPlausiblePublicCharacterId(publicId)) return characterNotFound();
    const body = (await readBoundedJson(request)) as {
      character?: unknown;
      version?: unknown;
    };
    const character = parseCharacter(body?.character);
    const expectedVersion = Number(body?.version);
    if (!character || !Number.isInteger(expectedVersion) || expectedVersion < 1) {
      return Response.json({ error: "Invalid save request." }, { status: 400 });
    }

    const db = await getD1();
    const row = await findCharacterByPublicId(db, publicId);
    if (!row) return characterNotFound();
    const authorization = authorizeCharacterWrite(actor, row);
    if (!authorization.allowed) {
      return Response.json(
        { error: authorization.status === 404 ? "Character not found." : "Not permitted." },
        { status: authorization.status },
      );
    }
    const currentCharacter = parseCharacter(JSON.parse(row.data) as unknown);
    if (!currentCharacter) {
      return Response.json({ error: "Stored character data is invalid." }, { status: 500 });
    }
    // A regular character save cannot create, replace, or detach an R2
    // portrait. The dedicated portrait endpoint owns that lifecycle.
    character.portrait = typeof currentCharacter.portrait === "string"
      ? currentCharacter.portrait
      : "";
    if (row.version !== expectedVersion) {
      return Response.json(
        {
          error: "This character was updated elsewhere.",
          currentVersion: row.version,
        },
        { status: 409 },
      );
    }

    const nextVersion = row.version + 1;
    const now = new Date().toISOString();
    const summary = characterSummary(character);
    const result = await db
      .prepare(
        `UPDATE characters
         SET name = ?, player = ?, class_label = ?, level = ?,
             data = ?, version = ?, updated_at = ?
         WHERE id = ? AND owner_user_id = ? AND version = ?`,
      )
      .bind(
        summary.name,
        summary.player,
        summary.classLabel,
        summary.level,
        JSON.stringify(character),
        nextVersion,
        now,
        row.id,
        actor.userId,
        expectedVersion,
      )
      .run();
    if (result.meta.changes !== 1) {
      return Response.json(
        { error: "This character was updated elsewhere." },
        { status: 409 },
      );
    }
    return Response.json({ id: publicId, version: nextVersion, updatedAt: now });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json(
      { error: "The character could not be saved." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request, context: Context): Promise<Response> {
  const actor = await getSessionActor(request);
  if (!actor) {
    return Response.json({ error: "Sign in is required." }, { status: 401 });
  }

  try {
    const { id: publicId } = await context.params;
    if (!isPlausiblePublicCharacterId(publicId)) return characterNotFound();
    const body = (await readBoundedJson(request, 16 * 1024)) as {
      visibility?: unknown;
    };
    if (!isCharacterVisibility(body?.visibility)) {
      return Response.json({ error: "Invalid visibility." }, { status: 422 });
    }

    const db = await getD1();
    const row = await findCharacterByPublicId(db, publicId);
    if (!row) return characterNotFound();
    const authorization = authorizeCharacterWrite(actor, row);
    if (!authorization.allowed) {
      return Response.json(
        { error: authorization.status === 404 ? "Character not found." : "Not permitted." },
        { status: authorization.status },
      );
    }

    const now = new Date().toISOString();
    const result = await db
      .prepare(
        `UPDATE characters SET visibility = ?, updated_at = ?
         WHERE id = ? AND owner_user_id = ?`,
      )
      .bind(body.visibility, now, row.id, actor.userId)
      .run();
    if (result.meta.changes !== 1) return characterNotFound();
    return Response.json({ id: publicId, visibility: body.visibility, updatedAt: now });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json(
      { error: "Visibility could not be changed." },
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
    if (!isPlausiblePublicCharacterId(publicId)) return characterNotFound();
    const db = await getD1();
    const row = await findCharacterByPublicId(db, publicId);
    if (!row) return characterNotFound();
    const authorization = authorizeCharacterWrite(actor, row);
    if (!authorization.allowed) {
      return Response.json(
        { error: authorization.status === 404 ? "Character not found." : "Not permitted." },
        { status: authorization.status },
      );
    }

    const result = await db
      .prepare("DELETE FROM characters WHERE id = ? AND owner_user_id = ?")
      .bind(row.id, actor.userId)
      .run();
    if (result.meta.changes !== 1) return characterNotFound();

    if (row.portraitKey) {
      try {
        const { env } = await import("cloudflare:workers");
        await env.BUCKET.delete(row.portraitKey);
      } catch {
        // The authorized character deletion remains authoritative; the now-
        // unreachable opaque object can be cleaned up operationally if needed.
      }
    }
    return Response.json({ deleted: true });
  } catch {
    return Response.json(
      { error: "The character could not be deleted." },
      { status: 500 },
    );
  }
}
