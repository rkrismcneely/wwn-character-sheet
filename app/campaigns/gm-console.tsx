"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { SignedInHeader } from "../app-header";
import { EncounterTracker } from "./campaign-live-session";
import { BestiaryBrowseItem } from "./bestiary-browse";
import { useCampaignLiveSession } from "./use-live-session";
import type { CampaignEncounter } from "@/lib/campaigns/live-session";
import type { CampaignNpcAttack, CampaignNpcMagicReference, CampaignNpcTemplate } from "@/lib/campaigns/npcs";
import { npcAttackFromWeapon, npcWeaponStarters } from "@/lib/campaigns/npc-weapons";
import {
  bestiaryNpcAttackOptions,
  bestiaryNpcMagicOptions,
  builtInBestiaryCreatures,
  filterBestiaryCreatures,
  selectBestiaryCreature,
  type BestiaryNpcMagicOption,
  type BuiltInBestiaryCreature,
} from "@/lib/campaigns/bestiary";
import { calculateWwnPartyScore, calculateWwnThreatEstimate, wwnThreatBands, wwnThreatBandDetails, wwnThreatEstimateCaveat, wwnThreatEstimateMethod, wwnThreatEstimateProvenance, type WwnThreatBand } from "@/lib/campaigns/wwn-threat";
import { RollHistoryPanel, RollResultTray } from "@/app/roll-presentation";
import { resolveRoll, type RollResult } from "@/app/rolls";
import { useDiceStylePreference, useVirtualDicePreference } from "@/app/virtual-dice-preference";
import { VirtualDiceOverlay, type VirtualDiceOverlayHandle } from "@/app/virtual-dice-overlay";
import { useDisplayTheme } from "@/app/theme-provider";
import { RulesAssistant } from "@/app/rules-assistant";
import { CampaignItemLibrary } from "./campaign-item-library";
import { CampaignStoreLibrary } from "./campaign-store-library";
import { SessionRecapManager } from "./session-recap-manager";
import type { CampaignItem, CampaignItemManagementPayload } from "@/lib/campaigns/items";
import { campaignInventoryKindLabel, campaignInventorySnapshot, campaignInventoryValue, inventoryItemDisplayName } from "@/lib/inventory/items";

export type ConsoleTab = "encounter" | "bestiary" | "npcs" | "items" | "stores" | "party" | "recaps";

type NpcDraft = {
  name: string; hpMax: number; armorClass: number;
  physicalSave: number; evasionSave: number; mentalSave: number;
  attacks: CampaignNpcAttack[]; spells: CampaignNpcMagicReference[]; arts: CampaignNpcMagicReference[]; inventory: string[]; friendly: boolean; hitDice: number | null; attacksPerMainAction: number | null; notes: string;
};

const blankNpc = (): NpcDraft => ({ name: "", hpMax: 1, armorClass: 10, physicalSave: 15, evasionSave: 15, mentalSave: 15, attacks: [], spells: [], arts: [], inventory: [], friendly: false, hitDice: null, attacksPerMainAction: null, notes: "" });
const blankAttack = (): CampaignNpcAttack => ({ name: "", attackBonus: 0, damage: "", shock: "", description: "" });
const blankMagic = (): CampaignNpcMagicReference => ({ name: "", summary: "" });
const OTHER_MAGIC_VALUE = "__other__";
const spellOptions = bestiaryNpcMagicOptions("spells");
const artOptions = bestiaryNpcMagicOptions("arts");
const monsterAttackOptions = bestiaryNpcAttackOptions();

function magicOptionFor(reference: CampaignNpcMagicReference, options: readonly BestiaryNpcMagicOption[]): string {
  return options.find(option => option.name === reference.name && option.level === reference.level && option.summary === reference.summary)?.key ?? OTHER_MAGIC_VALUE;
}

function NpcMagicRow({ kind, index, value, options, onChange, onRemove }: { kind: "Spell" | "Art"; index: number; value: CampaignNpcMagicReference; options: readonly BestiaryNpcMagicOption[]; onChange: (value: CampaignNpcMagicReference) => void; onRemove: () => void }) {
  const choice = magicOptionFor(value, options);
  const custom = choice === OTHER_MAGIC_VALUE;
  const selectedOption = options.find(option => option.key === choice);
  return <div className="gm-npc-magic-row">
    <select required aria-label={`${kind} ${index + 1} catalog choice`} value={choice} onChange={event => {
      const next = options.find(option => option.key === event.target.value);
      onChange(next ? { name: next.name, ...(next.level === undefined ? {} : { level: next.level }), summary: next.summary } : event.target.value === OTHER_MAGIC_VALUE ? (selectedOption ? blankMagic() : value) : blankMagic());
    }}>
      <option value="">Choose a {kind.toLowerCase()}…</option>
      {options.map(option => <option key={option.key} value={option.key}>{option.name}{option.level === undefined ? "" : ` · Level ${option.level}`}</option>)}
      <option value={OTHER_MAGIC_VALUE}>Other…</option>
    </select>
    {selectedOption && <small className="gm-npc-magic-summary">{selectedOption.summary}</small>}
    {custom && <div className="gm-npc-magic-custom">
      <input aria-label={`${kind} ${index + 1} custom name`} required maxLength={100} placeholder={`${kind} name`} value={value.name} onChange={event => onChange({ ...value, name: event.target.value })} />
      {kind === "Spell" && <input aria-label={`${kind} ${index + 1} level`} type="number" min={0} max={9} placeholder="Level" value={value.level ?? ""} onChange={event => onChange({ ...value, level: event.target.value === "" ? undefined : Number(event.target.value) })} />}
      <input aria-label={`${kind} ${index + 1} summary`} maxLength={500} placeholder="Effect / rules note" value={value.summary} onChange={event => onChange({ ...value, summary: event.target.value })} />
    </div>}
    <button type="button" className="campaign-quiet" onClick={onRemove}>Remove</button>
  </div>;
}

