"use client";

import type { FormEvent } from "react";
import type { CampaignLiveSessionState, CampaignNpcCombatStats, CampaignSharedRoll } from "@/lib/campaigns/live-session";
import { collapsedNpcCombatSummary } from "@/lib/campaigns/encounter";
import { useCampaignLiveSession } from "./use-live-session";

function signed(value: number): string { return value >= 0 ? `+${value}` : `${value}`; }
function NpcCombatDetails({ stats }: { stats: CampaignNpcCombatStats }) { return <details className="campaign-encounter-npc-details"><summary>Combat details</summary><div className="campaign-encounter-npc-details-body"><section><h4>Saves</h4><p>Physical {signed(stats.saves.physical)} · Evasion {signed(stats.saves.evasion)} · Mental {signed(stats.saves.mental)}</p></section><section><h4>Attacks</h4><ul>{stats.attacks.map(attack => <li key={`${attack.name}-${attack.attackBonus}-${attack.damage}`}><strong>{attack.name}</strong> {signed(attack.attackBonus)} · {attack.damage}{attack.description ? ` — ${attack.description}` : ""}</li>)}</ul></section>{stats.sourceStats && <section><h4>Creature stats</h4><p>HD {stats.sourceStats.hitDice} · Shock {stats.sourceStats.shock} · Move {stats.sourceStats.move} · Morale {stats.sourceStats.morale} · Instinct {stats.sourceStats.instinct} · Skill {stats.sourceStats.skill}</p></section>}{stats.notes && <section><h4>Notes</h4><p>{stats.notes}</p></section>}</div></details>; }
function NpcCombatStrip({ stats }: { stats: CampaignNpcCombatStats | undefined }) {
  const summary = collapsedNpcCombatSummary(stats);
  return <div className={`campaign-encounter-npc-combat${summary ? "" : " campaign-encounter-npc-combat-empty"}`} aria-label={summary ? "NPC combat summary" : undefined} aria-hidden={summary ? undefined : true}>
    {summary && <>
    <span className="campaign-encounter-stat"><small>Saves</small><b>{summary.saves}</b></span>
    {summary.primaryAttack && <span className="campaign-encounter-stat campaign-encounter-attack"><small>Attack</small><b>{summary.primaryAttack}{summary.additionalAttacks ? ` +${summary.additionalAttacks} more` : ""}</b></span>}
    {summary.shock && <span className="campaign-encounter-stat"><small>Shock</small><b>{summary.shock}</b></span>}
    {summary.move && <span className="campaign-encounter-stat campaign-encounter-secondary"><small>Move</small><b>{summary.move}</b></span>}
    {summary.morale !== null && <span className="campaign-encounter-stat campaign-encounter-secondary"><small>Morale</small><b>{summary.morale}</b></span>}
    </>}
  </div>;
}

export function SharedRoll({ roll }: { roll: CampaignSharedRoll }) {
  const modifiers = roll.modifiers.map(modifier => `${modifier.label} ${signed(modifier.value)}`).join(" · ");
  return <li>
    <div><strong>{roll.character.name} — {roll.label}</strong><span>{roll.dice.count}d{roll.dice.sides} [{roll.dice.results.join(", ")}]{modifiers ? ` · ${modifiers}` : ""}</span></div>
    <b aria-label={`Total ${roll.total}`}>{roll.total}</b>
  </li>;
}

export function PartyMember({ campaignId, participant }: { campaignId: string; participant: NonNullable<CampaignLiveSessionState["session"]>["participants"][number] }) {
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

export function EncounterTracker({ campaignId, session, canManage, busy, onAction }: {
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
        {combatant.kind === "npc" && <NpcCombatStrip stats={canManage ? combatant.combatStats : undefined} />}
        <label className="campaign-encounter-initiative"><span>Init</span>{canManage ? <input type="number" key={`${combatant.id}-${combatant.initiative}`} defaultValue={combatant.initiative} min={-1000} max={1000} onBlur={event => { const value = Number(event.currentTarget.value); if (value !== combatant.initiative) void onAction({ action: "initiative", combatantId: combatant.id, initiative: value }); }} /> : <b>{combatant.initiative}</b>}</label>
        <label className="campaign-encounter-hp"><span>HP</span>{canManage && combatant.kind === "npc" ? <span className="campaign-encounter-hp-control"><input type="number" key={`${combatant.id}-${combatant.hpCurrent}`} defaultValue={combatant.hpCurrent} min={0} max={combatant.hpMax ?? 100000} onBlur={event => { const value = Number(event.currentTarget.value); if (value !== combatant.hpCurrent) void onAction({ action: "npc_hp", combatantId: combatant.id, hpCurrent: value }); }} /><b>/ {combatant.hpMax ?? "—"}</b></span> : <b>{hpCurrent === undefined ? "—" : hpMax === undefined ? `${hpCurrent} HP` : `${hpCurrent} / ${hpMax} HP`}</b>}</label>
        <span className="campaign-encounter-ac"><small>AC</small><b>{armorClass ?? "—"}</b></span>
        {canManage && <button type="button" className="campaign-encounter-remove" disabled={busy} aria-label={`Remove ${name}`} onClick={() => void onAction({ action: "remove", combatantId: combatant.id })}>×</button>}
        {canManage && combatant.kind === "npc" && combatant.combatStats && <NpcCombatDetails stats={combatant.combatStats} />}
      </li>;
    })}</ol> : <p className="campaign-encounter-no-combatants">Add linked characters or a temporary NPC to establish turn order.</p>}
    {canManage && encounter.combatants.length > 0 && <div className="campaign-encounter-turns"><button type="button" className="campaign-secondary" disabled={busy} onClick={() => void onAction({ action: "previous" })}>Previous Turn</button><button type="button" className="campaign-primary" disabled={busy} onClick={() => void onAction({ action: "next" })}>Next Turn</button></div>}
  </section>;
}

export function CampaignLiveSession({ campaignId }: { campaignId: string }) {
  const { state, error, busy, action } = useCampaignLiveSession(campaignId);

  const session = state.session;
  return <section className="campaign-panel campaign-live-session" aria-labelledby="campaign-live-session-title">
    <div className="campaign-section-heading"><div><p className="campaign-kicker">TABLE SESSION</p><h2 id="campaign-live-session-title">Live Session</h2></div>{session ? <span className="campaign-live-indicator"><i aria-hidden="true" />Live session</span> : null}</div>
    {error && <p className="campaign-error campaign-session-error" role="status">{error}</p>}
    {!session && <div className="campaign-session-empty"><p>No session is active.</p></div>}
    {session && <><div className="campaign-session-actions">{state.permissions.canJoin && <button type="button" className="campaign-secondary" onClick={() => void action("join").catch(() => {})} disabled={busy}>Join Session</button>}</div><section className="campaign-live-party" aria-labelledby="campaign-live-party-title"><h3 id="campaign-live-party-title">Party</h3><ul className="campaign-session-participants">{session.participants.map(participant => <PartyMember key={participant.participantKey} campaignId={campaignId} participant={participant} />)}</ul></section>{state.permissions.joined && <section className="campaign-live-rolls" aria-labelledby="campaign-live-rolls-title"><h3 id="campaign-live-rolls-title">Live Rolls</h3>{session.recentRolls.length ? <ol aria-live="polite">{session.recentRolls.map(roll => <SharedRoll key={roll.id} roll={roll} />)}</ol> : <p>No contextual rolls have been shared yet.</p>}</section>}</>}
  </section>;
}
