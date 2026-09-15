export const campaignStoreOpenEvent = "twe:campaign-store-open";
export const campaignStoreStateEvent = "twe:campaign-store-state";

export type CampaignStoreOpenDetail = {
  campaignId: string;
  action?: "open" | "close";
};

export type CampaignStoreStateDetail = {
  campaignId: string;
  open: boolean;
};
