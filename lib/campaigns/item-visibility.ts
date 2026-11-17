/** Campaign items use the existing D1 all/selected check constraint.
 * A selected item with zero target rows is GM-only and never matches the
 * player-facing inventory query (which requires an explicit target row).
 * This keeps the feature backward compatible without a data migration.
 */
export type CampaignItemVisibility = "all" | "selected" | "gm";
export type StoredItemVisibility = "all" | "selected";

export function storedItemVisibility(mode:CampaignItemVisibility):StoredItemVisibility {
  return mode==="gm"?"selected":mode;
}

export function managedItemVisibility(stored:StoredItemVisibility, selectedCharacters:number):CampaignItemVisibility {
  return stored==="selected"&&selectedCharacters===0?"gm":stored;
}

/** Only GM-only/all visibility may have no selected target rows. */
export function itemVisibilityTargets(mode:CampaignItemVisibility, ids:readonly string[]):string[] {
  return mode==="selected"?[...ids]:[];
}
