"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CampaignLiveSessionEvent, CampaignLiveSessionState, CampaignSharedRoll } from "@/lib/campaigns/live-session";

const initialState: CampaignLiveSessionState = { session: null, permissions: { canStart: false, canJoin: false, canEnd: false, joined: false, adminReadOnly: false } };

function signed(value: number): string { return value >= 0 ? `+${value}` : `${value}`; }

function SharedRoll({ roll }: { roll: CampaignSharedRoll }) {
  const modifiers = roll.modifiers.map(modifier => `${modifier.label} ${signed(modifier.value)}`).join(" · ");
  return <li>
    <div><strong>{roll.character.name} — {roll.label}</strong><span>{roll.dice.count}d{roll.dice.sides} [{roll.dice.results.join(", ")}]{modifiers ? ` · ${modifiers}` : ""}</span></div>
    <b aria-label={`Total ${roll.total}`}>{roll.total}</b>
  </li>;
}

export function CampaignLiveSession({ campaignId }: { campaignId: string }) {
  const [state, setState] = useState<CampaignLiveSessionState>(initialState);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const socket = useRef<WebSocket | null>(null);
  const retry = useRef(0);
  const retryTimer = useRef<number | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/campaigns/${campaignId}/session`, { cache: "no-store" });
    const body = await response.json() as { liveSession?: CampaignLiveSessionState; error?: string };
    if (!response.ok || !body.liveSession) throw new Error(body.error || "The live session is unavailable.");
    setState(body.liveSession);
    return body.liveSession;
  }, [campaignId]);

  useEffect(() => { void load().catch(loadError => setError(loadError instanceof Error ? loadError.message : "The live session is unavailable.")); }, [load]);

  useEffect(() => {
    const sessionId = state.session?.id;
    if (!sessionId || !state.permissions.joined) return;
    let disposed = false;
    const connect = () => {
      if (disposed) return;
      const url = new URL(`/api/campaigns/${campaignId}/session/live`, window.location.origin);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(url);
      socket.current = ws;
      ws.onopen = () => { retry.current = 0; setError(""); ws.send(JSON.stringify({ type: "session.ping" })); void load().catch(() => setError("Recent live rolls could not be refreshed.")); };
      ws.onmessage = event => {
        try {
          const message = JSON.parse(event.data) as CampaignLiveSessionEvent;
          if (message.type === "session.presence" && message.sessionId === sessionId) setState(current => current.session?.id === sessionId ? { ...current, session: { ...current.session, participants: current.session.participants.map(participant => ({ ...participant, connected: message.connectedParticipantKeys.includes(participant.participantKey) })) } } : current);
          if (message.type === "session.participants-changed") void load().catch(() => setError("The participant list could not be refreshed."));
          if (message.type === "session.roll" && message.sessionId === sessionId) setState(current => current.session?.id === sessionId && !current.session.recentRolls.some(roll => roll.id === message.roll.id) ? { ...current, session: { ...current.session, recentRolls: [message.roll, ...current.session.recentRolls].slice(0, 50) } } : current);
          if (message.type === "session.ended") void load().catch(() => setState(initialState));
        } catch { /* Ignore malformed realtime messages. */ }
      };
      ws.onclose = () => {
        if (disposed) return;
        retry.current += 1;
        if (retry.current > 5) { setError("Live updates are paused. Refresh this campaign to try again."); return; }
        retryTimer.current = window.setTimeout(connect, Math.min(1000 * 2 ** retry.current, 10000));
      };
    };
    connect();
    return () => { disposed = true; if (retryTimer.current) window.clearTimeout(retryTimer.current); socket.current?.close(); socket.current = null; };
  }, [campaignId, load, state.permissions.joined, state.session?.id]);

  async function action(action: "start" | "join" | "end") {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/session`, { method: action === "end" ? "DELETE" : "POST", headers: action === "end" ? undefined : { "content-type": "application/json" }, body: action === "end" ? undefined : JSON.stringify({ action }) });
      const body = await response.json() as { liveSession?: CampaignLiveSessionState; error?: string };
      if (!response.ok || !body.liveSession) throw new Error(body.error || "The live session could not be updated.");
      setState(body.liveSession);
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "The live session could not be updated."); }
    finally { setBusy(false); }
  }

  const session = state.session;
  return <section className="campaign-panel campaign-live-session" aria-labelledby="campaign-live-session-title">
    <div className="campaign-section-heading"><div><p className="campaign-kicker">TABLE SESSION</p><h2 id="campaign-live-session-title">Live Session</h2></div>{session ? <span className="campaign-session-status">Session Active</span> : null}</div>
    {error && <p className="campaign-error campaign-session-error" role="status">{error}</p>}
    {!session && <div className="campaign-session-empty"><p>No session is active.</p>{state.permissions.canStart && <button type="button" className="campaign-primary" onClick={() => void action("start")} disabled={busy}>Start Session</button>}</div>}
    {session && <><div className="campaign-session-actions">{state.permissions.canJoin && <button type="button" className="campaign-secondary" onClick={() => void action("join")} disabled={busy}>Join Session</button>}{state.permissions.canEnd && <button type="button" className="campaign-danger" onClick={() => void action("end")} disabled={busy}>End Session</button>}</div><ul className="campaign-session-participants">{session.participants.map(participant => <li key={participant.participantKey}><span className={participant.connected ? "campaign-session-connected" : "campaign-session-away"} aria-label={participant.connected ? "Connected" : "Away"} /><span><strong>{participant.name}</strong>{participant.characterName && <small>{participant.characterName}</small>}</span></li>)}</ul>{state.permissions.joined && <section className="campaign-live-rolls" aria-labelledby="campaign-live-rolls-title"><h3 id="campaign-live-rolls-title">Live Rolls</h3>{session.recentRolls.length ? <ol aria-live="polite">{session.recentRolls.map(roll => <SharedRoll key={roll.id} roll={roll} />)}</ol> : <p>No contextual rolls have been shared yet.</p>}</section>}</>}
  </section>;
}
