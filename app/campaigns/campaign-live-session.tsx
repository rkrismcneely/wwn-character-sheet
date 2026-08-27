"use client";

import { useState, type FormEvent } from "react";
import type { CampaignLiveSessionState, CampaignNpcCombatStats, CampaignSharedRoll } from "@/lib/campaigns/live-session";
import type { CampaignNpcAttack } from "@/lib/campaigns/npc-combat";
import { collapsedNpcCombatSummary } from "@/lib/campaigns/encounter";
import { parseDamageExpression } from "@/app/rolls";
import { useCampaignLiveSession } from "./use-live-session";

function signed(value: number): string { return value >= 0 ? `+${value}` : `${value}`; }
type NpcRollAction = { kind: "attack" | "damage"; attackIndex: number } | { kind: "save"; save: "physical" | "evasion" | "mental" };

function canRollDamage(expression: string): boolean {
  try { parseDamageExpression(expression); return true; } catch { return false; }
}

function NpcRollButtons({ attackIndex, attackName, damage, onRoll, busy }: { attackIndex: number; attackName: string; damage: string; onRoll: (action: NpcRollAction) => void; busy: boolean }) {
  return <span className="campaign-npc-roll-controls"><button type="button" className="campaign-npc-roll" disabled={busy} aria-label={`Roll ${attackName} attack`} onClick={() => onRoll({ kind: "attack", attackIndex })}>Attack</button>{canRollDamage(damage) && <button type="button" className="campaign-npc-roll" disabled={busy} aria-label={`Roll ${attackName} damage`} onClick={() => onRoll({ kind: "damage", attackIndex })}>Damage</button>}</span>;
}

const blankAttack = (): CampaignNpcAttack => ({ name: "", attackBonus: 0, damage: "", shock: "", description: "" });

function NpcCombatEditor({ stats, busy, onUpdate }: { stats: CampaignNpcCombatStats; busy: boolean; onUpdate: (combatStats: { attacks: CampaignNpcAttack[]; threatStats: { hitDice: number; attacksPerMainAction: number } | null }) => Promise<void> }) {
  const [attacks, setAttacks] = useState(() => stats.attacks.map(attack => ({ ...attack })));
  const [hitDice, setHitDice] = useState(stats.threatStats?.hitDice?.toString() ?? "");
  const [attacksPerMainAction, setAttacksPerMainAction] = useState(stats.threatStats?.attacksPerMainAction?.toString() ?? "");
  const [error, setError] = useState("");
  function updateAttack(index: number, key: keyof CampaignNpcAttack, value: string | number) { setAttacks(current => current.map((attack, candidate) => candidate === index ? { ...attack, [key]: value } : attack)); }
  function moveAttack(index: number, direction: -1 | 1) { setAttacks(current => {
    const target = index + direction;
    if (target < 0 || target >= current.length) return current;
    const next = [...current]; [next[index], next[target]] = [next[target], next[index]];
    return next;
  }); }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    try {
      await onUpdate({ attacks, threatStats: hitDice || attacksPerMainAction ? { hitDice: Number(hitDice), attacksPerMainAction: Number(attacksPerMainAction) } : null });
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Combat data could not be saved."); }
  }
  return <details className="campaign-encounter-npc-editor"><summary>Edit encounter combat</summary><form onSubmit={save}><p>Changes apply only to this encounter instance; the saved NPC and built-in definition remain unchanged.</p>{error && <p className="campaign-error" role="status">{error}</p>}<div className="campaign-npc-editor-threat"><label><span>Hit Dice</span><input aria-label="Encounter Hit Dice" type="number" min={1} max={1000} value={hitDice} onChange={event => setHitDice(event.target.value)} /></label><label><span>Attacks per Main Action</span><input aria-label="Encounter attacks per Main Action" type="number" min={1} max={100} value={attacksPerMainAction} onChange={event => setAttacksPerMainAction(event.target.value)} /></label></div><div className="campaign-npc-editor-attacks">{attacks.map((attack, index) => <div key={index}><input aria-label={`Encounter attack ${index + 1} name`} required maxLength={80} value={attack.name} onChange={event => updateAttack(index, "name", event.target.value)} /><input aria-label={`Encounter attack ${index + 1} bonus`} required type="number" min={-1000} max={1000} value={attack.attackBonus} onChange={event => updateAttack(index, "attackBonus", Number(event.target.value))} /><input aria-label={`Encounter attack ${index + 1} damage`} required maxLength={80} value={attack.damage} onChange={event => updateAttack(index, "damage", event.target.value)} /><input aria-label={`Encounter attack ${index + 1} Shock`} maxLength={80} placeholder="Shock" value={attack.shock ?? ""} onChange={event => updateAttack(index, "shock", event.target.value)} /><input aria-label={`Encounter attack ${index + 1} description`} maxLength={240} placeholder="Optional note or trait" value={attack.description} onChange={event => updateAttack(index, "description", event.target.value)} /><span><button type="button" className="campaign-quiet" disabled={index === 0} aria-label={`Move encounter attack ${index + 1} up`} onClick={() => moveAttack(index, -1)}>↑</button><button type="button" className="campaign-quiet" disabled={index === attacks.length - 1} aria-label={`Move encounter attack ${index + 1} down`} onClick={() => moveAttack(index, 1)}>↓</button><button type="button" className="campaign-quiet" aria-label={`Remove encounter attack ${index + 1}`} onClick={() => setAttacks(current => current.filter((_, candidate) => candidate !== index))}>Remove</button></span></div>)}</div><div className="campaign-npc-editor-actions"><button type="button" className="campaign-secondary" disabled={busy || attacks.length >= 8} onClick={() => setAttacks(current => [...current, blankAttack()])}>Add Attack</button><button type="submit" className="campaign-primary" disabled={busy}>Save encounter combat</button></div></form></details>;
}

