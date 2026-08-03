import { characterSummary, getD1, parseCharacter } from "./db";

export async function GET() {
  try {
    const db = await getD1();
    const result = await db.prepare(
      `SELECT id, name, player, class_label AS classLabel, level, version,
              created_at AS createdAt, updated_at AS updatedAt
       FROM characters ORDER BY updated_at DESC`
    ).all();
    return Response.json({ characters: result.results });
  } catch {
    return Response.json({ error: "The shared library is temporarily unavailable." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { character?: unknown };
    const character = parseCharacter(body.character);
    if (!character) return Response.json({ error: "Invalid character data." }, { status: 400 });
    const db = await getD1();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const summary = characterSummary(character);
    const data = JSON.stringify(character);
    await db.prepare(
      `INSERT INTO characters
        (id, name, player, class_label, level, data, version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`
    ).bind(id, summary.name, summary.player, summary.classLabel, summary.level, data, now, now).run();
    return Response.json({ id, version: 1, updatedAt: now }, { status: 201 });
  } catch {
    return Response.json({ error: "The character could not be added." }, { status: 500 });
  }
}
