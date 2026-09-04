import { effectiveDisplayName } from "../account/display-name.ts";
import { hashOpaqueToken } from "../security/opaque-tokens.ts";
import { CampaignServiceError, loadCampaignAccess, requireActiveCampaign } from "./service.ts";
import type { CampaignActor } from "./types.ts";
import { campaignCharacterStatus, type CampaignCharacterCardData } from "./character-card.ts";
import type { CampaignLiveSession, CampaignLiveSessionCharacter, CampaignLiveSessionState } from "./live-session.ts";

interface SessionRow { id: string; campaignId: string; startedAt: string }
export interface ActiveCharacterLiveSessionCampaign { id: string; name: string }
interface ParticipantRow {
  userId: string; joinedAt: string; providerName: string; customDisplayName: string | null;
  characterId: string | null; characterName: string | null; characterLevel: number | null;
  characterClassLabel: string | null; characterData: string | null;
}

async function participantKey(sessionId: string, userId: string): Promise<string> {
  return `cspt_${(await hashOpaqueToken(`campaign-session:${sessionId}:${userId}`)).slice(0, 32)}`;
}

function isOwner(actor: CampaignActor, ownerUserId: string): boolean { return actor.userId === ownerUserId; }
function isParticipant(actor: CampaignActor, ownerUserId: string, membership: { userId: string } | null): boolean {
  return isOwner(actor, ownerUserId) || Boolean(membership?.userId === actor.userId);
}
function requireOwner(actor: CampaignActor, ownerUserId: string): void {
  if (!isOwner(actor, ownerUserId)) throw new CampaignServiceError("Only the campaign owner can manage live sessions.", 403);
}
function requireSessionParticipant(actor: CampaignActor, ownerUserId: string, membership: { userId: string } | null): void {
  if (!isParticipant(actor, ownerUserId, membership)) throw new CampaignServiceError("Only campaign members can join this live session.", 403);
}

async function activeSession(db: D1Database, campaignId: string): Promise<SessionRow | null> {
  return db.prepare(`SELECT id, campaign_id AS campaignId, started_at AS startedAt FROM campaign_sessions WHERE campaign_id = ? AND ended_at IS NULL`).bind(campaignId).first<SessionRow>();
}

async function sessionParticipants(db: D1Database, sessionId: string, campaignId: string): Promise<ParticipantRow[]> {
  const result = await db.prepare(`SELECT p.user_id AS userId, p.joined_at AS joinedAt, u.name AS providerName, u.display_name AS customDisplayName,
    ch.public_id AS characterId, ch.name AS characterName, ch.level AS characterLevel,
    ch.class_label AS characterClassLabel, ch.data AS characterData
    FROM campaign_session_participants p JOIN user u ON u.id = p.user_id
    LEFT JOIN characters ch ON ch.id = (
      SELECT cc.character_id FROM campaign_characters cc JOIN characters candidate ON candidate.id = cc.character_id
      WHERE cc.campaign_id = ? AND candidate.owner_user_id = p.user_id ORDER BY cc.added_at ASC LIMIT 1
    )
    WHERE p.session_id = ? ORDER BY p.joined_at ASC`).bind(campaignId, sessionId).all<ParticipantRow>();
  return result.results;
}

function characterStatus(row: ParticipantRow): CampaignLiveSessionCharacter | null {
  if (!row.characterId || !row.characterName || row.characterLevel === null || !row.characterClassLabel) return null;
  let data: CampaignCharacterCardData = {};
  try { data = JSON.parse(row.characterData || "{}") as CampaignCharacterCardData; } catch { /* show stored summary fallbacks */ }
  return campaignCharacterStatus(data, {
    id: row.characterId,
    name: row.characterName,
    level: row.characterLevel,
    classLabel: row.characterClassLabel,
  });
}

async function payload(db: D1Database, session: SessionRow): Promise<CampaignLiveSession> {
  const participants = await sessionParticipants(db, session.id, session.campaignId);
  return { id: session.id, startedAt: session.startedAt, recentRolls: [], encounter: null, participants: await Promise.all(participants.map(async participant => ({
    participantKey: await participantKey(session.id, participant.userId),
    name: effectiveDisplayName(participant.customDisplayName, participant.providerName),
    characterName: participant.characterName ?? null,
    character: characterStatus(participant),
    joinedAt: participant.joinedAt,
    connected: false,
  }))) };
}

