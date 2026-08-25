import { DurableObject } from "cloudflare:workers";
import type { CampaignLiveSessionEvent, CampaignSharedRoll } from "../lib/campaigns/live-session.ts";

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
    ); CREATE INDEX IF NOT EXISTS session_rolls_recent_idx ON session_rolls(session_id, published_at DESC);`);
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
    return roll;
  }

  async recentRolls(sessionId: string): Promise<CampaignSharedRoll[]> {
    const rows = [...this.ctx.storage.sql.exec<{ payload: string }>(
      "SELECT payload FROM session_rolls WHERE session_id = ? AND published_at IS NOT NULL ORDER BY published_at DESC LIMIT 50",
      sessionId,
    )];
    return rows.map(row => JSON.parse(row.payload) as CampaignSharedRoll);
  }

  async endSession(sessionId: string): Promise<void> {
    this.ctx.storage.sql.exec("DELETE FROM session_rolls WHERE session_id = ? AND published_at IS NULL", sessionId);
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

  private broadcastPresence(sessionId: string): void {
    const keys = new Set<string>();
    for (const socket of this.ctx.getWebSockets()) { const data = attachment(socket); if (data?.sessionId === sessionId) keys.add(data.participantKey); }
    this.broadcast({ type: "session.presence", sessionId, connectedParticipantKeys: [...keys] });
  }
}