function NpcMagicAdd({ kind, options, disabled, onAdd }: { kind: "Spell" | "Art"; options: readonly BestiaryNpcMagicOption[]; disabled: boolean; onAdd: (value: CampaignNpcMagicReference) => void }) {
  return <div className="gm-npc-magic-add">
    <label><span>Bestiary {kind}</span><select aria-label={`Add ${kind} from Bestiary`} defaultValue="" disabled={disabled} onChange={event => {
      const option = options.find(candidate => candidate.key === event.currentTarget.value);
      if (option) onAdd({ name: option.name, ...(option.level === undefined ? {} : { level: option.level }), summary: option.summary });
      event.currentTarget.value = "";
    }}><option value="">Copy existing {kind.toLowerCase()}…</option>{options.map(option => <option key={option.key} value={option.key}>{option.name}{option.level === undefined ? "" : ` · Level ${option.level}`}</option>)}</select></label>
    <button type="button" className="campaign-secondary" disabled={disabled} onClick={() => onAdd(blankMagic())}>Add {kind}</button>
  </div>;
}

function NpcInventoryPicker({ items, values, onChange }: { items: readonly CampaignItem[]; values: readonly string[]; onChange: (values: string[]) => void }) {
  const slots = [...values, ""];
  function setItem(index: number, value: string) {
    const next = [...values];
    if (index >= next.length) { if (value) next.push(value); }
    else if (value) next[index] = value;
    else next.splice(index, 1);
    onChange(next);
  }
  return <fieldset className="gm-npc-inventory"><legend>Inventory</legend><p>Campaign items are available to NPCs regardless of player visibility targeting. Saved entries keep their item snapshot if the library changes.</p>{slots.map((value, index) => {
    const snapshot = campaignInventorySnapshot(value);
    const stillAvailable = value && items.some(item => campaignInventoryValue(item) === value);
    return <label key={`${index}-${value}`}><span>{index < values.length ? `Item ${index + 1}` : "Add item"}</span><select aria-label={`NPC inventory item ${index + 1}`} value={value} onChange={event => setItem(index, event.target.value)}><option value="">Choose a campaign item…</option>{snapshot && !stillAvailable && <option value={value}>{inventoryItemDisplayName(value)} · Saved snapshot</option>}{items.map(item => <option key={item.id} value={campaignInventoryValue(item)}>{item.name} · {campaignInventoryKindLabel(item.kind)}</option>)}</select>{snapshot && <small>{campaignInventoryKindLabel(snapshot.kind)}{snapshot.description ? ` · ${snapshot.description}` : ""}</small>}</label>;
  })}</fieldset>;
}
function rollNpcHitPoints(hitDice: number): number {
  const whole = Math.floor(hitDice);
  const fraction = hitDice - whole;
  let hp = 0;
  for (let i = 0; i < whole; i += 1) hp += Math.floor(Math.random() * 8) + 1;
  if (fraction > 0) {
    const sides = Math.max(1, Math.round(8 * fraction));
    hp += Math.floor(Math.random() * sides) + 1;
  }
  return Math.max(1, hp);
}
const draftFor = (npc: CampaignNpcTemplate): NpcDraft => ({ name: npc.name, hpMax: npc.hpMax, armorClass: npc.armorClass, physicalSave: npc.physicalSave, evasionSave: npc.evasionSave, mentalSave: npc.mentalSave, attacks: npc.attacks.map(attack => ({ ...attack })), spells: npc.spells.map(spell => ({ ...spell })), arts: npc.arts.map(art => ({ ...art })), inventory: [...npc.inventory], friendly: npc.friendly, hitDice: npc.hitDice, attacksPerMainAction: npc.attacksPerMainAction, notes: npc.notes });

type CampaignThreatCharacter = { threatLevel: unknown };
type GmPartyCharacter = {
  id: string; name: string; player: string; level: number; classLabel: string;
  hpCurrent: number; hpMax: number; armorClass: number;
  systemStrain: { current: number; max: number };
  saves: { physical: number; evasion: number; mental: number; luck: number };
  spellUsage: { label: string; used: number; max: number } | null;
  effortCommitted: number | null;
};

function wholeNumberOrNull(value: string): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function signed(value: number): string { return value >= 0 ? `+${value}` : `${value}`; }

function GmPartyStatus({ campaignId, character }: { campaignId: string; character: GmPartyCharacter }) {
  const hasResources = character.spellUsage !== null || character.effortCommitted !== null;
  return <article className="gm-party-status-card">
    <div className="gm-party-status-heading"><div><Link href={`/campaigns/${campaignId}/characters/${character.id}`}>{character.name}</Link><p>{character.player || "Player unknown"} · Level {character.level} {character.classLabel}</p></div></div>
    <dl className="gm-party-status-core" aria-label="Combat statistics">
      <div><dt>HP</dt><dd>{character.hpCurrent} / {character.hpMax}</dd></div>
      <div><dt>AC</dt><dd>{character.armorClass}</dd></div>
      <div><dt>System Strain</dt><dd>{character.systemStrain.current} / {character.systemStrain.max}</dd></div>
    </dl>
    <div className="gm-party-status-saves">
      <h3>Saving Throws</h3>
      <dl className="gm-party-status-save-grid">
        <div><dt>Physical</dt><dd>{character.saves.physical}</dd></div>
        <div><dt>Evasion</dt><dd>{character.saves.evasion}</dd></div>
        <div><dt>Mental</dt><dd>{character.saves.mental}</dd></div>
        <div><dt>Luck</dt><dd>{character.saves.luck}</dd></div>
      </dl>
    </div>
    {hasResources && <dl className="gm-party-status-resources">{character.spellUsage && <div><dt>{character.spellUsage.label}</dt><dd>{character.spellUsage.used} / {character.spellUsage.max}</dd></div>}{character.effortCommitted !== null && <div><dt>Effort</dt><dd>{character.effortCommitted} committed</dd></div>}</dl>}
  </article>;
}

