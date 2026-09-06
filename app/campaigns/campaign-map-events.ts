export const campaignMapOpenEvent = "twe:campaign-map-open";
export const campaignMapStateEvent = "twe:campaign-map-state";

export type CampaignMapOpenDetail = {
  campaignId: string;
  action?: "open" | "close";
};

export type CampaignMapStateDetail = {
  campaignId: string;
  open: boolean;
};
