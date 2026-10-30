import { canManageCampaignContent } from "./authorization.ts";
import { CampaignServiceError, loadCampaignAccess, requireActiveCampaign } from "./service.ts";
import type { CampaignActor } from "./types.ts";
import {
  parseCraigRecording, parseRecapSessionDate, parseRecapSpeaker,
  type RecapSpeakerRole,
} from "./recap-import-validation.ts";

export type RecapSpeakerAssociation = {
  id: string;
  discordUserId: string | null;
  discordName: string;
  displayName: string;
  role: RecapSpeakerRole;
  characterId: string | null;
  characterName: string | null;
  updatedAt: string;
};
export type RecapRecordingImport = {
  id: string;
  sourceType: "craig" | "upload" | "drive";
  sourceLabel: string;
  sessionDate: string;
  status: "awaiting_speakers" | "ready" | "processing" | "failed" | "completed";
  speakerCount: number;
  speakerIds: string[];
  createdAt: string;
};
type SpeakerRow = RecapSpeakerAssociation & { speakerKey: string; internalCharacterId: string | null };
type ImportRow = Omit<RecapRecordingImport, "speakerCount" | "speakerIds"> & { speakerCount: number; speakerIdsRaw: string | null };

function invalid(cause: unknown): never {
  if (cause instanceof CampaignServiceError) throw cause;
  throw new CampaignServiceError(cause instanceof Error ? cause.message : "Invalid recording details.", 422);
}
function idValue(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/iu.test(value)) {
    throw new CampaignServiceError("Select a valid item.", 422);
  }
  return value;
}
async function gmAccess(db: D1Database, actor: CampaignActor | null, campaignId: string, write = false) {
  if (!actor) throw new CampaignServiceError("Sign in is required.", 401);
  const record = await loadCampaignAccess(db, actor, campaignId);
  if (!canManageCampaignContent(actor, record.campaign, record.membership)) {
    throw new CampaignServiceError("Only campaign GMs can manage recording imports.", 403);
  }
  if (write) requireActiveCampaign(record.campaign);
  return record.campaign.id;
}
const speakerColumns = "s.id, s.speaker_key AS speakerKey, s.discord_user_id AS discordUserId, " +
  "s.discord_name AS discordName, s.display_name AS displayName, s.role, " +
  "ch.public_id AS characterId, s.character_id AS internalCharacterId, " +
  "s.character_name AS characterName, s.updated_at AS updatedAt";
function publicSpeaker(row: SpeakerRow): RecapSpeakerAssociation {
  return {
    id: row.id, discordUserId: row.discordUserId, discordName: row.discordName,
    displayName: row.displayName, role: row.role, characterId: row.characterId,
    characterName: row.characterName, updatedAt: row.updatedAt,
  };
}
export async function getRecapImportSetup(
  db: D1Database, actor: CampaignActor | null, campaignId: string,
): Promise<{ speakers: RecapSpeakerAssociation[]; imports: RecapRecordingImport[] }> {
  const id = await gmAccess(db, actor, campaignId);
  const [speakers, imports] = await Promise.all([
    db.prepare("SELECT " + speakerColumns + " FROM campaign_recap_speakers s " +
      "LEFT JOIN characters ch ON ch.id = s.character_id WHERE s.campaign_id = ? " +
      "ORDER BY lower(s.discord_name)").bind(id).all<SpeakerRow>(),
    db.prepare("SELECT r.id, r.source_type AS sourceType, r.source_label AS sourceLabel, " +
      "r.session_date AS sessionDate, r.status, r.created_at AS createdAt, " +
      "(SELECT count(*) FROM campaign_recap_recording_speakers WHERE import_id=r.id) AS speakerCount, " +
      "(SELECT group_concat(association_id) FROM campaign_recap_recording_speakers WHERE import_id=r.id) AS speakerIdsRaw " +
      "FROM campaign_recap_recording_imports r WHERE r.campaign_id=? " +
      "ORDER BY r.created_at DESC LIMIT 50").bind(id).all<ImportRow>(),
  ]);
  // source_reference contains the Craig access key. It MUST NOT be selected or returned here.
  return { speakers: speakers.results.map(publicSpeaker), imports: imports.results.map(row => ({
    id: row.id, sourceType: row.sourceType, sourceLabel: row.sourceLabel,
    sessionDate: row.sessionDate, status: row.status, speakerCount: Number(row.speakerCount),
    speakerIds: row.speakerIdsRaw?.split(",").filter(Boolean) ?? [],
    createdAt: row.createdAt,
  })) };
}