async function stateFor(db: D1Database, actor: CampaignActor, publicId: string): Promise<{ state: CampaignLiveSessionState; campaignId: string }> {
  const { campaign, membership } = await loadCampaignAccess(db, actor, publicId);
  const session = await activeSession(db, campaign.id);
  const sessionPayload = session ? await payload(db, session) : null;
  const active = !campaign.archivedAt;
  const participant = isParticipant(actor, campaign.ownerUserId, membership);
  const actorParticipantKey = sessionPayload ? await participantKey(sessionPayload.id, actor.userId) : null;
  const joined = sessionPayload
    ? sessionPayload.participants.some(candidate => candidate.participantKey === actorParticipantKey)
    : false;
  return { campaignId: campaign.id, state: { session: sessionPayload, permissions: {
    canStart: active && isOwner(actor, campaign.ownerUserId),
    canJoin: active && Boolean(session) && participant && !joined,
    canEnd: active && Boolean(session) && isOwner(actor, campaign.ownerUserId),
    canManageEncounter: active && Boolean(session) && joined && isOwner(actor, campaign.ownerUserId),
    joined,
    adminReadOnly: actor.role === "admin" && !participant,
  } } };
}

export async function readLiveSession(db: D1Database, actor: CampaignActor, publicId: string): Promise<CampaignLiveSessionState> { return (await stateFor(db, actor, publicId)).state; }
export async function readLiveSessionContext(db: D1Database, actor: CampaignActor, publicId: string): Promise<{ state: CampaignLiveSessionState; campaignId: string }> { return stateFor(db, actor, publicId); }

/**
 * The character sheet only learns about active sessions for its owner's own
 * linked characters. This is a discovery projection; joining still uses the
 * normal campaign session endpoint and its full membership checks.
 */
export async function listActiveCharacterLiveSessionCampaigns(
  db: D1Database,
  actor: CampaignActor,
  characterPublicId: string,
): Promise<ActiveCharacterLiveSessionCampaign[]> {
  const result = await db.prepare(`SELECT c.public_id AS id, c.name
    FROM characters ch
    JOIN campaign_characters cc ON cc.character_id = ch.id
    JOIN campaigns c ON c.id = cc.campaign_id AND c.archived_at IS NULL
    JOIN campaign_sessions s ON s.campaign_id = c.id AND s.ended_at IS NULL
    LEFT JOIN campaign_members cm ON cm.campaign_id = c.id AND cm.user_id = ?
    WHERE ch.public_id = ? AND ch.owner_user_id = ?
      AND (c.owner_user_id = ? OR cm.user_id = ?)
    ORDER BY lower(c.name), c.updated_at DESC`)
    .bind(actor.userId, characterPublicId, actor.userId, actor.userId, actor.userId)
    .all<ActiveCharacterLiveSessionCampaign>();
  return result.results.map(({ id, name }) => ({ id, name }));
}

export async function startLiveSession(db: D1Database, actor: CampaignActor, publicId: string, now = new Date().toISOString()): Promise<{ state: CampaignLiveSessionState; campaignId: string }> {
  const { campaign } = await loadCampaignAccess(db, actor, publicId);
  requireActiveCampaign(campaign); requireOwner(actor, campaign.ownerUserId);
  const existing = await activeSession(db, campaign.id);
  if (existing) return stateFor(db, actor, publicId);
  const id = crypto.randomUUID();
  try {
    await db.batch([
      db.prepare("INSERT INTO campaign_sessions (id, campaign_id, started_by_user_id, started_at) VALUES (?, ?, ?, ?)").bind(id, campaign.id, actor.userId, now),
      db.prepare("INSERT INTO campaign_session_participants (session_id, user_id, joined_at) VALUES (?, ?, ?)").bind(id, actor.userId, now),
    ]);
  } catch (error) {
    if (!(await activeSession(db, campaign.id))) throw error;
  }
  return stateFor(db, actor, publicId);
}

export async function joinLiveSession(db: D1Database, actor: CampaignActor, publicId: string, now = new Date().toISOString()): Promise<{ state: CampaignLiveSessionState; campaignId: string }> {
  const { campaign, membership } = await loadCampaignAccess(db, actor, publicId);
  requireActiveCampaign(campaign); requireSessionParticipant(actor, campaign.ownerUserId, membership);
  const session = await activeSession(db, campaign.id);
  if (!session) throw new CampaignServiceError("There is no active live session to join.", 409);
  await db.prepare("INSERT OR IGNORE INTO campaign_session_participants (session_id, user_id, joined_at) VALUES (?, ?, ?)").bind(session.id, actor.userId, now).run();
  return stateFor(db, actor, publicId);
}

