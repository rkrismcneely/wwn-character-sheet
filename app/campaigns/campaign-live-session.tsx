"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { CampaignEncounter, CampaignLiveSessionEvent, CampaignLiveSessionState, CampaignSharedRoll } from "@/lib/campaigns/live-session";

const initialState: CampaignLiveSessionState = { session: null, permissions: { canStart: false, canJoin: false, canEnd: false, canManageEncounter: false, joined: false, adminReadOnly: false } };

function signed(value: number): string { return value >= 0 ? `+${value}` : `${value}`; }

function SharedRoll({ roll }: { roll: CampaignSharedRoll }) {
  const modifiers = roll.modifiers.map(modifier => `${modifier.label} ${signed(modifier.value)}`).join(" · ");
  return <li>
    <div><strong>{roll.character.name} — {roll.label}</strong><span>{roll.dice.count}d{roll.dice.sides} [{roll.dice.results.join(", ")}]{modifiers ? ` · ${modifiers}` : ""}</span></div>
    <b aria-label={`Total ${roll.total}`}>{roll.total}</b>
  </li>;
}

function PartyMember({ campaignId, participant }: { campaignId: string; participant: NonNullable<CampaignLiveSessionState["session"]>["participants"][number] }) {
  const character = participant.character;
  return <li>
    <span className={participant.connected ? "campaign-session-connected" : "campaign-session-away"} aria-label={participant.connected ? "Connected" : "Offline"} />
    <div>
      {character ? <a href={`/campaigns/${campaignId}/characters/${character.id}`}><strong>{character.name}</strong></a> : <strong>{participant.name}</strong>}
      <small>{participant.name}{character ? ` · Level ${character.level} ${character.classLabel}` : " · No linked campaign character"}</small>
      {character && <span className="campaign-party-vitals">HP {character.hpCurrent} / {character.hpMax}<b>AC {character.armorClass}</b></span>}
    </div>
  </li>;
}

