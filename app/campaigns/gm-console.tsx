"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { SignedInHeader } from "../app-header";
import { EncounterTracker, PartyMember } from "./campaign-live-session";
import { useCampaignLiveSession } from "./use-live-session";
import type { CampaignEncounter } from "@/lib/campaigns/live-session";
import type { CampaignNpcAttack, CampaignNpcTemplate } from "@/lib/campaigns/npcs";
import { searchBuiltInBestiaryCreatures, type BuiltInBestiaryCreature } from "@/lib/campaigns/bestiary";
import { RollHistoryPanel, RollResultTray } from "@/app/roll-presentation";
import type { RollResult } from "@/app/rolls";
import { useDiceStylePreference, useVirtualDicePreference } from "@/app/virtual-dice-preference";
import { VirtualDiceOverlay, type VirtualDiceOverlayHandle } from "@/app/virtual-dice-overlay";
import { useDisplayTheme } from "@/app/theme-provider";
import { RulesAssistant } from "@/app/rules-assistant";

type ConsoleTab = "encounter" | "bestiary" | "npcs" | "party";

type NpcDraft = {
  name: string; hpMax: number; armorClass: number;
  physicalSave: number; evasionSave: number; mentalSave: number;
  attacks: CampaignNpcAttack[]; notes: string;
};

const blankNpc = (): NpcDraft => ({ name: "", hpMax: 1, armorClass: 10, physicalSave: 15, evasionSave: 15, mentalSave: 15, attacks: [], notes: "" });
const draftFor = (npc: CampaignNpcTemplate): NpcDraft => ({ name: npc.name, hpMax: npc.hpMax, armorClass: npc.armorClass, physicalSave: npc.physicalSave, evasionSave: npc.evasionSave, mentalSave: npc.mentalSave, attacks: npc.attacks, notes: npc.notes });

function BestiaryStatBlock({ creature }: { creature: BuiltInBestiaryCreature }) {
  return <>
    <p className="gm-bestiary-summary">HP {creature.hpMax} · AC {creature.armorClass} · Saves P {creature.physicalSave} / E {creature.evasionSave} / M {creature.mentalSave}</p>
    <details className="gm-bestiary-details"><summary>Inspect stat block</summary><div className="gm-bestiary-stat-block"><section><h4>Creature stats</h4><p>HD {creature.sourceStats.hitDice} · Shock {creature.sourceStats.shock} · Move {creature.sourceStats.move} · Morale {creature.sourceStats.morale} · Instinct {creature.sourceStats.instinct} · Skill {creature.sourceStats.skill}</p></section><section><h4>Attacks</h4><ul>{creature.attacks.map((attack, index) => <li key={`${creature.id}-${index}`}><strong>{attack.name}</strong> +{attack.attackBonus} · {attack.damage}{attack.description ? ` · ${attack.description}` : ""}</li>)}</ul></section><section className="gm-bestiary-notes"><h4>Notes</h4><p>{creature.notes}</p></section></div></details>
  </>;
}

function BuiltInBestiary({ activeEncounter, busy, onAddToEncounter, onSaveAsNpc }: { activeEncounter: boolean; busy: boolean; onAddToEncounter: (bestiaryId: string) => Promise<void>; onSaveAsNpc: (bestiaryId: string) => Promise<void> }) {
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const creatures = searchBuiltInBestiaryCreatures(query);

  async function addToEncounter(bestiaryId: string) {
    setError("");
    try { await onAddToEncounter(bestiaryId); }
    catch (actionError) { setError(actionError instanceof Error ? actionError.message : "The built-in creature could not be added to the encounter."); }
  }

  async function saveAsNpc(bestiaryId: string) {
    setError("");
    try { await onSaveAsNpc(bestiaryId); }
    catch (actionError) { setError(actionError instanceof Error ? actionError.message : "The campaign NPC template could not be created."); }
  }

  return <section className="gm-console-section" aria-labelledby="gm-bestiary-title">
    <div className="campaign-section-heading"><div><p className="campaign-kicker">CC0 SRD LIBRARY</p><h2 id="gm-bestiary-title">Built-In Bestiary</h2><p className="campaign-empty-copy">Immutable SRD stat lines. Adding or saving one always creates an independent campaign copy.</p></div></div>
    <label className="gm-bestiary-search"><span>Search creatures</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search by creature name" /></label>
    {error && <p className="campaign-error" role="status">{error}</p>}
    {!creatures.length && <p className="campaign-empty-copy">No built-in creatures match “{query}”.</p>}
    <div className="gm-bestiary-grid">{creatures.map(creature => <article key={creature.id} className="gm-npc-card gm-bestiary-card"><div><h3>{creature.name}</h3><p className="gm-bestiary-description">{creature.description}</p><BestiaryStatBlock creature={creature} /></div><div className="gm-npc-actions">{activeEncounter && <button type="button" className="campaign-primary" disabled={busy} onClick={() => void addToEncounter(creature.id)}>Add to Encounter</button>}<button type="button" className="campaign-secondary" disabled={busy} onClick={() => void saveAsNpc(creature.id)}>Save as My NPC</button></div></article>)}</div>
  </section>;
}

