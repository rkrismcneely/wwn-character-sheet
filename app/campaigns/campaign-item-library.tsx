"use client";

import { useEffect, useState, type FormEvent } from "react";
import type {
  CampaignItem,
  CampaignItemManagementPayload,
  CampaignItemTarget,
  CampaignItemVisibility,
} from "@/lib/campaigns/items";
import type { CampaignItemProperties, InventoryItemKind } from "@/lib/inventory/items";

type ItemDraft = {
  name: string;
  kind: InventoryItemKind;
  description: string;
  properties: CampaignItemProperties;
  visibility: CampaignItemVisibility;
  characterIds: string[];
};

const blankItem = (): ItemDraft => ({
  name: "",
  kind: "mundane",
  description: "",
  properties: { magical: { bonuses: "", abilities: "", charges: null, uses: "", rulesText: "" } },
  visibility: "all",
  characterIds: [],
});

function draftFor(item: CampaignItem): ItemDraft {
  return {
    name: item.name,
    kind: item.kind,
    description: item.description,
    properties: item.properties ?? {},
    visibility: item.visibility,
    characterIds: [...item.characterIds],
  };
}

function blankProperties(kind: InventoryItemKind): CampaignItemProperties {
  if (kind === "weapon") return { weapon: { damage: "1d6", shock: "None", range: "-", attribute: "Str", skill: "Stab", encumbrance: 1, traits: "" } };
  if (kind === "armor") return { armor: { armorClass: 10, encumbrance: 0, shield: "none", restrictions: "", properties: "" } };
  if (kind === "magical") return { magical: { bonuses: "", abilities: "", charges: null, uses: "", rulesText: "" } };
  return {};
}

function kindLabel(kind: InventoryItemKind): string {
  return kind === "armor" ? "Armour" : kind === "weapon" ? "Weapon" : kind === "magical" ? "Magical Item" : "Mundane Item";
}

function propertySummary(item: CampaignItem): string {
  if (item.kind === "weapon" && item.properties?.weapon) {
    const weapon = item.properties.weapon;
    return `${weapon.damage} · Shock ${weapon.shock} · ${weapon.skill}/${weapon.attribute} · Range ${weapon.range} · Enc ${weapon.encumbrance}${weapon.traits ? ` · ${weapon.traits}` : ""}`;
  }
  if (item.kind === "armor" && item.properties?.armor) {
    const armor = item.properties.armor;
    return `AC ${armor.armorClass} · Enc ${armor.encumbrance}${armor.shield !== "none" ? ` · ${armor.shield} shield` : ""}`;
  }
  if (item.kind === "magical" && item.properties?.magical) {
    const magic = item.properties.magical;
    return [magic.bonuses, magic.charges === null ? "" : `${magic.charges} charges`, magic.uses].filter(Boolean).join(" · ");
  }
  return "";
}

function visibilitySummary(item: CampaignItem, characters: readonly CampaignItemTarget[]): string {
  if (item.visibility === "all") return "All linked players";
  const names = item.characterIds
    .map(id => characters.find(character => character.id === id)?.name)
    .filter((name): name is string => Boolean(name));
  return names.length ? names.join(", ") : "Selected characters";
}

