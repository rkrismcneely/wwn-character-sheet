"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CampaignLiveSessionEvent, CampaignLiveSessionState } from "@/lib/campaigns/live-session";

export const campaignMapChangedEvent = "twe:campaign-map-changed";
export const campaignSharedRollEvent = "twe:campaign-shared-roll";

export const emptyLiveSessionState: CampaignLiveSessionState = {
  session: null,
  permissions: {
    canStart: false,
    canJoin: false,
    canEnd: false,
    canManageEncounter: false,
    joined: false,
    adminReadOnly: false,
  },
};

export type LiveSessionConnectionState = "idle" | "connecting" | "connected" | "reconnecting" | "offline";

/**
 * The campaign page and character-sheet panel deliberately use the same
 * campaign-scoped source and websocket contract. A sheet can render the
 * session without creating another flavor of live-session transport.
 */
export function useCampaignLiveSession(campaignId: string | null, enabled = true) {
  const [state, setState] = useState<CampaignLiveSessionState>(emptyLiveSessionState);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [connection, setConnection] = useState<LiveSessionConnectionState>("idle");
  const socket = useRef<WebSocket | null>(null);
  const retry = useRef(0);
  const retryTimer = useRef<number | null>(null);
  const activeCampaignId = useRef(campaignId);
  const refreshInFlight = useRef<{ campaignId: string; promise: Promise<CampaignLiveSessionState> } | null>(null);
  activeCampaignId.current = campaignId;

  const load = useCallback(async () => {
    if (!campaignId) {
      setState(emptyLiveSessionState);
      return emptyLiveSessionState;
    }
    if (refreshInFlight.current?.campaignId === campaignId) {
      return refreshInFlight.current.promise;
    }

    const requestedCampaignId = campaignId;
    const promise = (async () => {
      const response = await fetch(`/api/campaigns/${requestedCampaignId}/session`, { cache: "no-store" });
      const body = await response.json() as { liveSession?: CampaignLiveSessionState; error?: string };
      if (!response.ok || !body.liveSession) throw new Error(body.error || "The live session is unavailable.");
      if (activeCampaignId.current === requestedCampaignId) setState(body.liveSession);
      return body.liveSession;
    })();
    refreshInFlight.current = { campaignId: requestedCampaignId, promise };
    try {
      return await promise;
    } finally {
      if (refreshInFlight.current?.promise === promise) refreshInFlight.current = null;
    }
  }, [campaignId]);

  useEffect(() => {
    if (!enabled) return;
    const initialLoad = window.setTimeout(() => {
      void load().catch(loadError => setError(loadError instanceof Error ? loadError.message : "The live session is unavailable."));
    }, 0);
    return () => window.clearTimeout(initialLoad);
  }, [enabled, load]);

  useEffect(() => {
    const sessionId = state.session?.id;
    if (!enabled || !campaignId || !sessionId || !state.permissions.joined) {
      return;
    }
    let disposed = false;
    const connect = () => {
      if (disposed) return;
      setConnection(retry.current ? "reconnecting" : "connecting");
      const url = new URL(`/api/campaigns/${campaignId}/session/live`, window.location.origin);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(url);
      socket.current = ws;
      ws.onopen = () => {
        retry.current = 0;
        setConnection("connected");
        setError("");
        ws.send(JSON.stringify({ type: "session.ping" }));
        void load().catch(() => setError("Recent live activity could not be refreshed."));
      };
      ws.onmessage = event => {
        try {
          const message = JSON.parse(event.data) as CampaignLiveSessionEvent;
          if (message.type === "session.presence" && message.sessionId === sessionId) setState(current => current.session?.id === sessionId ? { ...current, session: { ...current.session, participants: current.session.participants.map(participant => ({ ...participant, connected: message.connectedParticipantKeys.includes(participant.participantKey) })) } } : current);
          if (message.type === "session.participants-changed") void load().catch(() => setError("The participant list could not be refreshed."));
          if (message.type === "session.character-status" && message.sessionId === sessionId) setState(current => current.session?.id === sessionId ? { ...current, session: { ...current.session, participants: current.session.participants.map(participant => participant.participantKey === message.participantKey ? { ...participant, characterName: message.character.name, character: message.character } : participant) } } : current);
          if (message.type === "session.roll" && message.sessionId === sessionId) {
            window.dispatchEvent(new CustomEvent(campaignSharedRollEvent, { detail: { campaignId, sessionId, roll: message.roll } }));
            setState(current => current.session?.id === sessionId && !current.session.recentRolls.some(roll => roll.id === message.roll.id) ? { ...current, session: { ...current.session, recentRolls: [message.roll, ...current.session.recentRolls].slice(0, 50) } } : current);
          }
          if (message.type === "session.encounter" && message.sessionId === sessionId) void load().catch(() => setError("Encounter updates could not be refreshed."));
          if (message.type === "session.map-changed" && message.sessionId === sessionId) window.dispatchEvent(new CustomEvent(campaignMapChangedEvent, { detail: { campaignId, sessionId } }));
          if (message.type === "session.ended") void load().catch(() => setState(emptyLiveSessionState));
        } catch { /* Ignore malformed realtime messages. */ }
      };
      ws.onclose = () => {
        if (disposed) return;
        retry.current += 1;
        if (retry.current > 5) {
          setConnection("offline");
          setError("Live updates are paused. Refresh to try again.");
          return;
        }
        setConnection("reconnecting");
        retryTimer.current = window.setTimeout(connect, Math.min(1000 * 2 ** retry.current, 10000));
      };
    };
    connect();
    return () => {
      disposed = true;
      if (retryTimer.current) window.clearTimeout(retryTimer.current);
      socket.current?.close();
      socket.current = null;
    };
  }, [campaignId, enabled, load, state.permissions.joined, state.session?.id]);

  const action = useCallback(async (actionName: "start" | "join" | "end") => {
    if (!campaignId) throw new Error("Choose a campaign before updating its live session.");
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/session`, {
        method: actionName === "end" ? "DELETE" : "POST",
        headers: actionName === "end" ? undefined : { "content-type": "application/json" },
        body: actionName === "end" ? undefined : JSON.stringify({ action: actionName }),
      });
      const body = await response.json() as { liveSession?: CampaignLiveSessionState; error?: string };
      if (!response.ok || !body.liveSession) throw new Error(body.error || "The live session could not be updated.");
      setState(body.liveSession);
      return body.liveSession;
    } catch (actionError) {
      const message = actionError instanceof Error ? actionError.message : "The live session could not be updated.";
      setError(message);
      throw actionError;
    } finally {
      setBusy(false);
    }
  }, [campaignId]);

  const activeConnection = enabled && campaignId && state.session?.id && state.permissions.joined ? connection : "idle";
  return { state, setState, error, setError, busy, setBusy, connection: activeConnection, load, action };
}