export async function saveRecapSpeaker(
  db: D1Database, actor: CampaignActor | null, campaignId: string, input: unknown,
): Promise<RecapSpeakerAssociation> {
  const campaignIdInternal = await gmAccess(db, actor, campaignId, true);
  if (!input || typeof input !== "object") invalid(new Error("Enter speaker details."));
  const request = input as Record<string, unknown>;
  let speaker: ReturnType<typeof parseRecapSpeaker>;
  try { speaker = parseRecapSpeaker(request); } catch (error) { invalid(error); }
  const associationId = request.id == null ? crypto.randomUUID() : idValue(request.id);
  const duplicate = await db.prepare("SELECT id FROM campaign_recap_speakers WHERE campaign_id=? AND speaker_key=? AND id<>?")
    .bind(campaignIdInternal, speaker.speakerKey, associationId).first<{ id: string }>();
  if (duplicate) throw new CampaignServiceError("That Discord speaker is already associated with this campaign.", 409);
  let linkedCharacterId: string | null = null;
  if (speaker.characterId) {
    const character = await db.prepare("SELECT ch.id FROM characters ch INNER JOIN campaign_characters cc " +
      "ON cc.character_id=ch.id WHERE ch.public_id=? AND cc.campaign_id=?")
      .bind(speaker.characterId, campaignIdInternal).first<{ id: string }>();
    if (!character) throw new CampaignServiceError("Choose a character linked to this campaign.", 422);
    linkedCharacterId = character.id;
  }
  const now = new Date().toISOString();
  if (request.id != null) {
    const result = await db.prepare("UPDATE campaign_recap_speakers SET speaker_key=?,discord_user_id=?, " +
      "discord_name=?,display_name=?,role=?,character_id=?,character_name=?,updated_at=? WHERE id=? AND campaign_id=?")
      .bind(speaker.speakerKey, speaker.discordUserId, speaker.discordName, speaker.displayName,
        speaker.role, linkedCharacterId, speaker.characterName, now, associationId, campaignIdInternal).run();
    if (result.meta.changes !== 1) throw new CampaignServiceError("Speaker association not found.", 404);
  } else {
    await db.prepare("INSERT INTO campaign_recap_speakers (id,campaign_id,speaker_key,discord_user_id," +
      "discord_name,display_name,role,character_id,character_name,created_at,updated_at) " +
      "VALUES (?,?,?,?,?,?,?,?,?,?,?)")
      .bind(associationId, campaignIdInternal, speaker.speakerKey, speaker.discordUserId,
        speaker.discordName, speaker.displayName, speaker.role, linkedCharacterId,
        speaker.characterName, now, now).run();
  }
  const row = await db.prepare("SELECT " + speakerColumns + " FROM campaign_recap_speakers s " +
    "LEFT JOIN characters ch ON ch.id=s.character_id WHERE s.campaign_id=? AND s.id=?")
    .bind(campaignIdInternal, associationId).first<SpeakerRow>();
  if (!row) throw new CampaignServiceError("Speaker association could not be loaded.", 404);
  return publicSpeaker(row);
}

export async function deleteRecapSpeaker(
  db: D1Database, actor: CampaignActor | null, campaignId: string, rawId: unknown,
): Promise<void> {
  const campaign = await gmAccess(db, actor, campaignId, true);
  const result = await db.prepare("DELETE FROM campaign_recap_speakers WHERE campaign_id=? AND id=?")
    .bind(campaign, idValue(rawId)).run();
  if (result.meta.changes !== 1) throw new CampaignServiceError("Speaker association not found.", 404);
  // Historical recording-speaker snapshots are deliberately unaffected.
}

export async function createRecapRecordingImport(
  db: D1Database, actor: CampaignActor | null, campaignId: string, input: unknown,
): Promise<RecapRecordingImport> {
  const campaign = await gmAccess(db, actor, campaignId, true);
  if (!input || typeof input !== "object") invalid(new Error("Enter recording details."));
  const request = input as Record<string, unknown>;
  if (request.sourceType !== "craig") {
    throw new CampaignServiceError("Audio uploads and Drive imports will be enabled in a later phase.", 422);
  }
  let reference: string, label: string, sessionDate: string;
  try {
    ({ reference, label } = parseCraigRecording(request.link));
    sessionDate = parseRecapSessionDate(request.sessionDate);
  } catch (error) { invalid(error); }
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await db.prepare("INSERT INTO campaign_recap_recording_imports (id,campaign_id,created_by," +
    "source_type,source_reference,source_label,session_date,status,created_at,updated_at) " +
    "VALUES (?,?,?,?,?,? ,?,'awaiting_speakers',?,?)")
    .bind(id, campaign, actor!.userId, "craig", reference, label, sessionDate, now, now).run();
  return { id, sourceType: "craig", sourceLabel: label, sessionDate,
    status: "awaiting_speakers", speakerCount: 0, speakerIds: [], createdAt: now };
}


