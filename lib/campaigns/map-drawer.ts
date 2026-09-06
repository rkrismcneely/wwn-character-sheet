export type CampaignMapDrawerDock = "left" | "right";

export const campaignMapDrawerMinWidth = 320;
export const campaignMapDrawerMaxWidth = 720;
export const campaignMapDrawerDefaultWidth = 400;

export function clampCampaignMapDrawerWidth(width: number, viewportWidth: number): number {
  const viewportLimit = Math.max(campaignMapDrawerMinWidth, viewportWidth - 32);
  return Math.round(Math.min(Math.max(width, campaignMapDrawerMinWidth), Math.min(campaignMapDrawerMaxWidth, viewportLimit)));
}

export function resizedCampaignMapDrawerWidth(options: {
  dock: CampaignMapDrawerDock;
  startWidth: number;
  startClientX: number;
  clientX: number;
  viewportWidth: number;
}): number {
  const horizontalDelta = options.dock === "right"
    ? options.startClientX - options.clientX
    : options.clientX - options.startClientX;
  return clampCampaignMapDrawerWidth(options.startWidth + horizontalDelta, options.viewportWidth);
}
