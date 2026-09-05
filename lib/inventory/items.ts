export type InventoryItemKind = "mundane" | "magical";

export interface CampaignInventoryItemSnapshot {
  id: string;
  campaignId: string;
  name: string;
  kind: InventoryItemKind;
  description: string;
}

const CAMPAIGN_ITEM_PREFIX = "__twe_campaign_item__";

function cleanSnapshot(value: unknown): CampaignInventoryItemSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.id !== "string"
    || typeof candidate.campaignId !== "string"
    || typeof candidate.name !== "string"
    || (candidate.kind !== "mundane" && candidate.kind !== "magical")
    || typeof candidate.description !== "string"
  ) return null;
  const name = candidate.name.trim();
  if (!name) return null;
  return {
    id: candidate.id,
    campaignId: candidate.campaignId,
    name,
    kind: candidate.kind,
    description: candidate.description,
  };
}

export function campaignInventoryValue(item: CampaignInventoryItemSnapshot): string {
  return `${CAMPAIGN_ITEM_PREFIX}${encodeURIComponent(JSON.stringify(cleanSnapshot(item) ?? item))}`;
}

export function campaignInventorySnapshot(value: unknown): CampaignInventoryItemSnapshot | null {
  if (typeof value !== "string" || !value.startsWith(CAMPAIGN_ITEM_PREFIX)) return null;
  try {
    return cleanSnapshot(JSON.parse(decodeURIComponent(value.slice(CAMPAIGN_ITEM_PREFIX.length))) as unknown);
  } catch {
    return null;
  }
}

export function inventoryItemDisplayName(value: string): string {
  return campaignInventorySnapshot(value)?.name ?? value;
}

export function inventoryItemDescription(value: string): string {
  return campaignInventorySnapshot(value)?.description ?? "";
}

export function isCampaignInventoryValue(value: unknown): value is string {
  return Boolean(campaignInventorySnapshot(value));
}
