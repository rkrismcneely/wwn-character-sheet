/** Notify mounted campaign views after a successful NPC library mutation. */
export const NPC_CHANGED_EVENT = "twe:campaign-npc-changed";

export function notifyCampaignNpcChanged(campaignId: string, npcId: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(NPC_CHANGED_EVENT, { detail: { campaignId, npcId } }));
}