function NpcCombatDetails({ stats, onRoll, busy, onUpdate }: { stats: CampaignNpcCombatStats; onRoll?: (action: NpcRollAction) => void; busy: boolean; onUpdate?: (combatStats: { attacks: CampaignNpcAttack[]; threatStats: { hitDice: number; attacksPerMainAction: number } | null }) => Promise<void> }) { return <details className="campaign-encounter-npc-details"><summary>Combat details</summary><div className="campaign-encounter-npc-details-body"><section><h4>Saves</h4><p>Physical {signed(stats.saves.physical)} · Evasion {signed(stats.saves.evasion)} · Mental {signed(stats.saves.mental)}</p>{onRoll && <div className="campaign-npc-save-rolls"><button type="button" className="campaign-npc-roll" disabled={busy} onClick={() => onRoll({ kind: "save", save: "physical" })}>Physical Save</button><button type="button" className="campaign-npc-roll" disabled={busy} onClick={() => onRoll({ kind: "save", save: "evasion" })}>Evasion Save</button><button type="button" className="campaign-npc-roll" disabled={busy} onClick={() => onRoll({ kind: "save", save: "mental" })}>Mental Save</button></div>}</section><section><h4>Attacks</h4><ul>{stats.attacks.map((attack, index) => <li key={`${attack.name}-${attack.attackBonus}-${attack.damage}`}><span><strong>{attack.name}</strong> {signed(attack.attackBonus)} · {attack.damage}{attack.shock ? ` · Shock ${attack.shock}` : ""}{attack.description ? ` — ${attack.description}` : ""}</span>{onRoll && <NpcRollButtons attackIndex={index} attackName={attack.name} damage={attack.damage} onRoll={onRoll} busy={busy} />}</li>)}</ul></section>{stats.threatStats && <section><h4>Custom threat data</h4><p>HD {stats.threatStats.hitDice} · {stats.threatStats.attacksPerMainAction} attacks per Main Action</p></section>}{stats.sourceStats && <section><h4>Creature stats</h4><p>HD {stats.sourceStats.hitDice} · Shock {stats.sourceStats.shock} · Move {stats.sourceStats.move} · Morale {stats.sourceStats.morale} · Instinct {stats.sourceStats.instinct} · Skill {stats.sourceStats.skill}</p></section>}{stats.notes && <section><h4>Notes</h4><p>{stats.notes}</p></section>}{onUpdate && <NpcCombatEditor key={JSON.stringify({ attacks: stats.attacks, threatStats: stats.threatStats })} stats={stats} busy={busy} onUpdate={onUpdate} />}</div></details>; }
function NpcCombatStrip({ stats, onRoll, busy }: { stats: CampaignNpcCombatStats | undefined; onRoll?: (action: NpcRollAction) => void; busy: boolean }) {
  const summary = collapsedNpcCombatSummary(stats);
  const primaryAttack = stats?.attacks[0];
  return <div className={`campaign-encounter-npc-combat${summary ? "" : " campaign-encounter-npc-combat-empty"}`} aria-label={summary ? "NPC combat summary" : undefined} aria-hidden={summary ? undefined : true}>
    {summary && <>
    <span className="campaign-encounter-stat"><small>Saves</small><b>{summary.saves}</b></span>
    {summary.primaryAttack && <span className="campaign-encounter-stat campaign-encounter-attack"><small>Attack</small><b>{summary.primaryAttack}{summary.additionalAttacks ? ` +${summary.additionalAttacks} more` : ""}</b>{onRoll && primaryAttack && <NpcRollButtons attackIndex={0} attackName={primaryAttack.name} damage={primaryAttack.damage} onRoll={onRoll} busy={busy} />}</span>}
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

export function EncounterTracker({ campaignId, session, canManage, busy, onAction, onNpcRoll }: {
  campaignId: string;
  session: NonNullable<CampaignLiveSessionState["session"]>;
  canManage: boolean;
  busy: boolean;
  onAction: (body: Record<string, unknown>) => Promise<void>;
  onNpcRoll?: (combatantId: string, action: NpcRollAction) => Promise<void>;
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
        {combatant.kind === "npc" && <NpcCombatStrip stats={canManage ? combatant.combatStats : undefined} onRoll={canManage && onNpcRoll ? action => void onNpcRoll(combatant.id, action) : undefined} busy={busy} />}
        <label className="campaign-encounter-initiative"><span>Init</span>{canManage ? <input type="number" key={`${combatant.id}-${combatant.initiative}`} defaultValue={combatant.initiative} min={-1000} max={1000} onBlur={event => { const value = Number(event.currentTarget.value); if (value !== combatant.initiative) void onAction({ action: "initiative", combatantId: combatant.id, initiative: value }); }} /> : <b>{combatant.initiative}</b>}</label>
        <label className="campaign-encounter-hp"><span>HP</span>{canManage && combatant.kind === "npc" ? <span className="campaign-encounter-hp-control"><input type="number" key={`${combatant.id}-${combatant.hpCurrent}`} defaultValue={combatant.hpCurrent} min={0} max={combatant.hpMax ?? 100000} onBlur={event => { const value = Number(event.currentTarget.value); if (value !== combatant.hpCurrent) void onAction({ action: "npc_hp", combatantId: combatant.id, hpCurrent: value }); }} /><b>/ {combatant.hpMax ?? "—"}</b></span> : <b>{hpCurrent === undefined ? "—" : hpMax === undefined ? `${hpCurrent} HP` : `${hpCurrent} / ${hpMax} HP`}</b>}</label>
        <span className="campaign-encounter-ac"><small>AC</small><b>{armorClass ?? "—"}</b></span>
        {canManage && <button type="button" className="campaign-encounter-remove" disabled={busy} aria-label={`Remove ${name}`} onClick={() => void onAction({ action: "remove", combatantId: combatant.id })}>×</button>}
        {canManage && combatant.kind === "npc" && combatant.combatStats && <NpcCombatDetails stats={combatant.combatStats} onRoll={onNpcRoll ? action => void onNpcRoll(combatant.id, action) : undefined} busy={busy} onUpdate={combatStats => onAction({ action: "npc_combat", combatantId: combatant.id, combatStats })} />}
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