function BestiaryStatBlock({ creature }: { creature: BuiltInBestiaryCreature }) {
  const selectedShock = creature.attacks[0]?.shock;
  return <div className="gm-bestiary-stat-block">
    <section>
      <h4>Combat profile</h4>
      <dl className="gm-bestiary-stat-grid">
        <div><dt>HP</dt><dd>{creature.hpMax}</dd></div>
        <div><dt>AC</dt><dd>{creature.armorClass}{creature.armorAnnotation ? <abbr title="Armor notation from the source statblock">{creature.armorAnnotation}</abbr> : null}</dd></div>
        <div><dt>HD</dt><dd>{creature.sourceStats.hitDiceDisplay ?? creature.sourceStats.hitDice}</dd></div>
        <div><dt>Attacks / Action</dt><dd>{creature.sourceStats.attacksPerMainActionDisplay ?? creature.sourceStats.attacksPerMainAction}</dd></div>
        <div><dt>Shock</dt><dd>{creature.sourceStats.shock.startsWith("Weapon") ? selectedShock ?? "None" : creature.sourceStats.shock}</dd></div>
        <div><dt>Move</dt><dd>{creature.sourceStats.move}</dd></div>
        <div><dt>Morale</dt><dd>{creature.sourceStats.morale}</dd></div>
        <div><dt>Instinct</dt><dd>{creature.sourceStats.instinct}</dd></div>
        <div><dt>Skill</dt><dd>+{creature.sourceStats.skill}</dd></div>
      </dl>
    </section>
    <section>
      <h4>Saves</h4>
      <p>P {creature.physicalSave} · E {creature.evasionSave} · M {creature.mentalSave}</p>
    </section>
    <section>
      <h4>Attacks</h4>
      <ul>{creature.attacks.map((attack, index) => <li key={`${creature.id}-${index}`}><strong>{attack.name}</strong> {signed(attack.attackBonus)} · {attack.damage}{attack.shock ? ` · Shock ${attack.shock}` : ""}{attack.description ? ` · ${attack.description}` : ""}</li>)}</ul>
    </section>
    {creature.spellcasting && <section><h4>Spellcasting</h4><p>{creature.spellcasting.tradition} · Mage level {creature.spellcasting.level} · Effort {creature.spellcasting.effort}{creature.spellcasting.spellsPerDay ? ` · ${creature.spellcasting.spellsPerDay} spells/day` : ""}. {creature.spellcasting.sourceLoadout ? "Source-statblock spell list; use the source text for full rules." : "TWE-curated representative loadout; use the imported SRD text for full rules."}</p><p><strong>Spells</strong></p><ul>{creature.spellcasting.spells.map(spell => <li key={spell.name}><strong>{spell.name}</strong>{spell.level ? ` · Level ${spell.level}` : ""} — {spell.summary}</li>)}</ul><p><strong>Arts</strong></p><ul>{creature.spellcasting.arts.map(art => <li key={art.name}><strong>{art.name}</strong> — {art.summary}</li>)}</ul></section>}
    {creature.abilities?.length ? <section><h4>Traits &amp; abilities</h4><ul>{creature.abilities.map(ability => <li key={ability.name}><strong>{ability.name}</strong> — {ability.summary}</li>)}</ul></section> : null}
  </div>;
}

function BestiaryThreatEstimate({ creature, partyLevels, quantity }: { creature: BuiltInBestiaryCreature; partyLevels: readonly unknown[]; quantity: number }) {
  const estimate = calculateWwnThreatEstimate(partyLevels, [{ hitDice: creature.sourceStats.hitDice, attacksPerMainAction: creature.sourceStats.attacksPerMainAction, quantity }]);
  return <section className="gm-bestiary-threat" aria-labelledby="gm-bestiary-threat-title">
    <div className="gm-bestiary-threat-heading"><div><h4 id="gm-bestiary-threat-title">WWN Encounter Estimate</h4><p>{wwnThreatEstimateMethod}</p></div></div>
    {estimate ? <>
      <p className="gm-bestiary-party-summary">Party: {estimate.party.characterCount} {estimate.party.characterCount === 1 ? "character" : "characters"} · Levels {estimate.party.levels.join(", ")}</p>
      <dl className="gm-bestiary-threat-grid">
        <div><dt>Party Score</dt><dd>{estimate.party.score}</dd></div>
        <div><dt>{quantity} × {creature.name}</dt><dd>Enemy Score {estimate.enemy.score}</dd></div>
        <div><dt>Threat Ratio</dt><dd>{estimate.ratio.toFixed(2)}</dd></div>
        <div><dt>Estimated Threat</dt><dd>{wwnThreatBandDetails[estimate.band].label}</dd></div>
      </dl>
      <p className="gm-bestiary-threat-summary">{wwnThreatBandDetails[estimate.band].summary}</p>
    </> : <p className="campaign-empty-copy">Link campaign characters to estimate encounter threat.</p>}
    <details className="gm-bestiary-threat-info"><summary>How this estimate works</summary><p>{wwnThreatEstimateCaveat}</p><p>{wwnThreatEstimateProvenance}</p></details>
  </section>;
}