export async function endLiveSession(db: D1Database, actor: CampaignActor, publicId: string, now = new Date().toISOString()): Promise<{ state: CampaignLiveSessionState; campaignId: string; endedSessionId: string | null }> {
  const { campaign } = await loadCampaignAccess(db, actor, publicId);
  requireOwner(actor, campaign.ownerUserId);
  const session = await activeSession(db, campaign.id);
  if (!session) return { ...(await stateFor(db, actor, publicId)), endedSessionId: null };
  await db.prepare("UPDATE campaign_sessions SET ended_at = ?, ended_by_user_id = ? WHERE id = ? AND ended_at IS NULL").bind(now, actor.userId, session.id).run();
  return { ...(await stateFor(db, actor, publicId)), endedSessionId: session.id };
}

export async function authorizeLiveSessionConnection(db: D1Database, actor: CampaignActor, publicId: string): Promise<{ campaignId: string; sessionId: string; participantKey: string }> {
  const { campaign, membership } = await loadCampaignAccess(db, actor, publicId);
  requireActiveCampaign(campaign); requireSessionParticipant(actor, campaign.ownerUserId, membership);
  const session = await activeSession(db, campaign.id);
  if (!session) throw new CampaignServiceError("There is no active live session.", 409);
  const joined = await db.prepare("SELECT 1 AS joined FROM campaign_session_participants WHERE session_id = ? AND user_id = ?").bind(session.id, actor.userId).first<{ joined: number }>();
  if (!joined) throw new CampaignServiceError("Join the live session before connecting.", 409);
  return { campaignId: campaign.id, sessionId: session.id, participantKey: await participantKey(session.id, actor.userId) };
}

export async function authorizeEncounterManagement(
  db: D1Database,
  actor: CampaignActor,
  publicId: string,
): Promise<{ campaignId: string; sessionId: string; participantKey: string }> {
  const { campaign } = await loadCampaignAccess(db, actor, publicId);
  requireActiveCampaign(campaign);
  requireOwner(actor, campaign.ownerUserId);
  const session = await activeSession(db, campaign.id);
  if (!session) throw new CampaignServiceError("There is no active live session.", 409);
  const joined = await db.prepare("SELECT 1 AS joined FROM campaign_session_participants WHERE session_id = ? AND user_id = ?")
    .bind(session.id, actor.userId).first<{ joined: number }>();
  if (!joined) throw new CampaignServiceError("Join the live session before managing an encounter.", 409);
  return { campaignId: campaign.id, sessionId: session.id, participantKey: await participantKey(session.id, actor.userId) };
}

export async function authorizeEncounterCharacter(
  db: D1Database,
  campaignId: string,
  sessionId: string,
  characterPublicId: string,
): Promise<{ id: string }> {
  const character = await db.prepare(`SELECT ch.public_id AS id
    FROM campaign_characters cc
    JOIN characters ch ON ch.id = cc.character_id
    JOIN campaign_session_participants p ON p.session_id = ? AND p.user_id = ch.owner_user_id
    WHERE cc.campaign_id = ? AND ch.public_id = ?`)
    .bind(sessionId, campaignId, characterPublicId).first<{ id: string }>();
  if (!character) throw new CampaignServiceError("Only a linked session participant can join the encounter.", 422);
  return character;
}

export async function authorizeLiveSessionRoll(
  db: D1Database,
  actor: CampaignActor,
  publicId: string,
  characterPublicId: string,
): Promise<{ campaignId: string; sessionId: string; participantKey: string; character: { id: string; name: string } }> {
  const connection = await authorizeLiveSessionConnection(db, actor, publicId);
  const character = await db.prepare(`SELECT ch.public_id AS id, ch.name
    FROM campaign_characters cc JOIN characters ch ON ch.id = cc.character_id
    WHERE cc.campaign_id = ? AND ch.public_id = ? AND ch.owner_user_id = ?`)
    .bind(connection.campaignId, characterPublicId, actor.userId)
    .first<{ id: string; name: string }>();
  if (!character) throw new CampaignServiceError("Only your linked campaign character can publish rolls.", 403);
  return { ...connection, character };
}

/** Find only active, joined sessions that may receive an owner's character-status update. */
export async function activeCharacterStatusTargets(
  db: D1Database,
  ownerUserId: string,
  characterId: string,
): Promise<Array<{ campaignId: string; sessionId: string; participantKey: string }>> {
  const result = await db.prepare(`SELECT c.id AS campaignId, s.id AS sessionId
    FROM campaign_characters cc
    JOIN campaigns c ON c.id = cc.campaign_id AND c.archived_at IS NULL
    JOIN campaign_sessions s ON s.campaign_id = c.id AND s.ended_at IS NULL
    JOIN campaign_session_participants p ON p.session_id = s.id AND p.user_id = ?
    WHERE cc.character_id = ?`).bind(ownerUserId, characterId).all<{ campaignId: string; sessionId: string }>();
  return Promise.all(result.results.map(async target => ({
    ...target,
    participantKey: await participantKey(target.sessionId, ownerUserId),
  })));
}
