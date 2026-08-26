import { DurableObject } from "cloudflare:workers";
import type {
  CampaignEncounter,
  CampaignEncounterCombatant,
  CampaignEncounterNpc,
  CampaignLiveSessionCharacter,
  CampaignLiveSessionEvent,
  CampaignSharedRoll,
} from "../lib/campaigns/live-session.ts";
import { encounterCurrentAfterRemoval, encounterTurnTransition } from "../lib/campaigns/encounter.ts";

interface SocketAttachment { sessionId: string; participantKey: string }

function attachment(socket: WebSocket): SocketAttachment | null {
  const value = socket.deserializeAttachment();
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<SocketAttachment>;
  return typeof candidate.sessionId === "string" && typeof candidate.participantKey === "string" ? candidate as SocketAttachment : null;
}

export class CampaignLiveSession extends DurableObject<CloudflareEnv> {
  constructor(ctx: DurableObjectState, env: CloudflareEnv) {
    super(ctx, env);
    this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS session_rolls (
      roll_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      participant_key TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      published_at INTEGER
    ); CREATE INDEX IF NOT EXISTS session_rolls_recent_idx ON session_rolls(session_id, published_at DESC);
    CREATE TABLE IF NOT EXISTS encounters (
      encounter_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      round_number INTEGER NOT NULL DEFAULT 1,
      current_combatant_id TEXT,
      started_at INTEGER NOT NULL,
      ended_at INTEGER
    );
    CREATE UNIQUE INDEX IF NOT EXISTS encounters_active_idx ON encounters(session_id) WHERE ended_at IS NULL;
    CREATE TABLE IF NOT EXISTS encounter_combatants (
      combatant_id TEXT PRIMARY KEY,
      encounter_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('pc', 'npc')),
      character_id TEXT,
      name TEXT,
      initiative INTEGER NOT NULL DEFAULT 0,
      hp_current INTEGER,
      hp_max INTEGER,
      armor_class INTEGER,
      notes TEXT NOT NULL DEFAULT '',
      added_order INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS encounter_pc_idx ON encounter_combatants(encounter_id, character_id) WHERE kind = 'pc';
    CREATE INDEX IF NOT EXISTS encounter_order_idx ON encounter_combatants(encounter_id, initiative DESC, added_order ASC);`);
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("WebSocket upgrade required.", { status: 426 });
    const sessionId = request.headers.get("X-TWE-Session-Id");
    const participantKey = request.headers.get("X-TWE-Participant-Key");
    if (!sessionId || !participantKey) return new Response("Session authorization is required.", { status: 403 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    server.serializeAttachment({ sessionId, participantKey } satisfies SocketAttachment);
    this.ctx.acceptWebSocket(server);
    this.broadcastPresence(sessionId);
    return new Response(null, { status: 101, webSocket: client });
  }

  async announceParticipantsChanged(sessionId: string): Promise<void> { this.broadcast({ type: "session.participants-changed", sessionId }); }

  async announceCharacterStatus(sessionId: string, participantKey: string, character: CampaignLiveSessionCharacter): Promise<void> {
    this.broadcast({ type: "session.character-status", sessionId, participantKey, character });
  }

  async prepareRoll(sessionId: string, participantKey: string, roll: CampaignSharedRoll): Promise<CampaignSharedRoll> {
    this.ctx.storage.sql.exec(
      "INSERT OR IGNORE INTO session_rolls (roll_id, session_id, participant_key, payload, created_at) VALUES (?, ?, ?, ?, ?)",
      roll.id, sessionId, participantKey, JSON.stringify(roll), Date.parse(roll.timestamp),
    );
    this.ctx.storage.sql.exec(`DELETE FROM session_rolls WHERE session_id = ? AND participant_key = ? AND published_at IS NULL AND roll_id NOT IN (
      SELECT roll_id FROM session_rolls WHERE session_id = ? AND participant_key = ? AND published_at IS NULL ORDER BY created_at DESC LIMIT 20
    )`, sessionId, participantKey, sessionId, participantKey);
    return roll;
  }

  async publishRoll(sessionId: string, participantKey: string, rollId: string): Promise<CampaignSharedRoll | null> {
    const rows = [...this.ctx.storage.sql.exec<{ payload: string }>(
      "SELECT payload FROM session_rolls WHERE roll_id = ? AND session_id = ? AND participant_key = ? AND published_at IS NULL",
      rollId, sessionId, participantKey,
    )];
    if (!rows[0]) return null;
    this.ctx.storage.sql.exec(
      "UPDATE session_rolls SET published_at = ? WHERE roll_id = ? AND session_id = ? AND participant_key = ? AND published_at IS NULL",
      Date.now(), rollId, sessionId, participantKey,
    );
    const roll = JSON.parse(rows[0].payload) as CampaignSharedRoll;
    this.ctx.storage.sql.exec(`DELETE FROM session_rolls WHERE session_id = ? AND published_at IS NOT NULL AND roll_id NOT IN (
      SELECT roll_id FROM session_rolls WHERE session_id = ? AND published_at IS NOT NULL ORDER BY published_at DESC LIMIT 50
    )`, sessionId, sessionId);
    this.broadcast({ type: "session.roll", sessionId, roll });
    if (roll.category === "initiative") {
      const encounter = this.activeEncounter(sessionId);
      if (encounter) {
        this.ctx.storage.sql.exec(
          "UPDATE encounter_combatants SET initiative = ? WHERE encounter_id = ? AND kind = 'pc' AND character_id = ?",
          roll.total, encounter.id, roll.character.id,
        );
        this.broadcastEncounter(sessionId);
      }
    }
    return roll;
  }

  async recentRolls(sessionId: string): Promise<CampaignSharedRoll[]> {
    const rows = [...this.ctx.storage.sql.exec<{ payload: string }>(
      "SELECT payload FROM session_rolls WHERE session_id = ? AND published_at IS NOT NULL ORDER BY published_at DESC LIMIT 50",
      sessionId,
    )];
    return rows.map(row => JSON.parse(row.payload) as CampaignSharedRoll);
  }

  async encounter(sessionId: string): Promise<CampaignEncounter | null> { return this.activeEncounter(sessionId); }

  async startEncounter(sessionId: string): Promise<CampaignEncounter> {
    const existing = this.activeEncounter(sessionId);
    if (existing) return existing;
    const encounterId = `enc_${crypto.randomUUID()}`;
    this.ctx.storage.sql.exec(
      "INSERT INTO encounters (encounter_id, session_id, round_number, started_at) VALUES (?, ?, 1, ?)",
      encounterId, sessionId, Date.now(),
    );
    return this.broadcastEncounter(sessionId) as CampaignEncounter;
  }

  async addPc(sessionId: string, characterId: string): Promise<CampaignEncounter> {
    const encounter = this.requireEncounter(sessionId);
    const existing = [...this.ctx.storage.sql.exec<{ combatant_id: string }>(
      "SELECT combatant_id FROM encounter_combatants WHERE encounter_id = ? AND kind = 'pc' AND character_id = ?",
      encounter.id, characterId,
    )][0];
    if (!existing) {
      const id = `cmb_${crypto.randomUUID()}`;
      this.ctx.storage.sql.exec(
        `INSERT INTO encounter_combatants (combatant_id, encounter_id, kind, character_id, initiative, added_order)
         VALUES (?, ?, 'pc', ?, 0, (SELECT COALESCE(MAX(added_order), 0) + 1 FROM encounter_combatants WHERE encounter_id = ?))`,
        id, encounter.id, characterId, encounter.id,
      );
      this.ensureCurrentCombatant(encounter.id);
    }
    return this.broadcastEncounter(sessionId) as CampaignEncounter;
  }

  async addNpc(sessionId: string, npc: Omit<CampaignEncounterNpc, "id" | "kind">): Promise<CampaignEncounter> {
    const encounter = this.requireEncounter(sessionId);
    const id = `cmb_${crypto.randomUUID()}`;
    this.ctx.storage.sql.exec(
      `INSERT INTO encounter_combatants
       (combatant_id, encounter_id, kind, name, initiative, hp_current, hp_max, armor_class, notes, added_order)
       VALUES (?, ?, 'npc', ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(added_order), 0) + 1 FROM encounter_combatants WHERE encounter_id = ?))`,
      id, encounter.id, npc.name, npc.initiative, npc.hpCurrent, npc.hpMax, npc.armorClass, npc.notes, encounter.id,
    );
    this.ensureCurrentCombatant(encounter.id);
    return this.broadcastEncounter(sessionId) as CampaignEncounter;
  }

  async setInitiative(sessionId: string, combatantId: string, initiative: number): Promise<CampaignEncounter> {
    const encounter = this.requireEncounter(sessionId);
    this.ctx.storage.sql.exec(
      "UPDATE encounter_combatants SET initiative = ? WHERE encounter_id = ? AND combatant_id = ?",
      initiative, encounter.id, combatantId,
    );
    return this.broadcastEncounter(sessionId) as CampaignEncounter;
  }

  async setNpcHp(sessionId: string, combatantId: string, hpCurrent: number): Promise<CampaignEncounter> {
    const encounter = this.requireEncounter(sessionId);
    this.ctx.storage.sql.exec(
      "UPDATE encounter_combatants SET hp_current = MIN(?, hp_max) WHERE encounter_id = ? AND combatant_id = ? AND kind = 'npc'",
      hpCurrent, encounter.id, combatantId,
    );
    return this.broadcastEncounter(sessionId) as CampaignEncounter;
  }

  async removeCombatant(sessionId: string, combatantId: string): Promise<CampaignEncounter> {
    const encounter = this.requireEncounter(sessionId);
    const nextCurrent = encounterCurrentAfterRemoval(encounter, combatantId);
    this.ctx.storage.sql.exec("DELETE FROM encounter_combatants WHERE encounter_id = ? AND combatant_id = ?", encounter.id, combatantId);
    if (encounter.currentCombatantId === combatantId) this.ctx.storage.sql.exec("UPDATE encounters SET current_combatant_id = ? WHERE encounter_id = ?", nextCurrent, encounter.id);
    return this.broadcastEncounter(sessionId) as CampaignEncounter;
  }

  async moveTurn(sessionId: string, direction: "next" | "previous"): Promise<CampaignEncounter> {
    const encounter = this.requireEncounter(sessionId);
    const transition = encounterTurnTransition(encounter, direction);
    this.ctx.storage.sql.exec(
      "UPDATE encounters SET current_combatant_id = ?, round_number = ? WHERE encounter_id = ?",
      transition.currentCombatantId, transition.round, encounter.id,
    );
    return this.broadcastEncounter(sessionId) as CampaignEncounter;
  }

  async endEncounter(sessionId: string): Promise<null> {
    const encounter = this.activeEncounter(sessionId);
    if (encounter) this.ctx.storage.sql.exec("UPDATE encounters SET ended_at = ? WHERE encounter_id = ? AND ended_at IS NULL", Date.now(), encounter.id);
    this.broadcast({ type: "session.encounter", sessionId, encounter: null });
    return null;
  }

  async endSession(sessionId: string): Promise<void> {
    this.ctx.storage.sql.exec("DELETE FROM session_rolls WHERE session_id = ? AND published_at IS NULL", sessionId);
    this.ctx.storage.sql.exec("UPDATE encounters SET ended_at = ? WHERE session_id = ? AND ended_at IS NULL", Date.now(), sessionId);
    this.broadcast({ type: "session.ended", sessionId });
    for (const socket of this.ctx.getWebSockets()) if (attachment(socket)?.sessionId === sessionId) socket.close(1000, "Session ended");
  }

  webSocketMessage(_socket: WebSocket, message: string | ArrayBuffer): void {
    if (typeof message !== "string" || message.length > 256) return;
    try {
      if ((JSON.parse(message) as { type?: unknown }).type === "session.ping") {
        _socket.send(JSON.stringify({ type: "session.pong" }));
        const data = attachment(_socket);
        if (data) this.broadcastPresence(data.sessionId);
      }
    } catch { /* clients cannot submit session state */ }
  }

  webSocketClose(socket: WebSocket): void { const data = attachment(socket); if (data) this.broadcastPresence(data.sessionId); }
  webSocketError(socket: WebSocket): void { const data = attachment(socket); if (data) this.broadcastPresence(data.sessionId); }

  private broadcast(event: CampaignLiveSessionEvent): void {
    const text = JSON.stringify(event);
    for (const socket of this.ctx.getWebSockets()) if (attachment(socket)?.sessionId === event.sessionId) socket.send(text);
  }

  private activeEncounter(sessionId: string): CampaignEncounter | null {
    const row = [...this.ctx.storage.sql.exec<{ encounter_id: string; round_number: number; current_combatant_id: string | null }>(
      "SELECT encounter_id, round_number, current_combatant_id FROM encounters WHERE session_id = ? AND ended_at IS NULL",
      sessionId,
    )][0];
    if (!row) return null;
    const combatants = [...this.ctx.storage.sql.exec<{
      combatant_id: string; kind: "pc" | "npc"; character_id: string | null; name: string | null;
      initiative: number; hp_current: number | null; hp_max: number | null; armor_class: number | null; notes: string;
    }>(`SELECT combatant_id, kind, character_id, name, initiative, hp_current, hp_max, armor_class, notes
      FROM encounter_combatants WHERE encounter_id = ?
      ORDER BY initiative DESC, added_order ASC, combatant_id ASC`, row.encounter_id)];
    return {
      id: row.encounter_id,
      round: row.round_number,
      currentCombatantId: row.current_combatant_id,
      combatants: combatants.map(combatant => combatant.kind === "pc"
        ? { id: combatant.combatant_id, kind: "pc", characterId: combatant.character_id as string, initiative: combatant.initiative }
        : {
          id: combatant.combatant_id, kind: "npc", name: combatant.name as string, initiative: combatant.initiative,
          hpCurrent: combatant.hp_current as number, hpMax: combatant.hp_max as number,
          armorClass: combatant.armor_class as number, notes: combatant.notes,
        }) satisfies CampaignEncounterCombatant[],
    };
  }

  private requireEncounter(sessionId: string): CampaignEncounter {
    const encounter = this.activeEncounter(sessionId);
    if (!encounter) throw new Error("There is no active encounter.");
    return encounter;
  }

  private ensureCurrentCombatant(encounterId: string): void {
    this.ctx.storage.sql.exec(`UPDATE encounters SET current_combatant_id = (
      SELECT combatant_id FROM encounter_combatants WHERE encounter_id = ?
      ORDER BY initiative DESC, added_order ASC, combatant_id ASC LIMIT 1
    ) WHERE encounter_id = ? AND current_combatant_id IS NULL`, encounterId, encounterId);
  }

  private broadcastEncounter(sessionId: string): CampaignEncounter | null {
    const encounter = this.activeEncounter(sessionId);
    this.broadcast({ type: "session.encounter", sessionId, encounter });
    return encounter;
  }

  private broadcastPresence(sessionId: string): void {
    const keys = new Set<string>();
    for (const socket of this.ctx.getWebSockets()) { const data = attachment(socket); if (data?.sessionId === sessionId) keys.add(data.participantKey); }
    this.broadcast({ type: "session.presence", sessionId, connectedParticipantKeys: [...keys] });
  }
}