function NpcLibrary({ campaignId, activeEncounter, onAddToEncounter }: { campaignId: string; activeEncounter: boolean; onAddToEncounter: (npcId: string) => Promise<void> }) {
  const [npcs, setNpcs] = useState<CampaignNpcTemplate[]>([]);
  const [editing, setEditing] = useState<CampaignNpcTemplate | null>(null);
  const [draft, setDraft] = useState<NpcDraft>(blankNpc);
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  async function load() {
    const response = await fetch(`/api/campaigns/${campaignId}/npcs`, { cache: "no-store" });
    const body = await response.json() as { npcs?: CampaignNpcTemplate[]; error?: string };
    if (!response.ok || !body.npcs) throw new Error(body.error || "NPC templates could not be loaded.");
    setNpcs(body.npcs);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load().catch(loadError => setError(loadError instanceof Error ? loadError.message : "NPC templates could not be loaded.")), 0);
    return () => window.clearTimeout(timer);
  // The campaign route remounts this console when its public ID changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  function openCreate() { setEditing(null); setDraft(blankNpc()); setFormOpen(true); setError(""); }
  function openEdit(npc: CampaignNpcTemplate) { setEditing(npc); setDraft(draftFor(npc)); setFormOpen(true); setError(""); }
  function updateAttack(index: number, key: keyof CampaignNpcAttack, value: string | number) { setDraft(current => ({ ...current, attacks: current.attacks.map((attack, candidate) => candidate === index ? { ...attack, [key]: value } : attack) })); }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const url = editing ? `/api/campaigns/${campaignId}/npcs/${editing.id}` : `/api/campaigns/${campaignId}/npcs`;
      const response = await fetch(url, { method: editing ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(draft) });
      const body = await response.json() as { npc?: CampaignNpcTemplate; error?: string };
      if (!response.ok || !body.npc) throw new Error(body.error || "NPC template could not be saved.");
      const saved = body.npc;
      setNpcs(current => editing ? current.map(npc => npc.id === saved.id ? saved : npc) : [...current, saved].sort((left, right) => left.name.localeCompare(right.name)));
      setFormOpen(false); setEditing(null);
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "NPC template could not be saved."); }
    finally { setBusy(false); }
  }

  async function duplicate(npc: CampaignNpcTemplate) {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/npcs/${npc.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "duplicate" }) });
      const body = await response.json() as { npc?: CampaignNpcTemplate; error?: string };
      if (!response.ok || !body.npc) throw new Error(body.error || "NPC template could not be duplicated.");
      setNpcs(current => [...current, body.npc as CampaignNpcTemplate].sort((left, right) => left.name.localeCompare(right.name)));
    } catch (duplicateError) { setError(duplicateError instanceof Error ? duplicateError.message : "NPC template could not be duplicated."); }
    finally { setBusy(false); }
  }

  async function remove(npcId: string) {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/npcs/${npcId}`, { method: "DELETE" });
      if (!response.ok) { const body = await response.json() as { error?: string }; throw new Error(body.error || "NPC template could not be deleted."); }
      setNpcs(current => current.filter(npc => npc.id !== npcId)); setDeleteId(null);
    } catch (removeError) { setError(removeError instanceof Error ? removeError.message : "NPC template could not be deleted."); }
    finally { setBusy(false); }
  }

  return <section className="gm-console-section" aria-labelledby="gm-npcs-title">
    <div className="campaign-section-heading"><div><p className="campaign-kicker">CAMPAIGN LIBRARY</p><h2 id="gm-npcs-title">NPCs</h2></div><button type="button" className="campaign-primary" onClick={openCreate}>Create NPC</button></div>
    {error && <p className="campaign-error" role="status">{error}</p>}
    {formOpen && <form className="gm-npc-form" onSubmit={save}>
      <div className="gm-npc-form-heading"><h3>{editing ? `Edit ${editing.name}` : "New NPC"}</h3><button type="button" className="campaign-quiet" onClick={() => { setFormOpen(false); setEditing(null); }}>Cancel</button></div>
      <div className="gm-npc-fields"><label><span>Name</span><input required maxLength={80} value={draft.name} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} /></label><label><span>Max HP</span><input required type="number" min={1} max={100000} value={draft.hpMax} onChange={event => setDraft(current => ({ ...current, hpMax: Number(event.target.value) }))} /></label><label><span>AC</span><input required type="number" min={0} max={1000} value={draft.armorClass} onChange={event => setDraft(current => ({ ...current, armorClass: Number(event.target.value) }))} /></label><label><span>Physical Save</span><input required type="number" min={0} max={1000} value={draft.physicalSave} onChange={event => setDraft(current => ({ ...current, physicalSave: Number(event.target.value) }))} /></label><label><span>Evasion Save</span><input required type="number" min={0} max={1000} value={draft.evasionSave} onChange={event => setDraft(current => ({ ...current, evasionSave: Number(event.target.value) }))} /></label><label><span>Mental Save</span><input required type="number" min={0} max={1000} value={draft.mentalSave} onChange={event => setDraft(current => ({ ...current, mentalSave: Number(event.target.value) }))} /></label></div>
      <fieldset className="gm-npc-attacks"><legend>Attacks</legend>{draft.attacks.map((attack, index) => <div key={index}><input aria-label={`Attack ${index + 1} name`} required maxLength={80} placeholder="Axe" value={attack.name} onChange={event => updateAttack(index, "name", event.target.value)} /><input aria-label={`Attack ${index + 1} bonus`} required type="number" min={-1000} max={1000} value={attack.attackBonus} onChange={event => updateAttack(index, "attackBonus", Number(event.target.value))} /><input aria-label={`Attack ${index + 1} damage`} required maxLength={80} placeholder="1d8+2" value={attack.damage} onChange={event => updateAttack(index, "damage", event.target.value)} /><input aria-label={`Attack ${index + 1} description`} maxLength={240} placeholder="Optional note" value={attack.description} onChange={event => updateAttack(index, "description", event.target.value)} /><button type="button" className="campaign-quiet" onClick={() => setDraft(current => ({ ...current, attacks: current.attacks.filter((_, candidate) => candidate !== index) }))}>Remove</button></div>)}<button type="button" className="campaign-secondary" disabled={draft.attacks.length >= 8} onClick={() => setDraft(current => ({ ...current, attacks: [...current.attacks, { name: "", attackBonus: 0, damage: "", description: "" }] }))}>Add Attack</button></fieldset>
      <label className="gm-npc-notes"><span>Notes</span><textarea maxLength={2000} value={draft.notes} onChange={event => setDraft(current => ({ ...current, notes: event.target.value }))} /></label><button type="submit" className="campaign-primary" disabled={busy}>{editing ? "Save NPC" : "Create NPC"}</button>
    </form>}
    {!npcs.length && !formOpen && <p className="campaign-empty-copy">Create reusable enemy and NPC templates for this campaign.</p>}
    <div className="gm-npc-list">{npcs.map(npc => <article key={npc.id} className="gm-npc-card"><div><h3>{npc.name}</h3><p>HP {npc.hpMax} · AC {npc.armorClass} · Saves P {npc.physicalSave} / E {npc.evasionSave} / M {npc.mentalSave}</p>{npc.attacks.length > 0 && <ul>{npc.attacks.map((attack, index) => <li key={`${npc.id}-${index}`}><strong>{attack.name}</strong> +{attack.attackBonus} · {attack.damage}{attack.description ? ` · ${attack.description}` : ""}</li>)}</ul>}{npc.notes && <small>{npc.notes}</small>}</div><div className="gm-npc-actions">{activeEncounter && <button type="button" className="campaign-primary" disabled={busy} onClick={() => void onAddToEncounter(npc.id).catch(() => {})}>Add to Encounter</button>}<button type="button" className="campaign-quiet" onClick={() => openEdit(npc)}>Edit</button><button type="button" className="campaign-quiet" disabled={busy} onClick={() => void duplicate(npc)}>Duplicate</button>{deleteId === npc.id ? <span className="gm-npc-delete-confirm"><button type="button" className="campaign-danger" disabled={busy} onClick={() => void remove(npc.id)}>Confirm Delete</button><button type="button" className="campaign-quiet" onClick={() => setDeleteId(null)}>Cancel</button></span> : <button type="button" className="campaign-danger" onClick={() => setDeleteId(npc.id)}>Delete</button>}</div></article>)}</div>
  </section>;
}

export function GmConsole({ campaignId, campaignName }: { campaignId: string; campaignName: string }) {
  const [tab, setTab] = useState<ConsoleTab>("encounter");
  const { state, setState, error, setError, busy, setBusy, action } = useCampaignLiveSession(campaignId);
  const session = state.session;
  const { enabled: virtualDiceEnabled } = useVirtualDicePreference();
  const { style: diceStyle } = useDiceStylePreference();
  const { theme: displayTheme } = useDisplayTheme();
  const [pendingLatestRoll, setLatestRoll] = useState<RollResult | null>(null);
  const [rollHistoryOpen, setRollHistoryOpen] = useState(false);
  const [npcRollBusy, setNpcRollBusy] = useState(false);
  const [rollError, setRollError] = useState("");
  const [reducedMotion, setReducedMotion] = useState(false);
  const virtualDiceOverlay = useRef<VirtualDiceOverlayHandle>(null);
  const npcRollBusyRef = useRef(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update(); media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  async function rollNpc(combatantId: string, npcAction: Record<string, unknown>) {
    if (!state.permissions.canManageEncounter || npcRollBusyRef.current) return;
    npcRollBusyRef.current = true;
    setNpcRollBusy(true); setRollError("");
    try {
      const preparedResponse = await fetch(`/api/campaigns/${campaignId}/session/rolls`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "npc_prepare", combatantId, npcAction }) });
      const preparedBody = await preparedResponse.json() as { roll?: RollResult; error?: string };
      if (!preparedResponse.ok || !preparedBody.roll) throw new Error(preparedBody.error || "The NPC roll could not be prepared.");
      const roll = preparedBody.roll;
      const shouldAnimate = virtualDiceEnabled && !reducedMotion && Boolean(virtualDiceOverlay.current);
      let animationFailed = false;
      if (shouldAnimate) {
        let watchdog: number | undefined;
        try {
          const animation = virtualDiceOverlay.current?.roll({ dice: roll.dice.results.map(value => ({ sides: roll.dice.sides, value })), style: diceStyle });
          if (!animation) throw new Error("The virtual dice overlay is unavailable.");
          const timeout = new Promise<never>((_, reject) => { watchdog = window.setTimeout(() => reject(new Error("The virtual dice renderer timed out.")), 15000); });
          await Promise.race([animation, timeout]);
        } catch { animationFailed = true; virtualDiceOverlay.current?.cancel(); }
        finally { if (watchdog !== undefined) window.clearTimeout(watchdog); }
      }
      setLatestRoll(roll);
      const publishResponse = await fetch(`/api/campaigns/${campaignId}/session/rolls`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "npc_publish", rollId: roll.id }) });
      if (!publishResponse.ok) throw new Error("The roll completed but could not be shared with the live session.");
      if (animationFailed) setRollError("Animated dice were unavailable; the roll completed normally.");
    } catch (rollActionError) { setRollError(rollActionError instanceof Error ? rollActionError.message : "The NPC roll could not be completed."); }
    finally { npcRollBusyRef.current = false; setNpcRollBusy(false); }
  }

  async function encounterAction(body: Record<string, unknown>) {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/session/encounter`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json() as { encounter?: CampaignEncounter | null; error?: string };
      if (!response.ok || !("encounter" in result)) throw new Error(result.error || "The encounter could not be updated.");
      setState(current => current.session ? { ...current, session: { ...current.session, encounter: result.encounter ?? null } } : current);
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "The encounter could not be updated."); throw actionError; }
    finally { setBusy(false); }
  }

  async function saveBestiaryNpc(bestiaryId: string) {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/npcs`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "create_from_bestiary", bestiaryId }) });
      const result = await response.json() as { npc?: CampaignNpcTemplate; error?: string };
      if (!response.ok || !result.npc) throw new Error(result.error || "The campaign NPC template could not be created.");
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "The campaign NPC template could not be created."); throw actionError; }
    finally { setBusy(false); }
  }

  const canManageEncounter = state.permissions.canManageEncounter;
  const sharedHistory = session?.recentRolls ?? [];
  const latestRoll = [pendingLatestRoll, sharedHistory[0]].filter((roll): roll is RollResult => Boolean(roll)).sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp))[0] || null;
  return <main className="campaign-shell gm-console-shell">
    <SignedInHeader active="campaigns" />
    <section className="campaign-hero gm-console-hero">
      <div><p className="campaign-kicker">GAME MASTER WORKSPACE</p><h1>{campaignName}</h1><p>Live session controls, encounter flow, and campaign NPC templates.</p></div>
      <div className="campaign-hero-actions"><RulesAssistant compact className="gm-console-rules-assistant" id="gm-rules-question" /><Link className="campaign-secondary" href={`/campaigns/${campaignId}`}>Back to Campaign</Link>{session && <><span className="campaign-session-status">Session Active</span><button type="button" className="campaign-danger" disabled={busy || npcRollBusy} onClick={() => void action("end").catch(() => {})}>End Session</button></>}</div>
    </section>
    {session && state.permissions.joined && <section className="gm-console-roll-row" aria-label="Campaign roll tools">
      <div className="gm-console-latest-roll"><RollResultTray result={latestRoll || sharedHistory[0] || null} /></div>
      <div className="gm-console-roll-history-control">
        <button type="button" className="roll-history-toggle" aria-expanded={rollHistoryOpen} aria-controls="gm-roll-history-popout" aria-haspopup="dialog" onClick={() => setRollHistoryOpen(open => !open)}>Roll History{sharedHistory.length ? ` (${sharedHistory.length})` : ""}</button>
        {rollHistoryOpen && <div className="roll-history-popout" id="gm-roll-history-popout"><RollHistoryPanel history={sharedHistory} open={rollHistoryOpen} onClose={() => setRollHistoryOpen(false)} description="Recent shared campaign rolls" /></div>}
      </div>
    </section>}
    {(error || rollError) && <div className="campaign-error" role="status">{error || rollError}</div>}
    <nav className="gm-console-tabs" aria-label="GM Console sections">{(["encounter", "bestiary", "npcs", "party"] as ConsoleTab[]).map(item => <button type="button" key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item === "npcs" ? "My NPCs" : item === "bestiary" ? "Bestiary" : item[0].toUpperCase() + item.slice(1)}</button>)}</nav>
    <section className="campaign-panel gm-console-panel">
      {tab === "encounter" && !session && <section className="gm-console-start"><h2>No live session is active</h2><p>Start a session to run encounters and follow party activity here.</p><button type="button" className="campaign-primary" disabled={busy} onClick={() => void action("start").catch(() => {})}>Start Session</button></section>}
      {session && !state.permissions.joined && state.permissions.canJoin && <button type="button" className="campaign-primary" disabled={busy} onClick={() => void action("join").catch(() => {})}>Join Session</button>}
      {session && state.permissions.joined && tab === "encounter" && <EncounterTracker campaignId={campaignId} session={session} canManage={canManageEncounter} busy={busy || npcRollBusy} onAction={encounterAction} onNpcRoll={rollNpc} />}
      {tab === "bestiary" && <BuiltInBestiary activeEncounter={Boolean(session?.encounter)} busy={busy} onAddToEncounter={bestiaryId => encounterAction({ action: "add_bestiary_npc", bestiaryId })} onSaveAsNpc={saveBestiaryNpc} />}
      {tab === "npcs" && <NpcLibrary campaignId={campaignId} activeEncounter={Boolean(session?.encounter)} onAddToEncounter={npcId => encounterAction({ action: "add_saved_npc", npcId })} />}
      {tab === "party" && (session && state.permissions.joined ? <section className="campaign-live-party gm-console-section"><h2>Party</h2><ul className="campaign-session-participants">{session.participants.map(participant => <PartyMember key={participant.participantKey} campaignId={campaignId} participant={participant} />)}</ul></section> : <p className="campaign-empty-copy">Start a session to view party presence.</p>)}
    </section>
    <VirtualDiceOverlay ref={virtualDiceOverlay} theme={displayTheme} />
  </main>;
}
