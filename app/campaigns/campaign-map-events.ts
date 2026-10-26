export const campaignMapOpenEvent = "twe:campaign-map-open";
export const campaignMapStateEvent = "twe:campaign-map-state";
export const campaignMapDockEvent = "twe:campaign-map-dock";

export type CampaignMapOpenDetail = {
  campaignId: string;
  action?: "open" | "close";
  mapId?: string;
};

export type CampaignMapStateDetail = {
  campaignId: string;
  open: boolean;
};

export type CampaignMapDockDetail = {
  dock: "left" | "right";
};
