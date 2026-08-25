import { DurableObject } from "cloudflare:workers";
import type { CampaignLiveSessionEvent } from "../lib/campaigns/live-session.ts";

interface SocketAttachment { sessionId: string; participantKey: string }

function attachment(socket: WebSocket): SocketAttachment | null {
  const value = socket.deserializeAttachment();
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<SocketAttachment>;
  return typeof candidate.sessionId === "string" && typeof candidate.participantKey === "string" ? candidate as SocketAttachment : null;
}

export class CampaignLiveSession extends DurableObject<CloudflareEnv> {
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

  async endSession(sessionId: string): Promise<void> {
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