export function CampaignItemLibrary({ campaignId }: { campaignId: string }) {
  const [items, setItems] = useState<CampaignItem[]>([]);
  const [characters, setCharacters] = useState<CampaignItemTarget[]>([]);
  const [draft, setDraft] = useState<ItemDraft>(blankItem);
  const [editing, setEditing] = useState<CampaignItem | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/campaigns/${campaignId}/items`, { cache: "no-store" })
      .then(async response => {
        const body = await response.json() as CampaignItemManagementPayload & { error?: string };
        if (!response.ok || !Array.isArray(body.items) || !Array.isArray(body.characters)) {
          throw new Error(body.error || "Campaign items are unavailable.");
        }
        if (!cancelled) {
          setItems(body.items);
          setCharacters(body.characters);
        }
      })
      .catch(loadError => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Campaign items are unavailable.");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [campaignId]);

  function openCreate() {
    setEditing(null);
    setDraft(blankItem());
    setDeleteId(null);
    setFormOpen(true);
    setError("");
  }

  function openEdit(item: CampaignItem) {
    setEditing(item);
    setDraft(draftFor(item));
    setDeleteId(null);
    setFormOpen(true);
    setError("");
  }

  function toggleCharacter(characterId: string) {
    setDraft(current => ({
      ...current,
      characterIds: current.characterIds.includes(characterId)
        ? current.characterIds.filter(id => id !== characterId)
        : [...current.characterIds, characterId],
    }));
  }

  function changeKind(nextKind: InventoryItemKind) {
    setDraft(current => ({ ...current, kind: nextKind, properties: blankProperties(nextKind) }));
  }

  function setProperty(key: string, value: string | number | null) {
    setDraft(current => ({
      ...current,
      properties: {
        ...current.properties,
        [current.kind]: {
          ...((current.properties as Record<string, unknown>)[current.kind] as Record<string, unknown> | undefined),
          [key]: value,
        },
      },
    }));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        editing
          ? `/api/campaigns/${campaignId}/items/${editing.id}`
          : `/api/campaigns/${campaignId}/items`,
        {
          method: editing ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(draft),
        },
      );
      const body = await response.json() as { item?: CampaignItem; error?: string };
      if (!response.ok || !body.item) throw new Error(body.error || "Campaign item could not be saved.");
      setItems(current => editing
        ? current.map(item => item.id === body.item?.id ? body.item : item)
        : [...current, body.item as CampaignItem].sort((left, right) => left.name.localeCompare(right.name)));
      setEditing(null);
      setDraft(blankItem());
      setFormOpen(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Campaign item could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(itemId: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/items/${itemId}`, { method: "DELETE" });
      if (!response.ok) {
        const body = await response.json() as { error?: string };
        throw new Error(body.error || "Campaign item could not be deleted.");
      }
      setItems(current => current.filter(item => item.id !== itemId));
      setDeleteId(null);
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Campaign item could not be deleted.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="gm-console-section campaign-item-library" aria-labelledby="gm-items-title">
    <div className="campaign-section-heading">
      <div>
        <p className="campaign-kicker">CAMPAIGN ITEM LIBRARY</p>
        <h2 id="gm-items-title">Items</h2>
        <p className="campaign-empty-copy">Create mundane or magical items that become available in the inventory picker for all linked players or only selected characters.</p>
      </div>
      <button type="button" className="campaign-primary" onClick={openCreate}>Create Item</button>
    </div>
    {error && <p className="campaign-error" role="status">{error}</p>}
    {formOpen && <form className="gm-npc-form campaign-item-form" onSubmit={save}>
      <div className="gm-npc-form-heading">
        <h3>{editing ? `Edit ${editing.name}` : "New Campaign Item"}</h3>
        <button type="button" className="campaign-quiet" onClick={() => { setFormOpen(false); setEditing(null); setDraft(blankItem()); }}>Cancel</button>
      </div>
      <div className="gm-npc-fields campaign-item-fields">
        <label><span>Name</span><input required maxLength={80} value={draft.name} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} /></label>
        <label><span>Category</span><select value={draft.kind} onChange={event => changeKind(event.target.value as InventoryItemKind)}><option value="weapon">Weapon</option><option value="armor">Armour</option><option value="mundane">Mundane Item</option><option value="magical">Magical Item</option></select></label>
      </div>
      <label className="gm-npc-notes"><span>Description / rules</span><textarea maxLength={2000} value={draft.description} onChange={event => setDraft(current => ({ ...current, description: event.target.value }))} placeholder="What the item is and what it does." /></label>
      {draft.kind === "weapon" && <fieldset className="campaign-item-properties"><legend>Weapon properties</legend><div className="gm-npc-fields"><label><span>Damage</span><input required maxLength={80} value={draft.properties.weapon?.damage ?? ""} onChange={event => setProperty("damage", event.target.value)} placeholder="1d8" /></label><label><span>Shock</span><input required maxLength={80} value={draft.properties.weapon?.shock ?? ""} onChange={event => setProperty("shock", event.target.value)} placeholder="2/AC 15 or None" /></label><label><span>Range</span><input required maxLength={40} value={draft.properties.weapon?.range ?? ""} onChange={event => setProperty("range", event.target.value)} placeholder="— or 30/60" /></label><label><span>Attribute</span><select value={draft.properties.weapon?.attribute ?? "Str"} onChange={event => setProperty("attribute", event.target.value)}><option>Str</option><option>Dex</option><option>Str/Dex</option></select></label><label><span>Attack skill</span><select value={draft.properties.weapon?.skill ?? "Stab"} onChange={event => setProperty("skill", event.target.value)}><option>Stab</option><option>Shoot</option><option>Punch</option></select></label><label><span>Encumbrance</span><input required type="number" min={0} max={20} value={draft.properties.weapon?.encumbrance ?? 0} onChange={event => setProperty("encumbrance", Number(event.target.value))} /></label></div><label className="gm-npc-notes"><span>Weapon traits</span><input maxLength={240} value={draft.properties.weapon?.traits ?? ""} onChange={event => setProperty("traits", event.target.value)} placeholder="2H, T, AP…" /></label></fieldset>}
      {draft.kind === "armor" && <fieldset className="campaign-item-properties"><legend>Armour properties</legend><div className="gm-npc-fields"><label><span>Armor Class</span><input required type="number" min={0} max={100} value={draft.properties.armor?.armorClass ?? 10} onChange={event => setProperty("armorClass", Number(event.target.value))} /></label><label><span>Encumbrance</span><input required type="number" min={0} max={20} value={draft.properties.armor?.encumbrance ?? 0} onChange={event => setProperty("encumbrance", Number(event.target.value))} /></label><label><span>Shield status</span><select value={draft.properties.armor?.shield ?? "none"} onChange={event => setProperty("shield", event.target.value)}><option value="none">Not a shield</option><option value="small">Small shield</option><option value="large">Large shield</option></select></label></div><label className="gm-npc-notes"><span>Restrictions</span><textarea maxLength={500} value={draft.properties.armor?.restrictions ?? ""} onChange={event => setProperty("restrictions", event.target.value)} placeholder="Who can use it or what it prevents." /></label><label className="gm-npc-notes"><span>Properties</span><textarea maxLength={500} value={draft.properties.armor?.properties ?? ""} onChange={event => setProperty("properties", event.target.value)} placeholder="Relevant armor or shield rules." /></label></fieldset>}
      {draft.kind === "magical" && <fieldset className="campaign-item-properties"><legend>Magical properties</legend><label className="gm-npc-notes"><span>Bonuses</span><input maxLength={500} value={draft.properties.magical?.bonuses ?? ""} onChange={event => setProperty("bonuses", event.target.value)} placeholder="For example, +1 to hit and damage." /></label><label className="gm-npc-notes"><span>Abilities</span><textarea maxLength={2000} value={draft.properties.magical?.abilities ?? ""} onChange={event => setProperty("abilities", event.target.value)} placeholder="Passive or active magical abilities." /></label><div className="gm-npc-fields"><label><span>Charges / uses</span><input type="number" min={0} max={100000} value={draft.properties.magical?.charges ?? ""} onChange={event => setProperty("charges", event.target.value === "" ? null : Number(event.target.value))} /></label><label><span>Use guidance</span><input maxLength={500} value={draft.properties.magical?.uses ?? ""} onChange={event => setProperty("uses", event.target.value)} placeholder="When and how it can be used." /></label></div><label className="gm-npc-notes"><span>Rules text</span><textarea maxLength={2000} value={draft.properties.magical?.rulesText ?? ""} onChange={event => setProperty("rulesText", event.target.value)} placeholder="Other character-affecting rules." /></label></fieldset>}
      <fieldset className="campaign-item-visibility">
        <legend>Player visibility</legend>
        <label><input type="radio" name="item-visibility" value="all" checked={draft.visibility === "all"} onChange={() => setDraft(current => ({ ...current, visibility: "all", characterIds: [] }))} /> All linked players</label>
        <label><input type="radio" name="item-visibility" value="selected" checked={draft.visibility === "selected"} onChange={() => setDraft(current => ({ ...current, visibility: "selected" }))} /> Selected characters only</label>
        {draft.visibility === "selected" && <div className="campaign-item-character-grid">
          {!characters.length && <p className="campaign-empty-copy">Link characters to the campaign before restricting an item to selected characters.</p>}
          {characters.map(character => <label key={character.id}><input type="checkbox" checked={draft.characterIds.includes(character.id)} onChange={() => toggleCharacter(character.id)} /> {character.name}</label>)}
        </div>}
      </fieldset>
      <button type="submit" className="campaign-primary" disabled={busy || (draft.visibility === "selected" && draft.characterIds.length === 0)}>{editing ? "Save Item" : "Create Item"}</button>
    </form>}
    {loading && <p className="campaign-empty-copy">Loading campaign items…</p>}
    {!loading && !items.length && !formOpen && <p className="campaign-empty-copy">No campaign items have been created yet.</p>}
    <div className="gm-npc-list campaign-item-list">{items.map(item => <article key={item.id} className="gm-npc-card campaign-item-card">
      <div>
        <p className="campaign-kicker">{kindLabel(item.kind).toUpperCase()}</p>
        <h3>{item.name}</h3>
        {item.description && <p>{item.description}</p>}
        {propertySummary(item) && <small>{propertySummary(item)}</small>}
        <small>Visible to: {visibilitySummary(item, characters)}</small>
      </div>
      <div className="gm-npc-actions">
        <button type="button" className="campaign-quiet" onClick={() => openEdit(item)}>Edit</button>
        {deleteId === item.id
          ? <span className="gm-npc-delete-confirm"><button type="button" className="campaign-danger" disabled={busy} onClick={() => void remove(item.id)}>Confirm Delete</button><button type="button" className="campaign-quiet" onClick={() => setDeleteId(null)}>Cancel</button></span>
          : <button type="button" className="campaign-danger" onClick={() => setDeleteId(item.id)}>Delete</button>}
      </div>
    </article>)}</div>
  </section>;
}
