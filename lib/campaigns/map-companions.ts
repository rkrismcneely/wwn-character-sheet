export type CampaignMapCompanionKind = "beastmaster" | "henchman" | "familiar";

export interface CampaignMapCompanionOption {
  id: string;
  characterId: string;
  characterName: string;
  companionId: string;
  name: string;
  kind: CampaignMapCompanionKind;
  label: string;
}

const sourceSeparator = "::";

const companionLabels: Record<CampaignMapCompanionKind, string> = {
  beastmaster: "Beastmaster Companion",
  henchman: "Henchkeeper",
  familiar: "Spirit Familiar",
};

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function characterData(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    try {
      return record(JSON.parse(value));
    } catch {
      return null;
    }
  }
  return record(value);
}

function companionKind(value: unknown): CampaignMapCompanionKind | null {
  return value === "beastmaster" || value === "henchman" || value === "familiar"
    ? value
    : null;
}

export function campaignMapCompanionSourceId(characterId: string, companionId: string): string {
  return `${characterId}${sourceSeparator}${companionId}`;
}

export function campaignMapCompanionCharacterId(sourceId: string): string | null {
  const separatorIndex = sourceId.indexOf(sourceSeparator);
  if (separatorIndex <= 0 || separatorIndex === sourceId.length - sourceSeparator.length) return null;
  const characterId = sourceId.slice(0, separatorIndex).trim();
  const companionId = sourceId.slice(separatorIndex + sourceSeparator.length).trim();
  return characterId && companionId ? characterId : null;
}

export function campaignMapCompanionsFromCharacterData(
  characterId: string,
  characterName: string,
  data: unknown,
): CampaignMapCompanionOption[] {
  const parsed = characterData(data);
  if (!parsed || !Array.isArray(parsed.companions)) return [];

  const companions: CampaignMapCompanionOption[] = [];
  const seen = new Set<string>();
  for (const value of parsed.companions) {
    const companion = record(value);
    if (!companion) continue;
    const kind = companionKind(companion.kind);
    const companionId = typeof companion.id === "string" ? companion.id.trim() : "";
    const name = typeof companion.name === "string" ? companion.name.trim() : "";
    if (!kind || !companionId || !name) continue;
    if (kind === "familiar" && companion.summoned === false) continue;
    const id = campaignMapCompanionSourceId(characterId, companionId);
    if (seen.has(id)) continue;
    seen.add(id);
    companions.push({
      id,
      characterId,
      characterName,
      companionId,
      name,
      kind,
      label: companionLabels[kind],
    });
  }
  return companions;
}