function BestiaryDetail({ creature, partyLevels, quantity, activeEncounter, busy, onAddToEncounter, onSaveAsNpc, onBack }: { creature: BuiltInBestiaryCreature | null; partyLevels: readonly unknown[]; quantity: number; activeEncounter: boolean; busy: boolean; onAddToEncounter: (bestiaryId: string) => Promise<void>; onSaveAsNpc: (bestiaryId: string) => Promise<void>; onBack: () => void }) {
  if (!creature) return <section className="gm-bestiary-detail" aria-live="polite"><button type="button" className="campaign-secondary gm-bestiary-back" onClick={onBack}>Back to results</button><p className="campaign-empty-copy">Choose a creature from the matching results to inspect its full stat block.</p></section>;
  return <section className="gm-bestiary-detail" aria-live="polite" aria-labelledby="gm-bestiary-detail-title">
    <div className="gm-bestiary-detail-heading"><div><p className="campaign-kicker">SELECTED CREATURE</p><h3 id="gm-bestiary-detail-title">{creature.name}</h3></div><button type="button" className="campaign-secondary gm-bestiary-back" onClick={onBack}>Back to results</button></div>
    <p className="gm-bestiary-description">{creature.description}</p>
    <BestiaryStatBlock creature={creature} />
    <BestiaryThreatEstimate creature={creature} partyLevels={partyLevels} quantity={quantity} />
    <section className="gm-bestiary-source"><h4>Source & license</h4><p>{creature.source.name}{creature.source.creator ? ` · ${creature.source.creator}` : ""} · {creature.source.license}{creature.source.url ? <> · <a href={creature.source.url} target="_blank" rel="noreferrer">Source preview</a></> : null}</p></section>
    <div className="gm-bestiary-actions">{activeEncounter && <button type="button" className="campaign-primary" disabled={busy} onClick={() => void onAddToEncounter(creature.id)}>Add to Encounter</button>}<button type="button" className="campaign-secondary" disabled={busy} onClick={() => void onSaveAsNpc(creature.id)}>Copy to NPC Library</button></div>
  </section>;
}

