const forbiddenAtEveryDepth = new Set([
  "owneruserid",
  "userid",
  "publicid",
  "betterauthuserid",
  "googleid",
  "googlesubjectid",
  "provideraccountid",
  "accountid",
  "email",
  "owner",
  "account",
  "auth",
  "session",
  "accesstoken",
  "refreshtoken",
  "idtoken",
  "sessiontoken",
  "claimtoken",
  "tokenhash",
]);

const forbiddenAtRoot = new Set([
  "id",
  "visibility",
]);

function normalizedKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/gu, "");
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (depth > 40) throw new Error("Character data is nested too deeply.");
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, depth + 1));
  }
  if (!value || typeof value !== "object") return value;

  const clean: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    const normalized = normalizedKey(key);
    if (forbiddenAtEveryDepth.has(normalized)) continue;
    if (depth === 0 && forbiddenAtRoot.has(normalized)) continue;
    clean[key] = sanitizeValue(child, depth + 1);
  }
  return clean;
}

function normalizeLegacyFocusNames(character: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(character.focusPicks)) return character;
  character.focusPicks = character.focusPicks.map((pick) => {
    if (!pick || typeof pick !== "object" || Array.isArray(pick)) return pick;
    const focus = pick as Record<string, unknown>;
    return focus.name === "Cultured Through"
      ? { ...focus, name: "Cultured" }
      : focus;
  });
  return character;
}

export function parseCharacter(
  value: unknown,
): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const clean = sanitizeValue(value, 0) as Record<string, unknown>;
  return normalizeLegacyFocusNames(clean);
}

export function characterForStorage(character: unknown): Record<string, unknown> | null {
  const clean = parseCharacter(character);
  if (!clean) return null;
  // Portrait references are server-controlled. New/imported characters start
  // without one and may add an R2 object only through the owner-authorized
  // portrait endpoint.
  clean.portrait = "";
  return clean;
}
