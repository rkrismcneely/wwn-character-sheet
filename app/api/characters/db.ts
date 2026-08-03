const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS characters (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    player TEXT NOT NULL DEFAULT '',
    class_label TEXT NOT NULL DEFAULT '',
    level INTEGER NOT NULL DEFAULT 1,
    data TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
];

export async function getD1() {
  const { env } = await import("cloudflare:workers");
  if (!env.DB) throw new Error("Shared character database is unavailable.");
  await env.DB.batch(schemaStatements.map((statement) => env.DB.prepare(statement)));
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

export function parseCharacter(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
