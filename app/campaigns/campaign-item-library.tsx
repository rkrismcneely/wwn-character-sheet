"use client";

import { useEffect, useState, type FormEvent } from "react";
import type {
  CampaignItem,
  CampaignItemManagementPayload,
  CampaignItemTarget,
  CampaignItemVisibility,
} from "@/lib/campaigns/items";
import type { InventoryItemKind } from "@/lib/inventory/items";

type ItemDraft = {
  name: string;
  kind: InventoryItemKind;
  description: string;
  visibility: CampaignItemVisibility;
  characterIds: string[];
};

const blankItem = (): ItemDraft => ({
  name: "",
  kind: "mundane",
  description: "",
  visibility: "all",
  characterIds: [],
});

function draftFor(item: CampaignItem): ItemDraft {
  return {
    name: item.name,
    kind: item.kind,
    description: item.description,
    visibility: item.visibility,
    characterIds: [...item.characterIds],
  };
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
        <label><span>Type</span><select value={draft.kind} onChange={event => setDraft(current => ({ ...current, kind: event.target.value as InventoryItemKind }))}><option value="mundane">Mundane</option><option value="magical">Magical</option></select></label>
      </div>
      <label className="gm-npc-notes"><span>Description / rules</span><textarea maxLength={2000} value={draft.description} onChange={event => setDraft(current => ({ ...current, description: event.target.value }))} placeholder="What the item is and what it does." /></label>
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
        <p className="campaign-kicker">{item.kind === "magical" ? "MAGICAL ITEM" : "MUNDANE ITEM"}</p>
        <h3>{item.name}</h3>
        {item.description && <p>{item.description}</p>}
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
