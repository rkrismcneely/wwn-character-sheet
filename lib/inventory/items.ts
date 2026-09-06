export type InventoryItemKind = "mundane" | "magical" | "weapon" | "armor";

export type CampaignWeaponSkill = "Stab" | "Shoot" | "Punch";
export type CampaignWeaponAttribute = "Str" | "Dex" | "Str/Dex";
export type CampaignShieldSize = "none" | "small" | "large";

export interface CampaignWeaponProperties {
  damage: string;
  shock: string;
  range: string;
  attribute: CampaignWeaponAttribute;
  skill: CampaignWeaponSkill;
  encumbrance: number;
  traits: string;
}

export interface CampaignArmorProperties {
  armorClass: number;
  encumbrance: number;
  shield: CampaignShieldSize;
  restrictions: string;
  properties: string;
}

export interface CampaignMagicalProperties {
  bonuses: string;
  abilities: string;
  charges: number | null;
  uses: string;
  rulesText: string;
}

export interface CampaignItemProperties {
  weapon?: CampaignWeaponProperties;
  armor?: CampaignArmorProperties;
  magical?: CampaignMagicalProperties;
}

export interface CampaignInventoryItemSnapshot {
  id: string;
  campaignId: string;
  name: string;
  kind: InventoryItemKind;
  description: string;
  properties?: CampaignItemProperties;
}

function cleanProperties(value: unknown): CampaignItemProperties | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value as Record<string, unknown>;
  const properties: CampaignItemProperties = {};
  const isText = (entry: unknown): entry is string => typeof entry === "string" && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(entry);
  const isInteger = (entry: unknown): entry is number => Number.isInteger(entry);
  if (candidate.weapon && typeof candidate.weapon === "object" && !Array.isArray(candidate.weapon)) {
    const weapon = candidate.weapon as Record<string, unknown>;
    if (isText(weapon.damage) && isText(weapon.shock) && isText(weapon.range)
      && (weapon.attribute === "Str" || weapon.attribute === "Dex" || weapon.attribute === "Str/Dex")
      && (weapon.skill === "Stab" || weapon.skill === "Shoot" || weapon.skill === "Punch")
      && isInteger(weapon.encumbrance) && weapon.encumbrance >= 0 && isText(weapon.traits)) {
      properties.weapon = {
        damage: weapon.damage,
        shock: weapon.shock,
        range: weapon.range,
        attribute: weapon.attribute,
        skill: weapon.skill,
        encumbrance: weapon.encumbrance,
        traits: weapon.traits,
      };
    }
  }
  if (candidate.armor && typeof candidate.armor === "object" && !Array.isArray(candidate.armor)) {
    const armor = candidate.armor as Record<string, unknown>;
    if (isInteger(armor.armorClass) && armor.armorClass >= 0 && isInteger(armor.encumbrance)
      && armor.encumbrance >= 0 && (armor.shield === "none" || armor.shield === "small" || armor.shield === "large")
      && isText(armor.restrictions) && isText(armor.properties)) {
      properties.armor = {
        armorClass: armor.armorClass,
        encumbrance: armor.encumbrance,
        shield: armor.shield,
        restrictions: armor.restrictions,
        properties: armor.properties,
      };
    }
  }
  if (candidate.magical && typeof candidate.magical === "object" && !Array.isArray(candidate.magical)) {
    const magical = candidate.magical as Record<string, unknown>;
    if (isText(magical.bonuses) && isText(magical.abilities)
      && (magical.charges === null || (isInteger(magical.charges) && magical.charges >= 0))
      && isText(magical.uses) && isText(magical.rulesText)) {
      properties.magical = {
        bonuses: magical.bonuses,
        abilities: magical.abilities,
        charges: magical.charges,
        uses: magical.uses,
        rulesText: magical.rulesText,
      };
    }
  }
  return Object.keys(properties).length ? properties : undefined;
}

const CAMPAIGN_ITEM_PREFIX = "__twe_campaign_item__";

function cleanSnapshot(value: unknown): CampaignInventoryItemSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.id !== "string"
    || typeof candidate.campaignId !== "string"
    || typeof candidate.name !== "string"
    || !["mundane", "magical", "weapon", "armor"].includes(candidate.kind as InventoryItemKind)
    || typeof candidate.description !== "string"
  ) return null;
  const name = candidate.name.trim();
  if (!name) return null;
  const properties = cleanProperties(candidate.properties);
  return {
    id: candidate.id,
    campaignId: candidate.campaignId,
    name,
    kind: candidate.kind as InventoryItemKind,
    description: candidate.description,
    ...(properties ? { properties } : {}),
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
  const snapshot = campaignInventorySnapshot(value);
  if (!snapshot) return "";
  const weapon = snapshot.kind === "weapon" ? snapshot.properties?.weapon : undefined;
  const armor = snapshot.kind === "armor" ? snapshot.properties?.armor : undefined;
  const magical = snapshot.kind === "magical" ? snapshot.properties?.magical : undefined;
  const structured = weapon
    ? `${weapon.damage} · Shock ${weapon.shock} · ${weapon.skill}/${weapon.attribute} · Range ${weapon.range} · Enc ${weapon.encumbrance}${weapon.traits ? ` · ${weapon.traits}` : ""}`
    : armor
      ? `AC ${armor.armorClass} · Enc ${armor.encumbrance}${armor.shield !== "none" ? ` · ${armor.shield} shield` : ""}${armor.properties ? ` · ${armor.properties}` : ""}${armor.restrictions ? ` · Restrictions: ${armor.restrictions}` : ""}`
      : magical
        ? [magical.bonuses, magical.abilities, magical.charges === null ? "" : `${magical.charges} charges`, magical.uses, magical.rulesText].filter(Boolean).join(" · ")
        : "";
  return [snapshot.description, structured].filter(Boolean).join(" · ");
}

export function campaignInventoryKindLabel(kind: InventoryItemKind): string {
  return kind === "armor" ? "Armour" : kind === "weapon" ? "Weapon" : kind === "magical" ? "Magical Item" : "Mundane Item";
}

export function campaignInventoryWeapon(value: string) {
  const snapshot = campaignInventorySnapshot(value);
  const weapon = snapshot?.kind === "weapon" ? snapshot.properties?.weapon : undefined;
  if (!snapshot || !weapon) return null;
  return {
    name: snapshot.name,
    damage: weapon.damage,
    shock: weapon.shock,
    range: weapon.range,
    attribute: weapon.attribute,
    skill: weapon.skill,
    traits: weapon.traits,
    enc: String(weapon.encumbrance),
    cost: "-",
  };
}

export function campaignInventoryArmor(value: string) {
  const snapshot = campaignInventorySnapshot(value);
  const armor = snapshot?.kind === "armor" ? snapshot.properties?.armor : undefined;
  if (!snapshot || !armor) return null;
  return {
    name: snapshot.name,
    ac: armor.armorClass,
    enc: armor.encumbrance,
    shield: armor.shield,
    restrictions: armor.restrictions,
    properties: armor.properties,
  };
}

export function isCampaignInventoryValue(value: unknown): value is string {
  return Boolean(campaignInventorySnapshot(value));
}
