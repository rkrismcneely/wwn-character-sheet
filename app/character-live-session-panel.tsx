"use client";

import { useCallback, useEffect, useState } from "react";
import type { CampaignEncounterCombatant, CampaignLiveSessionState, CampaignSharedRoll } from "@/lib/campaigns/live-session";
import { useCampaignLiveSession } from "./campaigns/use-live-session";

type CampaignLink = { id: string; name: string };
type ActiveCampaign = CampaignLink;

function signed(value: number): string { return value >= 0 ? `+${value}` : `${value}`; }

function rollSummary(roll: CampaignSharedRoll): string {
  const modifiers = roll.modifiers.map(modifier => `${modifier.label} ${signed(modifier.value)}`).join(" · ");
  return `${roll.dice.count}d${roll.dice.sides} [${roll.dice.results.join(", ")}]${modifiers ? ` · ${modifiers}` : ""}`;
}

function encounterCombatant(
  combatant: CampaignEncounterCombatant,
  participants: NonNullable<CampaignLiveSessionState["session"]>["participants"],
) {
  if (combatant.kind === "npc") return { name: combatant.name, hp: `${combatant.hpCurrent}/${combatant.hpMax}`, armorClass: combatant.armorClass };
  const character = participants.flatMap(participant => participant.character ? [participant.character] : []).find(candidate => candidate.id === combatant.characterId);
  return { name: character?.name || "Unavailable character", hp: character ? `${character.hpCurrent}/${character.hpMax}` : "—", armorClass: character?.armorClass ?? "—" };
}

