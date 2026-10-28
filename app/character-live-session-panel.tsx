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
  if (combatant.kind === "npc") return { name: combatant.name, hp: combatant.hpMax === undefined ? `${combatant.hpCurrent} HP` : `${combatant.hpCurrent} / ${combatant.hpMax} HP`, armorClass: combatant.armorClass ?? null };
  const character = participants.flatMap(participant => participant.character ? [participant.character] : []).find(candidate => candidate.id === combatant.characterId);
  return { name: character?.name || "Unavailable character", hp: character ? `${character.hpCurrent} / ${character.hpMax} HP` : "—", armorClass: character?.armorClass ?? null };
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
  const [rollLimit, setRollLimit] = useState(3);
  const [rollArea, setRollArea] = useState<HTMLDivElement | null>(null);
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
  const combatants = session?.encounter?.combatants ?? [];
  const groupedCombatants = combatants.reduce<Array<{combatant:CampaignEncounterCombatant;count:number}>>((rows, combatant) => {
    const matching = rows.find(row => combatant.kind === "npc" && row.combatant.kind === "npc"
      && combatant.id !== session?.encounter?.currentCombatantId && row.combatant.id !== session?.encounter?.currentCombatantId
      && combatant.name === row.combatant.name && combatant.hpCurrent === row.combatant.hpCurrent
      && combatant.hpMax === row.combatant.hpMax && combatant.armorClass === row.combatant.armorClass
      && combatant.initiative === row.combatant.initiative);
    if (matching) matching.count++;
    else rows.push({combatant,count:1});
    return rows;
  }, []);
  useEffect(() => {
    if (!rollArea) return;
    const update = () => {
      const target = rollArea.parentElement?.getBoundingClientRect().height ?? 0;
      const rows = [...rollArea.querySelectorAll("li")];
      const average = rows.length ? rows.reduce((sum, row) => sum + row.getBoundingClientRect().height + 5, 0) / rows.length : 43;
      setRollLimit(Math.max(3, Math.min(100, Math.floor(Math.max(0, target - 32) / Math.max(average, 1)))));
    };
    const observer = new ResizeObserver(update);
    observer.observe(rollArea);
    if (rollArea.parentElement) observer.observe(rollArea.parentElement);
    update();
    return () => observer.disconnect();
  }, [rollArea, groupedCombatants.length, session?.recentRolls.length]);
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
      <div className="character-live-session-heading"><div><span>LIVE SESSION</span><strong>{selectedCampaign?.name || "Campaign session"}</strong></div>{session && <div className="character-live-heading-status"><span className={live.connection === "connected" ? "campaign-session-connected" : "campaign-session-away"} aria-hidden="true" /> <small>{live.connection === "connected" ? "Connected" : live.connection === "offline" ? "Offline" : "Connecting"} · {session.participants.filter(participant => participant.connected).length} online / {session.participants.length} party</small></div>}<button type="button" className="character-live-session-close" aria-label="Close Live Session" onClick={() => setOpen(false)}>×</button></div>
      {discoveryError && <p className="character-live-session-error" role="status">{discoveryError}</p>}
      {activeCampaigns.length > 1 && <label className="character-live-session-select"><span>Active campaign</span><select value={selectedCampaignId || ""} onChange={event => setSelectedCampaignId(event.target.value || null)}><option value="">Choose a live session</option>{activeCampaigns.map(campaign => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select></label>}
      {!activeCampaigns.length && <p className="character-live-session-empty">No linked campaign has an active session.</p>}
      {selectedCampaign && !session && <p className="character-live-session-empty">This live session has just ended.</p>}
      {session && selectedCampaign && <>
        
        {live.error && <p className="character-live-session-error" role="status">{live.error}</p>}
        {live.state.permissions.canJoin && <button type="button" className="campaign-primary character-live-session-join" disabled={live.busy} onClick={() => void live.action("join").catch(() => {})}>Join Live Session</button>}
        <div className={session.encounter ? "character-live-session-grid has-encounter" : "character-live-session-grid no-encounter"}>
          <section className="character-live-session-section character-live-party-section"><h3>Party</h3><ul className="character-live-party">{session.participants.map(participant => <li key={participant.participantKey}><span className={participant.connected ? "campaign-session-connected character-live-presence-online" : "campaign-session-away character-live-presence-offline"} aria-label={participant.connected ? "Online" : "Offline"} title={participant.connected ? "Online" : "Offline"} /><div>{participant.character ? <a href={`/campaigns/${selectedCampaign.id}/characters/${participant.character.id}`}>{participant.character.name}</a> : <strong>{participant.name}</strong>}{participant.character ? <span>HP {participant.character.hpCurrent}/{participant.character.hpMax} <b>AC {participant.character.armorClass}</b></span> : <small>No linked character</small>}</div></li>)}</ul></section>
          {session.encounter && <section className="character-live-session-section character-live-encounter"><h3>Encounter <span>Round {session.encounter.round}</span></h3><ol>{groupedCombatants.map(({ combatant, count }) => { const summary = encounterCombatant(combatant, session.participants); const current = session.encounter?.currentCombatantId === combatant.id; return <li key={combatant.id} className={current ? "is-current" : undefined}><b aria-label={current ? "Current turn" : undefined}>{current ? "→" : ""}</b><span>{summary.name}{count > 1 ? ` × ${count}` : ""}</span><small>Init {combatant.initiative} · {summary.hp}{summary.armorClass === null ? "" : ` · AC ${summary.armorClass}`}</small></li>; })}</ol></section>}
          <section className="character-live-session-section character-live-rolls"><h3>Recent Rolls</h3><div className="character-live-rolls-body" ref={setRollArea}>{session.recentRolls.length ? <ol aria-live="polite">{session.recentRolls.slice(0, rollLimit).map(roll => <li key={roll.id}><div><strong>{roll.character.name} — {roll.label}</strong><span>{rollSummary(roll)}</span></div><b>{roll.total}</b></li>)}</ol> : <p>No contextual rolls have been shared yet.</p>}</div></section>
        </div>
      </>}
    </section>}
  </div>;
}
