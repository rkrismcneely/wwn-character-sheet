const locallyAnimatedCampaignRollIds = new Set<string>();

const MAX_LOCALLY_ANIMATED_ROLL_IDS = 100;

export function markCampaignRollAnimatedLocally(rollId: string): void {
  if (locallyAnimatedCampaignRollIds.size >= MAX_LOCALLY_ANIMATED_ROLL_IDS) {
    locallyAnimatedCampaignRollIds.clear();
  }
  locallyAnimatedCampaignRollIds.add(rollId);
}

export function wasCampaignRollAnimatedLocally(rollId: string): boolean {
  return locallyAnimatedCampaignRollIds.has(rollId);
}