function BuiltInBestiary({ campaignId, activeEncounter, busy, onAddToEncounter, onSaveAsNpc }: { campaignId: string; activeEncounter: boolean; busy: boolean; onAddToEncounter: (bestiaryId: string) => Promise<void>; onSaveAsNpc: (bestiaryId: string) => Promise<void> }) {
  const [query, setQuery] = useState("");
  const [minHitDice, setMinHitDice] = useState("");
  const [maxHitDice, setMaxHitDice] = useState("");
  const [threatBand, setThreatBand] = useState<WwnThreatBand | "">("");
  const [quantity, setQuantity] = useState(1);
  const [partyLevels, setPartyLevels] = useState<readonly unknown[]>([]);
  const [partyLoaded, setPartyLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<"browse" | "detail">("browse");
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/campaigns/${campaignId}/characters`, { cache: "no-store" })
      .then(async response => {
        const body = await response.json() as { characters?: CampaignThreatCharacter[] };
        if (!response.ok || !Array.isArray(body.characters)) throw new Error("Campaign characters are unavailable.");
        if (!cancelled) setPartyLevels(body.characters.map(character => character.threatLevel));
      })
      .catch(() => { if (!cancelled) setPartyLevels([]); })
      .finally(() => { if (!cancelled) setPartyLoaded(true); });
    return () => { cancelled = true; };
  }, [campaignId]);

  const partyScore = useMemo(() => calculateWwnPartyScore(partyLevels), [partyLevels]);
  const creatures = useMemo(() => builtInBestiaryCreatures, []);
  const filteredCreatures = useMemo(() => filterBestiaryCreatures(
    creatures,
    { query, minHitDice: wholeNumberOrNull(minHitDice), maxHitDice: wholeNumberOrNull(maxHitDice), partyLevels, threatBand: threatBand || null, quantity },
  ), [creatures, maxHitDice, minHitDice, partyLevels, quantity, query, threatBand]);
  const selectedCreature = selectBestiaryCreature(filteredCreatures, selectedId);

  async function runBestiaryAction(action: () => Promise<void>, fallbackMessage: string) {
    setError("");
    try { await action(); }
    catch (actionError) { setError(actionError instanceof Error ? actionError.message : fallbackMessage); }
  }

  function selectCreature(id: string) { setSelectedId(id); setMobileView("detail"); }

  return <section className="gm-console-section" aria-labelledby="gm-bestiary-title">
    <div className="campaign-section-heading"><div><p className="campaign-kicker">BUILT-IN CREATURE LIBRARY</p><h2 id="gm-bestiary-title">Built-In Bestiary</h2><p className="campaign-empty-copy">Reference creatures from the Worlds Without Number SRD and attributed public previews. Adding or saving one creates an independent campaign copy.</p><p className="gm-bestiary-default-hp">Default HP is a table-ready value derived from Hit Dice, not a fixed source HP score.</p></div></div>
    {error && <p className="campaign-error" role="status">{error}</p>}
    <div className="gm-bestiary-browser" data-mobile-view={mobileView}>
      <section className="gm-bestiary-browse" aria-label="Browse built-in creatures">
        <label className="gm-bestiary-search"><span>Search creatures</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search name or description" /></label>
        <div className="gm-bestiary-filters" aria-label="Bestiary filters">
          <label><span>Min HD</span><input aria-label="Minimum Hit Dice" type="number" min={1} max={99} inputMode="numeric" value={minHitDice} onChange={event => setMinHitDice(event.target.value)} placeholder="Any" /></label>
          <label><span>Max HD</span><input aria-label="Maximum Hit Dice" type="number" min={1} max={99} inputMode="numeric" value={maxHitDice} onChange={event => setMaxHitDice(event.target.value)} placeholder="Any" /></label>
          <label><span>Assumed quantity</span><input aria-label="Assumed creature quantity" type="number" min={1} max={99} inputMode="numeric" value={quantity} onChange={event => setQuantity(Math.min(99, Math.max(1, wholeNumberOrNull(event.target.value) ?? 1)))} /></label>
          {partyScore && <label><span>Threat</span><select aria-label="Estimated threat" value={threatBand} onChange={event => setThreatBand(event.target.value as WwnThreatBand | "")}><option value="">Any</option>{wwnThreatBands.map(band => <option key={band} value={band}>{wwnThreatBandDetails[band].label}</option>)}</select></label>}
        </div>
        {partyLoaded && !partyScore && <p className="gm-bestiary-party-unavailable">Link campaign characters to estimate encounter threat.</p>}
        <p className="gm-bestiary-result-count" role="status">{filteredCreatures.length} {filteredCreatures.length === 1 ? "creature" : "creatures"} shown · estimate assumes {quantity} {quantity === 1 ? "creature" : "creatures"}</p>
        {!filteredCreatures.length ? <p className="campaign-empty-copy">No built-in creatures match these filters.</p> : <ul className="gm-bestiary-list">{filteredCreatures.map(creature => <BestiaryBrowseItem key={creature.id} creature={creature} selected={selectedCreature?.id === creature.id} onSelect={() => selectCreature(creature.id)} />)}</ul>}
      </section>
      <BestiaryDetail creature={selectedCreature} partyLevels={partyLevels} quantity={quantity} activeEncounter={activeEncounter} busy={busy} onBack={() => setMobileView("browse")} onAddToEncounter={bestiaryId => runBestiaryAction(() => onAddToEncounter(bestiaryId), "The built-in creature could not be added to the encounter.")} onSaveAsNpc={bestiaryId => runBestiaryAction(() => onSaveAsNpc(bestiaryId), "The campaign NPC template could not be created.")} />
    </div>
  </section>;
}

function NpcLibrary({ campaignId, activeEncounter, onAddToEncounter }: { campaignId: string; activeEncounter: boolean; onAddToEncounter: (npcId: string) => Promise<void> }) {
  const [npcs, setNpcs] = useState<CampaignNpcTemplate[]>([]);
  const [campaignItems, setCampaignItems] = useState<CampaignItem[]>([]);
  const [editing, setEditing] = useState<CampaignNpcTemplate | null>(null);
  const [draft, setDraft] = useState<NpcDraft>(blankNpc);
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  async function load() {
    const [npcResponse, itemResponse] = await Promise.all([
      fetch(`/api/campaigns/${campaignId}/npcs`, { cache: "no-store" }),
      fetch(`/api/campaigns/${campaignId}/items`, { cache: "no-store" }),
    ]);
    const body = await npcResponse.json() as { npcs?: CampaignNpcTemplate[]; error?: string };
    const itemBody = await itemResponse.json() as CampaignItemManagementPayload & { error?: string };
    if (!npcResponse.ok || !body.npcs) throw new Error(body.error || "NPC templates could not be loaded.");
    if (!itemResponse.ok || !Array.isArray(itemBody.items)) throw new Error(itemBody.error || "Campaign items could not be loaded.");
    setNpcs(body.npcs);
    setCampaignItems(itemBody.items);
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
  function updateMagic(kind: "spells" | "arts", index: number, value: CampaignNpcMagicReference) { setDraft(current => ({ ...current, [kind]: current[kind].map((entry, candidate) => candidate === index ? value : entry) })); }
  function moveAttack(index: number, direction: -1 | 1) { setDraft(current => {
    const target = index + direction;
    if (target < 0 || target >= current.attacks.length) return current;
    const attacks = [...current.attacks]; [attacks[index], attacks[target]] = [attacks[target], attacks[index]];
    return { ...current, attacks };
  }); }
  function addAttackFromPicker(value: string) {
    const attack = value.startsWith("monster:")
      ? monsterAttackOptions.find(option => option.key === value)
      : value.startsWith("weapon:")
        ? npcAttackFromWeapon(value.slice("weapon:".length))
        : null;
    if (attack) setDraft(current => current.attacks.length >= 8 ? current : { ...current, attacks: [...current.attacks, { ...attack }] });
  }
  function addMagic(kind: "spells" | "arts", reference: CampaignNpcMagicReference) {
    setDraft(current => current[kind].length >= 24 ? current : { ...current, [kind]: [...current[kind], reference] });
  }

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
      <div className="gm-npc-fields"><label><span>Name</span><input required maxLength={80} value={draft.name} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} /></label><label><span>Max HP</span><span className="gm-npc-hp-roll"><input required type="number" min={1} max={100000} value={draft.hpMax} onChange={event => setDraft(current => ({ ...current, hpMax: Number(event.target.value) }))} /><button type="button" className="campaign-quiet" disabled={!draft.hitDice || draft.hitDice <= 0} onClick={() => setDraft(current => ({ ...current, hpMax: rollNpcHitPoints(current.hitDice ?? 1) }))}>Roll HP</button></span></label><label><span>AC</span><input required type="number" min={0} max={1000} value={draft.armorClass} onChange={event => setDraft(current => ({ ...current, armorClass: Number(event.target.value) }))} /></label><label><span>Physical Save</span><input required type="number" min={0} max={1000} value={draft.physicalSave} onChange={event => setDraft(current => ({ ...current, physicalSave: Number(event.target.value) }))} /></label><label><span>Evasion Save</span><input required type="number" min={0} max={1000} value={draft.evasionSave} onChange={event => setDraft(current => ({ ...current, evasionSave: Number(event.target.value) }))} /></label><label><span>Mental Save</span><input required type="number" min={0} max={1000} value={draft.mentalSave} onChange={event => setDraft(current => ({ ...current, mentalSave: Number(event.target.value) }))} /></label></div>
      <label className="gm-npc-friendly"><input type="checkbox" checked={draft.friendly} onChange={event => setDraft(current => ({ ...current, friendly: event.target.checked }))} /><span>Friendly / allied creature</span></label>
      <fieldset className="gm-npc-threat"><legend>Threat data <small>(optional)</small></legend><p>Set both values to make this custom NPC ready for a future encounter estimate. Multiple weapon options never imply multiple attacks.</p><div><label><span>Hit Dice</span><input aria-label="Hit Dice" type="number" min={1} max={1000} value={draft.hitDice ?? ""} onChange={event => setDraft(current => ({ ...current, hitDice: event.target.value === "" ? null : Number(event.target.value) }))} /></label><label><span>Attacks per Main Action</span><input aria-label="Attacks per Main Action" type="number" min={1} max={100} value={draft.attacksPerMainAction ?? ""} onChange={event => setDraft(current => ({ ...current, attacksPerMainAction: event.target.value === "" ? null : Number(event.target.value) }))} /></label></div></fieldset>
      <fieldset className="gm-npc-attacks"><legend>Attacks</legend><p>Each option is separate. Damage uses the app’s rollable dice syntax, such as 1d8+2.</p>{draft.attacks.map((attack, index) => <div className="gm-npc-attack-row" key={index}><input aria-label={`Attack ${index + 1} name`} required maxLength={80} placeholder="Axe" value={attack.name} onChange={event => updateAttack(index, "name", event.target.value)} /><input aria-label={`Attack ${index + 1} bonus`} required type="number" min={-1000} max={1000} value={attack.attackBonus} onChange={event => updateAttack(index, "attackBonus", Number(event.target.value))} /><input aria-label={`Attack ${index + 1} damage`} required maxLength={80} placeholder="1d8+2" value={attack.damage} onChange={event => updateAttack(index, "damage", event.target.value)} /><input aria-label={`Attack ${index + 1} Shock`} maxLength={80} placeholder="Shock 1/AC 15" value={attack.shock ?? ""} onChange={event => updateAttack(index, "shock", event.target.value)} /><input aria-label={`Attack ${index + 1} description`} maxLength={240} placeholder="Optional note or trait" value={attack.description} onChange={event => updateAttack(index, "description", event.target.value)} /><span className="gm-npc-attack-actions"><button type="button" className="campaign-quiet" disabled={index === 0} aria-label={`Move attack ${index + 1} up`} onClick={() => moveAttack(index, -1)}>↑</button><button type="button" className="campaign-quiet" disabled={index === draft.attacks.length - 1} aria-label={`Move attack ${index + 1} down`} onClick={() => moveAttack(index, 1)}>↓</button><button type="button" className="campaign-quiet" aria-label={`Remove attack ${index + 1}`} onClick={() => setDraft(current => ({ ...current, attacks: current.attacks.filter((_, candidate) => candidate !== index) }))}>Remove</button></span></div>)}<div className="gm-npc-attack-add"><button type="button" className="campaign-secondary" disabled={draft.attacks.length >= 8} onClick={() => setDraft(current => ({ ...current, attacks: [...current.attacks, blankAttack()] }))}>Add custom attack</button><label><span>Weapon or monster attack</span><select aria-label="Add attack from weapon or monster catalog" defaultValue="" disabled={draft.attacks.length >= 8} onChange={event => { addAttackFromPicker(event.currentTarget.value); event.currentTarget.value = ""; }}><option value="">Copy an existing attack…</option><optgroup label="Weapon starters">{npcWeaponStarters.map(weapon => <option key={`weapon:${weapon.name}`} value={`weapon:${weapon.name}`}>{weapon.name} · {weapon.damage}{weapon.shock ? ` · Shock ${weapon.shock}` : ""}</option>)}</optgroup><optgroup label="Monster attacks">{monsterAttackOptions.map(attack => <option key={attack.key} value={attack.key}>{attack.name} · {attack.attackBonus >= 0 ? "+" : ""}{attack.attackBonus} · {attack.damage}</option>)}</optgroup></select></label></div></fieldset>
      <fieldset className="gm-npc-magic"><legend>Spells</legend><p>Choose an imported Bestiary spell or use Other for homebrew.</p>{draft.spells.map((spell, index) => <NpcMagicRow key={index} kind="Spell" index={index} value={spell} options={spellOptions} onChange={value => updateMagic("spells", index, value)} onRemove={() => setDraft(current => ({ ...current, spells: current.spells.filter((_, candidate) => candidate !== index) }))} />)}<NpcMagicAdd kind="Spell" options={spellOptions} disabled={draft.spells.length >= 24} onAdd={value => addMagic("spells", value)} /></fieldset>
      <fieldset className="gm-npc-magic"><legend>Arts</legend><p>Choose an imported Bestiary Art or use Other for homebrew.</p>{draft.arts.map((art, index) => <NpcMagicRow key={index} kind="Art" index={index} value={art} options={artOptions} onChange={value => updateMagic("arts", index, value)} onRemove={() => setDraft(current => ({ ...current, arts: current.arts.filter((_, candidate) => candidate !== index) }))} />)}<NpcMagicAdd kind="Art" options={artOptions} disabled={draft.arts.length >= 24} onAdd={value => addMagic("arts", value)} /></fieldset>
      <NpcInventoryPicker items={campaignItems} values={draft.inventory} onChange={inventory => setDraft(current => ({ ...current, inventory }))} />
      <label className="gm-npc-notes"><span>Notes</span><textarea maxLength={2000} value={draft.notes} onChange={event => setDraft(current => ({ ...current, notes: event.target.value }))} /></label><button type="submit" className="campaign-primary" disabled={busy}>{editing ? "Save NPC" : "Create NPC"}</button>
    </form>}
    {!npcs.length && !formOpen && <p className="campaign-empty-copy">Create reusable enemy and NPC templates for this campaign.</p>}
    <div className="gm-npc-list">{npcs.map(npc => <article key={npc.id} className="gm-npc-card"><div><h3>{npc.name}{npc.friendly ? <span className="gm-npc-friendly-badge">Friendly</span> : null}</h3><p>HP {npc.hpMax} · AC {npc.armorClass} · Saves P {npc.physicalSave} / E {npc.evasionSave} / M {npc.mentalSave}{npc.hitDice !== null && npc.attacksPerMainAction !== null ? ` · HD ${npc.hitDice} · ${npc.attacksPerMainAction} attacks/Main Action` : ""}</p>{npc.attacks.length > 0 && <ul>{npc.attacks.map((attack, index) => <li key={`${npc.id}-${index}`}><strong>{attack.name}</strong> +{attack.attackBonus} · {attack.damage}{attack.shock ? ` · Shock ${attack.shock}` : ""}{attack.description ? ` · ${attack.description}` : ""}</li>)}</ul>}{npc.spells.length > 0 && <p><strong>Spells:</strong> {npc.spells.map(spell => spell.name).join(", ")}</p>}{npc.arts.length > 0 && <p><strong>Arts:</strong> {npc.arts.map(art => art.name).join(", ")}</p>}{npc.inventory.length > 0 && <p><strong>Inventory:</strong> {npc.inventory.map(item => inventoryItemDisplayName(item)).join(", ")}</p>}{npc.notes && <small>{npc.notes}</small>}</div><div className="gm-npc-actions">{activeEncounter && <button type="button" className="campaign-primary" disabled={busy} onClick={() => void onAddToEncounter(npc.id).catch(() => {})}>Add to Encounter</button>}<button type="button" className="campaign-quiet" onClick={() => openEdit(npc)}>Edit</button><button type="button" className="campaign-quiet" disabled={busy} onClick={() => void duplicate(npc)}>Duplicate</button>{deleteId === npc.id ? <span className="gm-npc-delete-confirm"><button type="button" className="campaign-danger" disabled={busy} onClick={() => void remove(npc.id)}>Confirm Delete</button><button type="button" className="campaign-quiet" onClick={() => setDeleteId(null)}>Cancel</button></span> : <button type="button" className="campaign-danger" onClick={() => setDeleteId(npc.id)}>Delete</button>}</div></article>)}</div>
  </section>;
}

export function GmConsole({ campaignId, campaignName, embedded = false, activeTab }: { campaignId: string; campaignName: string; embedded?: boolean; activeTab?: ConsoleTab }) {
  const [localTab, setTab] = useState<ConsoleTab>("encounter");
  const tab = activeTab ?? localTab;
  const { state, setState, error, setError, busy, setBusy, action } = useCampaignLiveSession(campaignId);
  const [partyLevels, setPartyLevels] = useState<readonly unknown[]>([]);
  const [partyLoaded, setPartyLoaded] = useState(false);
  const [partyStatus, setPartyStatus] = useState<GmPartyCharacter[]>([]);
  const [partyStatusLoading, setPartyStatusLoading] = useState(false);
  const [partyStatusError, setPartyStatusError] = useState("");
  const session = state.session;
  const { enabled: virtualDiceEnabled } = useVirtualDicePreference();
  const { style: diceStyle } = useDiceStylePreference();
  const { theme: displayTheme } = useDisplayTheme();
  const [pendingLatestRoll, setLatestRoll] = useState<RollResult | null>(null);
  const [privateGmRolls, setPrivateGmRolls] = useState<RollResult[]>([]);
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

  useEffect(() => {
    if (tab !== "encounter") return;
    let cancelled = false;
    void fetch(`/api/campaigns/${campaignId}/characters`, { cache: "no-store" })
      .then(async response => {
        const body = await response.json() as { characters?: CampaignThreatCharacter[] };
        if (!response.ok || !Array.isArray(body.characters)) throw new Error("Campaign characters are unavailable.");
        if (!cancelled) setPartyLevels(body.characters.map(character => character.threatLevel));
      })
      .catch(() => { if (!cancelled) setPartyLevels([]); })
      .finally(() => { if (!cancelled) setPartyLoaded(true); });
    return () => { cancelled = true; };
  }, [campaignId, tab]);

  useEffect(() => {
    if (tab !== "party") return;
    let cancelled = false;
    void fetch(`/api/campaigns/${campaignId}/gm/party`, { cache: "no-store" })
      .then(async response => {
        const body = await response.json() as { characters?: GmPartyCharacter[]; error?: string };
        if (!response.ok || !Array.isArray(body.characters)) throw new Error(body.error || "Party status is unavailable.");
        if (!cancelled) setPartyStatus(body.characters);
      })
      .catch(loadError => { if (!cancelled) { setPartyStatus([]); setPartyStatusError(loadError instanceof Error ? loadError.message : "Party status is unavailable."); } })
      .finally(() => { if (!cancelled) setPartyStatusLoading(false); });
    return () => { cancelled = true; };
  }, [campaignId, tab]);

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

  async function rollGmDice(count: number, sides: number, label: string) {
    if (!state.permissions.canManageEncounter || npcRollBusyRef.current) return;
    npcRollBusyRef.current = true;
    setNpcRollBusy(true); setRollError("");
    try {
      const roll = await resolveRoll({
        category: "generic",
        character: { id: "gm-private", name: "GM" },
        label,
        dice: { count, sides },
      });
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
      setPrivateGmRolls(current => [roll, ...current].slice(0, 50));
      if (animationFailed) setRollError("Animated dice were unavailable; the roll completed normally.");
    } catch (rollActionError) { setRollError(rollActionError instanceof Error ? rollActionError.message : "The GM roll could not be completed."); }
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
  const gmHistory = [...privateGmRolls, ...sharedHistory].sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp)).slice(0, 100);
  const latestRoll = [pendingLatestRoll, gmHistory[0]].filter((roll): roll is RollResult => Boolean(roll)).sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp))[0] || null;
  return <div className={embedded ? "gm-console-embedded" : "campaign-shell gm-console-shell"}>
    {!embedded && <SignedInHeader active="campaigns" />}
    <section className="campaign-hero gm-console-hero">
      <div><p className="campaign-kicker">GAME MASTER WORKSPACE</p><h1>{campaignName}</h1><p>Live session controls, encounter flow, and campaign NPC templates.</p></div>
      <div className="campaign-hero-actions"><RulesAssistant className="gm-console-rules-assistant" id="gm-rules-question" />{!embedded && <Link className="campaign-secondary" href={`/campaigns/${campaignId}`}>Back to Campaign</Link>}<button type="button" className={session ? "campaign-danger" : "campaign-primary"} disabled={busy || npcRollBusy} onClick={() => void action(session ? "end" : "start").then(() => { if (session) { setPrivateGmRolls([]); setLatestRoll(null); setRollHistoryOpen(false); } }).catch(() => {})}>{session ? "End Session" : "Start Session"}</button></div>
    </section>
    {session && state.permissions.joined && <section className="gm-console-roll-row" aria-label="Campaign roll tools">
      <div className="gm-console-latest-roll"><RollResultTray result={latestRoll} /></div>
      <div className="gm-console-roll-history-control">
        <div className="gm-console-private-rolls" aria-label="Private GM rolls">
          <span className="gm-console-roll-tools-label">Private GM Rolls</span>
          <div className="gm-console-quick-roll-buttons">
            <button type="button" className="gm-console-quick-roll" aria-label="Roll a private GM d20" title="Private GM roll" disabled={npcRollBusy} onClick={() => void rollGmDice(1, 20, "d20")}>d20</button>
            <button type="button" className="gm-console-quick-roll" aria-label="Roll private GM 2d6" title="Private GM roll" disabled={npcRollBusy} onClick={() => void rollGmDice(2, 6, "2d6")}>2d6</button>
          </div>
        </div>
        <button type="button" className="roll-history-toggle gm-console-history-toggle" aria-expanded={rollHistoryOpen} aria-controls="gm-roll-history-popout" aria-haspopup="dialog" onClick={() => setRollHistoryOpen(open => !open)}><span>Roll History</span>{gmHistory.length ? <span className="gm-console-history-count" aria-hidden="true">{gmHistory.length}</span> : null}</button>
        {rollHistoryOpen && <div className="roll-history-popout" id="gm-roll-history-popout"><RollHistoryPanel history={gmHistory} open={rollHistoryOpen} onClose={() => setRollHistoryOpen(false)} description="Shared campaign rolls + private GM rolls visible only to the GM" /></div>}
      </div>
    </section>}
    {(error || rollError) && <div className="campaign-error" role="status">{error || rollError}</div>}
    {!embedded && <nav className="gm-console-tabs" aria-label="Campaign pages"><Link href={`/campaigns/${campaignId}`}>Campaign</Link><span className="active" aria-current="page">GM Console</span></nav>}\n    {!embedded && <nav className="gm-console-tabs" aria-label="GM Console sections">{(["encounter", "bestiary", "npcs", "items", "stores", "party", "recaps"] as ConsoleTab[]).map(item => <button type="button" key={item} className={tab === item ? "active" : ""} onClick={() => { if (item === "party" && tab !== "party") { setPartyStatusLoading(true); setPartyStatusError(""); } setTab(item); }}>{item === "npcs" ? "My NPCs" : item === "bestiary" ? "Bestiary" : item === "recaps" ? "Session Recap" : item[0].toUpperCase() + item.slice(1)}</button>)}</nav>}
    <section className="campaign-panel gm-console-panel">
      {tab === "encounter" && !session && <section className="gm-console-start"><h2>No live session is active</h2><p>Use Start Session above to run encounters and follow party activity here.</p></section>}
      {session && !state.permissions.joined && state.permissions.canJoin && <button type="button" className="campaign-primary" disabled={busy} onClick={() => void action("join").catch(() => {})}>Join Session</button>}
      {session && state.permissions.joined && tab === "encounter" && <EncounterTracker campaignId={campaignId} session={session} partyLevels={partyLevels} partyLoaded={partyLoaded} canManage={canManageEncounter} busy={busy || npcRollBusy} onAction={encounterAction} onNpcRoll={rollNpc} />}
      {tab === "bestiary" && <BuiltInBestiary campaignId={campaignId} activeEncounter={Boolean(session?.encounter)} busy={busy} onAddToEncounter={bestiaryId => encounterAction({ action: "add_bestiary_npc", bestiaryId })} onSaveAsNpc={saveBestiaryNpc} />}
      {tab === "npcs" && <NpcLibrary campaignId={campaignId} activeEncounter={Boolean(session?.encounter)} onAddToEncounter={npcId => encounterAction({ action: "add_saved_npc", npcId })} />}
      {tab === "items" && <CampaignItemLibrary campaignId={campaignId} />}
      {tab === "stores" && <CampaignStoreLibrary campaignId={campaignId} />}
      {tab === "recaps" && <SessionRecapManager campaignId={campaignId} />}
      {tab === "party" && <section className="gm-console-section gm-party-status" aria-labelledby="gm-party-status-title"><div className="campaign-section-heading"><div><p className="campaign-kicker">CURRENT CHARACTER STATUS</p><h2 id="gm-party-status-title">Party</h2></div></div>{partyStatusLoading && <p className="campaign-empty-copy">Loading linked party…</p>}{partyStatusError && <p className="campaign-error" role="status">{partyStatusError}</p>}{!partyStatusLoading && !partyStatusError && !partyStatus.length && <p className="campaign-empty-copy">No characters are linked to this campaign.</p>}{partyStatus.length > 0 && <div className="gm-party-status-grid">{partyStatus.map(character => <GmPartyStatus key={character.id} campaignId={campaignId} character={character} />)}</div>}</section>}
    </section>
    <VirtualDiceOverlay ref={virtualDiceOverlay} theme={displayTheme} />
  </div>;
}