function EncounterTracker({ campaignId, session, canManage, busy, onAction }: {
  campaignId: string;
  session: NonNullable<CampaignLiveSessionState["session"]>;
  canManage: boolean;
  busy: boolean;
  onAction: (body: Record<string, unknown>) => Promise<void>;
}) {
  const encounter = session.encounter;
  const participantCharacters = session.participants.flatMap(participant => participant.character ? [participant.character] : []);
  const activeCharacterIds = new Set(encounter?.combatants.flatMap(combatant => combatant.kind === "pc" ? [combatant.characterId] : []) || []);

  function addNpc(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    void onAction({
      action: "add_npc",
      name: form.get("name"),
      initiative: Number(form.get("initiative")),
      hpCurrent: Number(form.get("hpCurrent")),
      hpMax: Number(form.get("hpMax")),
      armorClass: Number(form.get("armorClass")),
    }).then(() => formElement.reset());
  }

  if (!encounter) return canManage
    ? <section className="campaign-encounter campaign-encounter-empty"><div><h3>Encounter</h3><p>No encounter is active.</p></div><button type="button" className="campaign-primary" disabled={busy} onClick={() => void onAction({ action: "start" })}>Start Encounter</button></section>
    : null;

  return <section className="campaign-encounter" aria-labelledby="campaign-encounter-title">
    <div className="campaign-encounter-heading"><div><h3 id="campaign-encounter-title">Encounter</h3><span>Round {encounter.round}</span></div>{canManage && <button type="button" className="campaign-danger" disabled={busy} onClick={() => void onAction({ action: "end" })}>End Encounter</button>}</div>
    {canManage && participantCharacters.some(character => !activeCharacterIds.has(character.id)) && <div className="campaign-encounter-add-pcs"><span>Add linked character</span>{participantCharacters.filter(character => !activeCharacterIds.has(character.id)).map(character => <button type="button" className="campaign-quiet" disabled={busy} key={character.id} onClick={() => void onAction({ action: "add_pc", characterId: character.id })}>Add {character.name}</button>)}</div>}
    {canManage && <form className="campaign-encounter-npc" onSubmit={addNpc}><label><span>Temporary NPC</span><input name="name" required maxLength={80} placeholder="Orc Warrior" /></label><label><span>Init</span><input name="initiative" type="number" defaultValue={0} min={-1000} max={1000} required /></label><label><span>Current HP</span><input name="hpCurrent" type="number" defaultValue={1} min={0} max={100000} required /></label><label><span>Max HP</span><input name="hpMax" type="number" defaultValue={1} min={1} max={100000} required /></label><label><span>AC</span><input name="armorClass" type="number" defaultValue={10} min={0} max={1000} required /></label><button type="submit" className="campaign-secondary" disabled={busy}>Add NPC</button></form>}
    {encounter.combatants.length ? <ol className="campaign-encounter-order" aria-live="polite">{encounter.combatants.map(combatant => {
      const character = combatant.kind === "pc" ? participantCharacters.find(candidate => candidate.id === combatant.characterId) : null;
      const name = combatant.kind === "npc" ? combatant.name : character?.name || "Unavailable character";
      const hpCurrent = combatant.kind === "npc" ? combatant.hpCurrent : character?.hpCurrent;
      const hpMax = combatant.kind === "npc" ? combatant.hpMax : character?.hpMax;
      const armorClass = combatant.kind === "npc" ? combatant.armorClass : character?.armorClass;
      const current = encounter.currentCombatantId === combatant.id;
      return <li key={combatant.id} className={current ? "campaign-encounter-current" : undefined}>
        <span className="campaign-turn-marker" aria-label={current ? "Current turn" : undefined}>{current ? "→" : ""}</span>
        <div className="campaign-encounter-name">{character ? <a href={`/campaigns/${campaignId}/characters/${character.id}`}>{name}</a> : <strong>{name}</strong>}<small>{combatant.kind === "pc" ? "Player character" : "Temporary NPC"}</small></div>
        <label><span>Init</span>{canManage ? <input type="number" key={`${combatant.id}-${combatant.initiative}`} defaultValue={combatant.initiative} min={-1000} max={1000} onBlur={event => { const value = Number(event.currentTarget.value); if (value !== combatant.initiative) void onAction({ action: "initiative", combatantId: combatant.id, initiative: value }); }} /> : <b>{combatant.initiative}</b>}</label>
        <label><span>HP</span>{canManage && combatant.kind === "npc" ? <input type="number" key={`${combatant.id}-${combatant.hpCurrent}`} defaultValue={combatant.hpCurrent} min={0} max={combatant.hpMax} onBlur={event => { const value = Number(event.currentTarget.value); if (value !== combatant.hpCurrent) void onAction({ action: "npc_hp", combatantId: combatant.id, hpCurrent: value }); }} /> : <b>{hpCurrent === undefined ? "—" : `${hpCurrent}/${hpMax}`}</b>}</label>
        <span className="campaign-encounter-ac"><small>AC</small><b>{armorClass ?? "—"}</b></span>
        {canManage && <button type="button" className="campaign-encounter-remove" disabled={busy} aria-label={`Remove ${name}`} onClick={() => void onAction({ action: "remove", combatantId: combatant.id })}>×</button>}
      </li>;
    })}</ol> : <p className="campaign-encounter-no-combatants">Add linked characters or a temporary NPC to establish turn order.</p>}
    {canManage && encounter.combatants.length > 0 && <div className="campaign-encounter-turns"><button type="button" className="campaign-secondary" disabled={busy} onClick={() => void onAction({ action: "previous" })}>Previous Turn</button><button type="button" className="campaign-primary" disabled={busy} onClick={() => void onAction({ action: "next" })}>Next Turn</button></div>}
  </section>;
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
          if (message.type === "session.character-status" && message.sessionId === sessionId) setState(current => current.session?.id === sessionId ? { ...current, session: { ...current.session, participants: current.session.participants.map(participant => participant.participantKey === message.participantKey ? { ...participant, characterName: message.character.name, character: message.character } : participant) } } : current);
          if (message.type === "session.roll" && message.sessionId === sessionId) setState(current => current.session?.id === sessionId && !current.session.recentRolls.some(roll => roll.id === message.roll.id) ? { ...current, session: { ...current.session, recentRolls: [message.roll, ...current.session.recentRolls].slice(0, 50) } } : current);
          if (message.type === "session.encounter" && message.sessionId === sessionId) setState(current => current.session?.id === sessionId ? { ...current, session: { ...current.session, encounter: message.encounter } } : current);
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

  async function encounterAction(body: Record<string, unknown>) {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/session/encounter`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json() as { encounter?: CampaignEncounter | null; error?: string };
      if (!response.ok || !("encounter" in result)) throw new Error(result.error || "The encounter could not be updated.");
      setState(current => current.session ? { ...current, session: { ...current.session, encounter: result.encounter ?? null } } : current);
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "The encounter could not be updated."); }
    finally { setBusy(false); }
  }

  const session = state.session;
  return <section className="campaign-panel campaign-live-session" aria-labelledby="campaign-live-session-title">
    <div className="campaign-section-heading"><div><p className="campaign-kicker">TABLE SESSION</p><h2 id="campaign-live-session-title">Live Session</h2></div>{session ? <span className="campaign-session-status">Session Active</span> : null}</div>
    {error && <p className="campaign-error campaign-session-error" role="status">{error}</p>}
    {!session && <div className="campaign-session-empty"><p>No session is active.</p>{state.permissions.canStart && <button type="button" className="campaign-primary" onClick={() => void action("start")} disabled={busy}>Start Session</button>}</div>}
    {session && <><div className="campaign-session-actions">{state.permissions.canJoin && <button type="button" className="campaign-secondary" onClick={() => void action("join")} disabled={busy}>Join Session</button>}{state.permissions.canEnd && <button type="button" className="campaign-danger" onClick={() => void action("end")} disabled={busy}>End Session</button>}</div>{state.permissions.joined && <EncounterTracker campaignId={campaignId} session={session} canManage={state.permissions.canManageEncounter} busy={busy} onAction={encounterAction} />}<section className="campaign-live-party" aria-labelledby="campaign-live-party-title"><h3 id="campaign-live-party-title">Party</h3><ul className="campaign-session-participants">{session.participants.map(participant => <PartyMember key={participant.participantKey} campaignId={campaignId} participant={participant} />)}</ul></section>{state.permissions.joined && <section className="campaign-live-rolls" aria-labelledby="campaign-live-rolls-title"><h3 id="campaign-live-rolls-title">Live Rolls</h3>{session.recentRolls.length ? <ol aria-live="polite">{session.recentRolls.map(roll => <SharedRoll key={roll.id} roll={roll} />)}</ol> : <p>No contextual rolls have been shared yet.</p>}</section>}</>}
  </section>;
}