export function CharacterLiveSessionPanel({
  characterId,
  campaignLinks,
  campaignContextId,
  onJoinedSessionChange,
}: {
  characterId: string;
  campaignLinks: CampaignLink[];
  campaignContextId?: string;
  onJoinedSessionChange?: (campaignId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [activeCampaigns, setActiveCampaigns] = useState<ActiveCampaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [discoveryError, setDiscoveryError] = useState("");

  const discover = useCallback(async () => {
    const response = await fetch(`/api/characters/${characterId}/live-sessions`, { cache: "no-store" });
    const body = await response.json() as { campaigns?: ActiveCampaign[]; error?: string };
    if (!response.ok || !body.campaigns) throw new Error(body.error || "Live sessions could not be checked.");
    const campaigns = body.campaigns;
    setActiveCampaigns(campaigns);
    setDiscoveryError("");
    setSelectedCampaignId(current => {
      if (current && campaigns.some(campaign => campaign.id === current)) return current;
      if (campaignContextId && campaigns.some(campaign => campaign.id === campaignContextId)) return campaignContextId;
      return campaigns.length === 1 ? campaigns[0].id : null;
    });
  }, [campaignContextId, characterId]);

  useEffect(() => {
    if (!campaignLinks.length) return;
    const initialDiscovery = window.setTimeout(() => {
      void discover().catch(error => setDiscoveryError(error instanceof Error ? error.message : "Live sessions could not be checked."));
    }, 0);
    const timer = window.setInterval(() => void discover().catch(() => {}), 30000);
    return () => { window.clearTimeout(initialDiscovery); window.clearInterval(timer); };
  }, [campaignLinks.length, discover]);

  const selectedCampaign = activeCampaigns.find(campaign => campaign.id === selectedCampaignId) || null;
  const live = useCampaignLiveSession(selectedCampaignId, Boolean(selectedCampaignId));
  const session = live.state.session;
  useEffect(() => {
    onJoinedSessionChange?.(session && live.state.permissions.joined ? selectedCampaignId : null);
  }, [live.state.permissions.joined, onJoinedSessionChange, selectedCampaignId, session]);
  const status = session && live.state.permissions.joined
    ? live.connection === "connected" ? "● Live Session" : live.connection === "reconnecting" || live.connection === "connecting" ? "◌ Reconnecting" : "○ Live Offline"
    : session && live.state.permissions.canJoin ? "Join Live Session"
    : "Live Session";

  if (!campaignLinks.length || !activeCampaigns.length && !open) return null;

  return <div className="hero-live-session-control" data-readonly-interactive="true">
    <button type="button" className="live-session-toggle" aria-expanded={open} aria-controls="character-live-session-panel" aria-haspopup="dialog" onClick={() => setOpen(value => !value)}>
      {status}
    </button>
    {open && <section className="character-live-session-panel" id="character-live-session-panel" aria-label="Live Session">
      <div className="character-live-session-heading"><div><span>LIVE SESSION</span><strong>{selectedCampaign?.name || "Campaign session"}</strong></div><button type="button" className="character-live-session-close" aria-label="Close Live Session" onClick={() => setOpen(false)}>×</button></div>
      {discoveryError && <p className="character-live-session-error" role="status">{discoveryError}</p>}
      {activeCampaigns.length > 1 && <label className="character-live-session-select"><span>Active campaign</span><select value={selectedCampaignId || ""} onChange={event => setSelectedCampaignId(event.target.value || null)}><option value="">Choose a live session</option>{activeCampaigns.map(campaign => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select></label>}
      {!activeCampaigns.length && <p className="character-live-session-empty">No linked campaign has an active session.</p>}
      {selectedCampaign && !session && <p className="character-live-session-empty">This live session has just ended.</p>}
      {session && selectedCampaign && <>
        <div className="character-live-session-state"><span className={live.connection === "connected" ? "campaign-session-connected" : "campaign-session-away"} />{live.state.permissions.joined ? live.connection === "connected" ? "Connected" : live.connection === "offline" ? "Live updates paused" : "Reconnecting" : "Session available"}<small>{session.participants.length} participant{session.participants.length === 1 ? "" : "s"}</small></div>
        {live.error && <p className="character-live-session-error" role="status">{live.error}</p>}
        {live.state.permissions.canJoin && <button type="button" className="campaign-primary character-live-session-join" disabled={live.busy} onClick={() => void live.action("join").catch(() => {})}>Join Live Session</button>}
        <section className="character-live-session-section"><h3>Party</h3><ul className="character-live-party">{session.participants.map(participant => <li key={participant.participantKey}><span className={participant.connected ? "campaign-session-connected" : "campaign-session-away"} aria-label={participant.connected ? "Connected" : "Offline"} /><div>{participant.character ? <a href={`/campaigns/${selectedCampaign.id}/characters/${participant.character.id}`}>{participant.character.name}</a> : <strong>{participant.name}</strong>}<small>{participant.character ? `${participant.name} · Level ${participant.character.level} ${participant.character.classLabel}` : "No linked campaign character"}</small>{participant.character && <span>HP {participant.character.hpCurrent}/{participant.character.hpMax} <b>AC {participant.character.armorClass}</b></span>}</div></li>)}</ul></section>
        {session.encounter && <section className="character-live-session-section character-live-encounter"><h3>Encounter <span>Round {session.encounter.round}</span></h3><ol>{session.encounter.combatants.map(combatant => { const summary = encounterCombatant(combatant, session.participants); const current = session.encounter?.currentCombatantId === combatant.id; return <li key={combatant.id} className={current ? "is-current" : undefined}><b aria-label={current ? "Current turn" : undefined}>{current ? "→" : ""}</b><span>{summary.name}</span><small>Init {combatant.initiative} · HP {summary.hp} · AC {summary.armorClass}</small></li>; })}</ol></section>}
        <section className="character-live-session-section character-live-rolls"><h3>Recent Rolls</h3>{session.recentRolls.length ? <ol aria-live="polite">{session.recentRolls.slice(0, 8).map(roll => <li key={roll.id}><div><strong>{roll.character.name} — {roll.label}</strong><span>{rollSummary(roll)}</span></div><b>{roll.total}</b></li>)}</ol> : <p>No contextual rolls have been shared yet.</p>}</section>
        <a className="character-live-session-open" href={`/campaigns/${selectedCampaign.id}`}>Open Full Session</a>
      </>}
    </section>}
  </div>;
}
