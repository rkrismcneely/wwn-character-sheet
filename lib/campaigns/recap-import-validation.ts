export type RecapSpeakerRole = "player" | "gm" | "guest";
export type RecapSpeakerDraft = {
  discordUserId: string | null;
  discordName: string;
  displayName: string;
  role: RecapSpeakerRole;
  characterId: string | null;
  characterName: string | null;
  speakerKey: string;
};

function label(value: unknown, max: number, name: string, optional = false): string {
  if (value == null && optional) return "";
  if (typeof value !== "string") throw new Error("Enter a valid " + name + ".");
  const normalized = value.trim();
  if ((!normalized && !optional) || normalized.length > max || /[\u0000-\u001f\u007f]/u.test(normalized)) {
    throw new Error("Enter a valid " + name + " (up to " + max + " characters).");
  }
  return normalized;
}

export function parseRecapSpeaker(input: unknown): RecapSpeakerDraft {
  if (!input || typeof input !== "object") throw new Error("Enter speaker details.");
  const value = input as Record<string, unknown>;
  const discordName = label(value.discordName, 80, "Discord username");
  const discordUserId = label(value.discordUserId, 24, "Discord user ID", true) || null;
  if (discordUserId && !/^\d{15,22}$/u.test(discordUserId)) {
    throw new Error("Discord user IDs must contain 15–22 digits.");
  }
  const displayName = label(value.displayName, 100, "person or guest name");
  const role = value.role;
  if (role !== "player" && role !== "guest" && role !== "gm") throw new Error("Choose a speaker role.");
  const characterId = label(value.characterId, 100, "character ID", true) || null;
  const characterName = label(value.characterName, 120, "character name", true) || null;
  if (characterId && characterName) throw new Error("Choose either a linked or a custom character.");
  return {
    discordUserId, discordName, displayName, role, characterId, characterName,
    speakerKey: discordUserId ? "id:" + discordUserId : "name:" + discordName.toLocaleLowerCase("en"),
  };
}

export function parseCraigRecording(input: unknown): { reference: string; label: string } {
  if (typeof input !== "string" || input.length > 700) throw new Error("Paste a valid Craig recording link.");
  let url: URL;
  try { url = new URL(input.trim()); } catch { throw new Error("Paste a valid Craig recording link."); }
  if (url.protocol !== "https:" || !["craig.horse", "craig.chat"].includes(url.hostname)
    || !/^\/rec\/[A-Za-z0-9_-]{5,80}\/?$/u.test(url.pathname)
    || url.username || url.password || url.hash || !url.searchParams.get("key")
    || url.searchParams.get("key")!.length > 200) {
    throw new Error("Use a Craig recording link that includes its access key.");
  }
  const id = url.pathname.split("/")[2];
  // Preserve the access key for later server-side retrieval; never expose this field in an API response.
  return { reference: url.toString(), label: "Craig recording " + id };
}

export function parseRecapSessionDate(date: unknown): string {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(date)
    || Number.isNaN(Date.parse(date + "T00:00:00Z"))
    || new Date(date + "T00:00:00Z").toISOString().slice(0, 10) !== date) {
    throw new Error("Enter a valid session date.");
  }
  return date;
}