/**
 * A media file has already been placed in campaign-private R2 by the upload
 * handler. Never accept an R2 key from a caller-controlled JSON body.
 */
export async function createUploadedRecapRecording(
  db: D1Database, actor: CampaignActor | null, campaignId: string,
  input: { storageKey: string; filename: string; sessionDate: unknown },
): Promise<RecapRecordingImport> {
  const internalId = await gmAccess(db, actor, campaignId, true);
  let sessionDate: string;
  try { sessionDate = parseRecapSessionDate(input.sessionDate); } catch (error) { invalid(error); }
  if (!/^recap-audio\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/iu.test(input.storageKey)) {
    throw new CampaignServiceError("Invalid recording storage key.", 422);
  }
  if (typeof input.filename !== "string" || !input.filename.trim() || input.filename.length > 150) {
    throw new CampaignServiceError("Enter a valid recording filename.", 422);
  }
  const id = crypto.randomUUID(), now = new Date().toISOString();
  await db.prepare("INSERT INTO campaign_recap_recording_imports " +
    "(id,campaign_id,created_by,source_type,source_reference,source_label,session_date,status,created_at,updated_at) " +
    "VALUES (?,?,?,?,?,?,?,'awaiting_speakers',?,?)")
    .bind(id, internalId, actor!.userId, "upload", input.storageKey,
      input.filename.trim(), sessionDate, now, now).run();
  return { id, sourceType: "upload", sourceLabel: input.filename.trim(), sessionDate,
    status: "awaiting_speakers", speakerCount: 0, speakerIds: [], createdAt: now };
}

export async function confirmRecapRecordingSpeakers(
  db: D1Database, actor: CampaignActor | null, campaignId: string, input: unknown,
): Promise<void> {
  const campaign = await gmAccess(db, actor, campaignId, true);
  if (!input || typeof input !== "object") invalid(new Error("Choose the recording speakers."));
  const request = input as Record<string, unknown>;
  const importId = idValue(request.importId);
  if (!Array.isArray(request.associationIds) || request.associationIds.length < 1
    || request.associationIds.length > 32
    || !request.associationIds.every(item => typeof item === "string")
    || new Set(request.associationIds).size !== request.associationIds.length) {
    throw new CampaignServiceError("Select 1–32 unique speaker associations.", 422);
  }
  const target = await db.prepare("SELECT id FROM campaign_recap_recording_imports " +
    "WHERE campaign_id=? AND id=? AND status IN ('awaiting_speakers','ready')")
    .bind(campaign, importId).first<{ id: string }>();
  if (!target) throw new CampaignServiceError("Recording not found or already processing.", 409);
  const all = await db.prepare("SELECT id,discord_user_id AS discordUserId,discord_name AS discordName," +
    "display_name AS displayName,role,character_id AS characterId,character_name AS characterName " +
    "FROM campaign_recap_speakers WHERE campaign_id=?").bind(campaign).all<{
      id: string; discordUserId: string | null; discordName: string; displayName: string;
      role: RecapSpeakerRole; characterId: string | null; characterName: string | null;
    }>();
  const byId = new Map(all.results.map(row => [row.id, row]));
  const selected = request.associationIds.map(id => byId.get(id as string));
  if (selected.some(row => !row)) throw new CampaignServiceError("A speaker was removed. Refresh and try again.", 409);
  const now = new Date().toISOString();
  // D1 batch runs in one transaction: snapshot and status change succeed together.
  await db.batch([
    db.prepare("DELETE FROM campaign_recap_recording_speakers WHERE import_id=?").bind(importId),
    ...selected.map(row => db.prepare("INSERT INTO campaign_recap_recording_speakers " +
      "(import_id,association_id,discord_user_id,discord_name,display_name,role,character_id,character_name) " +
      "VALUES (?,?,?,?,?,?,?,?)").bind(importId, row!.id, row!.discordUserId, row!.discordName,
        row!.displayName, row!.role, row!.characterId, row!.characterName)),
    db.prepare("UPDATE campaign_recap_recording_imports SET status='ready',updated_at=? " +
      "WHERE id=? AND campaign_id=? AND status IN ('awaiting_speakers','ready')").bind(now, importId, campaign),
  ]);
}
