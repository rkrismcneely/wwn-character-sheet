import { officialInventoryItems } from "./equipment-data.ts";
import { campaignInventorySnapshot } from "../lib/inventory/items.ts";

const officialInventorySet = new Set<string>(officialInventoryItems);

export function isCustomInventoryItem(value: string | null | undefined) {
  const item = typeof value === "string" ? value.trim() : "";
  return Boolean(item) && !officialInventorySet.has(item) && !campaignInventorySnapshot(item);
}

export function customInventoryItemNames(
  groups: readonly (readonly string[])[],
) {
  const names = new Set<string>();
  for (const group of groups) {
    for (const value of group) {
      const item = typeof value === "string" ? value.trim() : "";
      if (isCustomInventoryItem(item)) names.add(item);
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}
