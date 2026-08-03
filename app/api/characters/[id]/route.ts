import { characterSummary, getD1, parseCharacter } from "../db";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const db = await getD1();
    const row = await db.prepare(
      `SELECT id, data, version, created_at AS createdAt, updated_at AS updatedAt
       FROM characters WHERE id = ?`
    ).bind(id).first<Record<string, unknown>>();
    if (!row) return Response.json({ error: "Character not found." }, { status: 404 });
    return Response.json({ ...row, character: JSON.parse(String(row.data)), data: undefined });
  } catch {
    return Response.json({ error: "The character could not be opened." }, { status: 500 });
  }
}

export async function PUT(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const body = await request.json() as { character?: unknown; version?: number };
    const character = parseCharacter(body.character);
    const expectedVersion = Number(body.version);
    if (!character || !Number.isInteger(expectedVersion)) {
      return Response.json({ error: "Invalid save request." }, { status: 400 });
    }
    const db = await getD1();
    const current = await db.prepare("SELECT version FROM characters WHERE id = ?").bind(id).first<{ version: number }>();
    if (!current) return Response.json({ error: "Character not found." }, { status: 404 });
    if (current.version !== expectedVersion) {
      return Response.json({ error: "This character was updated elsewhere.", currentVersion: current.version }, { status: 409 });
    }
    const nextVersion = current.version + 1;
    const now = new Date().toISOString();
    const data = JSON.stringify(character);
    const summary = characterSummary(character);
    await db.prepare(
      `UPDATE characters SET name = ?, player = ?, class_label = ?, level = ?,
        data = ?, version = ?, updated_at = ? WHERE id = ? AND version = ?`
    ).bind(summary.name, summary.player, summary.classLabel, summary.level, data, nextVersion, now, id, expectedVersion).run();
    return Response.json({ id, version: nextVersion, updatedAt: now });
  } catch {
    return Response.json({ error: "The character could not be saved." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const db = await getD1();
    await db.prepare("DELETE FROM characters WHERE id = ?").bind(id).run();
    return Response.json({ deleted: true });
  } catch {
    return Response.json({ error: "The character could not be deleted." }, { status: 500 });
  }
}
