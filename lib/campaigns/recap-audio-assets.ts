import { getCampaignSessionRecap } from "./session-recaps.ts";
import { canManageCampaignContent } from "./authorization.ts";
import { loadCampaignAccess, CampaignServiceError } from "./service.ts";
import type { CampaignActor } from "./types.ts";

/** Safe for the browser: no storage connection IDs, remote file IDs or tokens. */
export type RecapAudioForPlayer = {
  id: string;
  label: string;
  provider: "google-drive" | "dropbox" | "onedrive";
  mimeType: string | null;
  durationMs: number | null;
  byteSize: number | null;
  trackIndex: number;
  offsetMs: number;
  primaryAudio: boolean;
  status: "preparing" | "ready" | "auth_required" | "unavailable";
  canRecover: boolean;
};
type AudioRow = Omit<RecapAudioForPlayer, "primaryAudio" | "canRecover"> & {
  primaryAudio: number; storageOwnerUserId: string;
};
const audioQuery = [
  "SELECT a.id, a.label, s.provider, a.mime_type AS mimeType, a.storage_owner_user_id AS storageOwnerUserId,",
  "a.duration_ms AS durationMs, a.byte_size AS byteSize, a.track_index AS trackIndex,",
  "a.offset_ms AS offsetMs, a.primary_audio AS primaryAudio,",
  "CASE WHEN s.status != 'connected' THEN 'auth_required' ELSE a.status END AS status",
  "FROM campaign_recap_audio_assets a",
  "JOIN user_recap_storage_connections s ON s.id = a.connection_id AND s.user_id = a.storage_owner_user_id",
  "WHERE a.campaign_id = ? AND a.recap_id = ? AND a.processing_job_id IS NULL",
  "ORDER BY a.primary_audio DESC, a.track_index ASC, a.created_at ASC LIMIT 128",
].join(" ");

/**
 * Campaign authorization precedes all asset discovery. Remote playback will
 * need a separate authenticated streaming handler and storage owner consent.
 */
export async function listRecapAudioForPlayer(
  db: D1Database, actor: CampaignActor | null, campaignId: string, recapId: unknown,
): Promise<RecapAudioForPlayer[]> {
  if (!actor) throw new CampaignServiceError("Sign in required.", 401);
  const { campaign, membership } = await loadCampaignAccess(db, actor, campaignId);
  const canManage = canManageCampaignContent(actor,campaign,membership);
  const recap = await getCampaignSessionRecap(db, actor, campaignId, recapId);
  const result = await db.prepare(audioQuery).bind(campaign.id, recap.id).all<AudioRow>();
  return result.results.map(row => ({
    id: row.id, label: row.label, provider: row.provider, mimeType: row.mimeType,
    durationMs: row.durationMs, byteSize: row.byteSize, trackIndex: row.trackIndex, offsetMs: row.offsetMs,
    primaryAudio: row.primaryAudio === 1, status: row.status,
    canRecover: canManage && row.storageOwnerUserId === actor.userId && row.status === "preparing",
  }));
}
