"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import type {
  CampaignStore,
  CampaignStoreItem,
  CampaignStoreItemKind,
  CampaignStoreManagementPayload,
} from "@/lib/campaigns/stores";

type AddItemDraft = {
  sourceType: "srd" | "campaign";
  sourceItemId: string;
  cost: string;
  quantity: string;
  unlimited: boolean;
  note: string;
};

function blankItem(): AddItemDraft {
  return {
    sourceType: "srd",
    sourceItemId: "",
    cost: "",
    quantity: "1",
    unlimited: true,
    note: "",
  };
}

function kindLabel(kind: CampaignStoreItemKind): string {
  if (kind === "armor") return "Armour";
  if (kind === "magical") return "Magical Item";
  if (kind === "weapon") return "Weapon";
  if (kind === "shield") return "Shield";
  if (kind === "bundle") return "Gear Bundle";
  if (kind === "gear") return "Adventuring Gear";
  return "Mundane Item";
}

function stockLabel(quantity: number | null): string {
  return quantity === null ? "Unlimited stock" : quantity === 1 ? "1 in stock" : `${quantity} in stock`;
}

function ManagedStoreItem({
  item,
  busy,
  onSave,
  onDelete,
}: {
  item: CampaignStoreItem;
  busy: boolean;
  onSave: (item: CampaignStoreItem, value: { cost: string; quantity: number | null; note: string }) => void;
  onDelete: (item: CampaignStoreItem) => void;
}) {
  const [cost, setCost] = useState(item.cost);
  const [quantity, setQuantity] = useState(item.quantity === null ? "1" : String(item.quantity));
  const [unlimited, setUnlimited] = useState(item.quantity === null);
  const [note, setNote] = useState(item.note);

  useEffect(() => {
    setCost(item.cost);
    setQuantity(item.quantity === null ? "1" : String(item.quantity));
    setUnlimited(item.quantity === null);
    setNote(item.note);
  }, [item]);

  return <article className="campaign-store-managed-item">
    <div className="campaign-store-managed-item-heading">
      <div>
        <p className="campaign-kicker">{kindLabel(item.kind).toUpperCase()} · {item.sourceType === "srd" ? "SRD" : "CAMPAIGN ITEM"}</p>
        <h4>{item.name}</h4>
        {item.description && <p>{item.description}</p>}
        {item.details && <small>{item.details}</small>}
      </div>
      <button type="button" className="campaign-danger" disabled={busy} onClick={() => onDelete(item)}>Remove</button>
    </div>
    <form className="campaign-store-item-edit" onSubmit={event => {
      event.preventDefault();
      onSave(item, { cost, quantity: unlimited ? null : Number(quantity), note });
    }}>
      <label><span>Cost</span><input required maxLength={80} value={cost} onChange={event => setCost(event.target.value)} /></label>
      <label><span>Stock</span><input required disabled={unlimited} type="number" min={0} max={1000000} value={quantity} onChange={event => setQuantity(event.target.value)} /></label>
      <label className="campaign-store-unlimited"><input type="checkbox" checked={unlimited} onChange={event => setUnlimited(event.target.checked)} /> Unlimited stock</label>
      <label className="campaign-store-item-note"><span>Shop note</span><input maxLength={1000} value={note} onChange={event => setNote(event.target.value)} placeholder="Optional note visible to the party" /></label>
      <button type="submit" className="campaign-secondary" disabled={busy || !cost.trim() || (!unlimited && (!quantity || Number(quantity) < 0))}>Save Item</button>
    </form>
  </article>;
}

export function CampaignStoreLibrary({ campaignId }: { campaignId: string }) {
  const [stores, setStores] = useState<CampaignStore[]>([]);
  const [catalog, setCatalog] = useState<CampaignStoreManagementPayload["catalog"]>([]);
  const [campaignItems, setCampaignItems] = useState<CampaignStoreManagementPayload["campaignItems"]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [storeName, setStoreName] = useState("");
  const [storeDescription, setStoreDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [addDraft, setAddDraft] = useState<AddItemDraft>(blankItem);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const selectedStore = useMemo(
    () => stores.find(store => store.id === selectedStoreId) ?? stores[0] ?? null,
    [selectedStoreId, stores],
  );
  const choices = addDraft.sourceType === "srd" ? catalog : campaignItems;
  const selectedSource = choices.find(item => item.id === addDraft.sourceItemId);

  function chooseStore(store: CampaignStore) {
    setCreating(false);
    setSelectedStoreId(store.id);
    setStoreName(store.name);
    setStoreDescription(store.description);
    setAddDraft(blankItem());
    setError("");
  }

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/stores`, { cache: "no-store" });
      const body = await response.json() as CampaignStoreManagementPayload & { error?: string };
      if (!response.ok || !Array.isArray(body.stores) || !Array.isArray(body.catalog) || !Array.isArray(body.campaignItems)) {
        throw new Error(body.error || "Campaign stores are unavailable.");
      }
      setStores(body.stores);
      setCatalog(body.catalog);
      setCampaignItems(body.campaignItems);
      const preferred = body.stores.find(store => store.isActive) ?? body.stores[0] ?? null;
      setSelectedStoreId(preferred?.id ?? "");
      setStoreName(preferred?.name ?? "");
      setStoreDescription(preferred?.description ?? "");
      setCreating(body.stores.length === 0);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Campaign stores are unavailable.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [campaignId]);

  async function createStore(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/stores`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: storeName, description: storeDescription }),
      });
      const body = await response.json() as { store?: CampaignStore; error?: string };
      if (!response.ok || !body.store) throw new Error(body.error || "Campaign store could not be created.");
      setStores(current => [...current, body.store as CampaignStore].sort((left, right) => left.name.localeCompare(right.name)));
      chooseStore(body.store);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Campaign store could not be created.");
    } finally {
      setBusy(false);
    }
  }

  async function saveStore(event: FormEvent) {
    event.preventDefault();
    if (!selectedStore) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/stores/${selectedStore.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: storeName, description: storeDescription }),
      });
      const body = await response.json() as { store?: CampaignStore; error?: string };
      if (!response.ok || !body.store) throw new Error(body.error || "Campaign store could not be saved.");
      setStores(current => current.map(store => store.id === body.store?.id ? body.store : store));
      setStoreName(body.store.name);
      setStoreDescription(body.store.description);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Campaign store could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function setActive(active: boolean) {
    if (!selectedStore) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/stores/${selectedStore.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ active }),
      });
      const body = await response.json() as { store?: CampaignStore; error?: string };
      if (!response.ok || !body.store) throw new Error(body.error || "Store visibility could not be changed.");
      setStores(current => current.map(store => store.id === body.store?.id
        ? body.store as CampaignStore
        : { ...store, isActive: active ? false : store.isActive }));
    } catch (visibilityError) {
      setError(visibilityError instanceof Error ? visibilityError.message : "Store visibility could not be changed.");
    } finally {
      setBusy(false);
    }
  }

  async function removeStore() {
    if (!selectedStore || !window.confirm(`Delete “${selectedStore.name}” and all of its stocked items? This cannot be undone.`)) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/stores/${selectedStore.id}`, { method: "DELETE" });
      if (!response.ok) {
        const body = await response.json() as { error?: string };
        throw new Error(body.error || "Campaign store could not be deleted.");
      }
      const remaining = stores.filter(store => store.id !== selectedStore.id);
      setStores(remaining);
      const next = remaining[0] ?? null;
      setSelectedStoreId(next?.id ?? "");
      setStoreName(next?.name ?? "");
      setStoreDescription(next?.description ?? "");
      setCreating(remaining.length === 0);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Campaign store could not be deleted.");
    } finally {
      setBusy(false);
    }
  }

  async function addItem(event: FormEvent) {
    event.preventDefault();
    if (!selectedStore) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/stores/${selectedStore.id}/items`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceType: addDraft.sourceType,
          sourceItemId: addDraft.sourceItemId,
          cost: addDraft.cost,
          quantity: addDraft.unlimited ? null : Number(addDraft.quantity),
          note: addDraft.note,
        }),
      });
      const body = await response.json() as { item?: CampaignStoreItem; error?: string };
      if (!response.ok || !body.item) throw new Error(body.error || "Store item could not be added.");
      setStores(current => current.map(store => store.id === selectedStore.id
        ? { ...store, items: [...store.items, body.item as CampaignStoreItem].sort((left, right) => left.name.localeCompare(right.name)) }
        : store));
      setAddDraft(blankItem());
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : "Store item could not be added.");
    } finally {
      setBusy(false);
    }
  }

  async function saveItem(item: CampaignStoreItem, value: { cost: string; quantity: number | null; note: string }) {
    if (!selectedStore) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/stores/${selectedStore.id}/items/${item.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(value),
      });
      const body = await response.json() as { item?: CampaignStoreItem; error?: string };
      if (!response.ok || !body.item) throw new Error(body.error || "Store item could not be saved.");
      setStores(current => current.map(store => store.id === selectedStore.id
        ? { ...store, items: store.items.map(currentItem => currentItem.id === body.item?.id ? body.item as CampaignStoreItem : currentItem) }
        : store));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Store item could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function removeItem(item: CampaignStoreItem) {
    if (!selectedStore || !window.confirm(`Remove “${item.name}” from this store?`)) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/stores/${selectedStore.id}/items/${item.id}`, { method: "DELETE" });
      if (!response.ok) {
        const body = await response.json() as { error?: string };
        throw new Error(body.error || "Store item could not be removed.");
      }
      setStores(current => current.map(store => store.id === selectedStore.id
        ? { ...store, items: store.items.filter(currentItem => currentItem.id !== item.id) }
        : store));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Store item could not be removed.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="gm-console-section campaign-store-library" aria-labelledby="gm-stores-title">
    <div className="campaign-section-heading">
      <div>
        <p className="campaign-kicker">CAMPAIGN STORE LIBRARY</p>
        <h2 id="gm-stores-title">Stores</h2>
        <p className="campaign-empty-copy">Prepare shops ahead of time, then make exactly one available to the party. Custom campaign items become party-visible snapshots when stocked here, even when their normal item visibility is restricted.</p>
      </div>
      <button type="button" className="campaign-primary" onClick={() => {
        setCreating(true);
        setSelectedStoreId("");
        setStoreName("");
        setStoreDescription("");
        setAddDraft(blankItem());
        setError("");
      }}>New Store</button>
    </div>
    {error && <p className="campaign-error" role="status">{error}</p>}
    {loading && <p className="campaign-empty-copy">Loading campaign stores…</p>}
    {!loading && <div className="campaign-store-management-layout">
      <aside className="campaign-store-list-panel" aria-label="Campaign stores">
        {!stores.length && !creating && <p className="campaign-empty-copy">No stores have been created.</p>}
        {stores.map(store => <button type="button" key={store.id} className={`campaign-store-picker${selectedStore?.id === store.id && !creating ? " is-selected" : ""}`} onClick={() => chooseStore(store)}>
          <span><strong>{store.name}</strong><small>{store.items.length} {store.items.length === 1 ? "item" : "items"} · {store.isActive ? "Visible to party" : "GM only"}</small></span>
          {store.isActive && <b>Open</b>}
        </button>)}
      </aside>
      <div className="campaign-store-editor">
        {creating && <form className="gm-npc-form campaign-store-form" onSubmit={createStore}>
          <div className="gm-npc-form-heading"><h3>New Store</h3>{stores.length > 0 && <button type="button" className="campaign-quiet" onClick={() => selectedStore && chooseStore(selectedStore)}>Cancel</button>}</div>
          <label className="gm-npc-notes"><span>Store name</span><input required maxLength={80} value={storeName} onChange={event => setStoreName(event.target.value)} placeholder="The Brass Lantern" /></label>
          <label className="gm-npc-notes"><span>Description</span><textarea maxLength={2000} value={storeDescription} onChange={event => setStoreDescription(event.target.value)} placeholder="Merchant, atmosphere, and other details the party should see." /></label>
          <button type="submit" className="campaign-primary" disabled={busy || !storeName.trim()}>Create Store</button>
        </form>}
        {!creating && selectedStore && <>
          <form className="gm-npc-form campaign-store-form" onSubmit={saveStore}>
            <div className="gm-npc-form-heading"><div><p className="campaign-kicker">{selectedStore.isActive ? "VISIBLE TO PARTY" : "GM ONLY"}</p><h3>{selectedStore.name}</h3></div><div className="campaign-store-editor-actions">{selectedStore.isActive ? <button type="button" className="campaign-quiet" disabled={busy} onClick={() => void setActive(false)}>Hide from Party</button> : <button type="button" className="campaign-primary" disabled={busy} onClick={() => void setActive(true)}>Make Visible to Party</button>}<button type="button" className="campaign-danger" disabled={busy} onClick={() => void removeStore()}>Delete Store</button></div></div>
            <label className="gm-npc-notes"><span>Store name</span><input required maxLength={80} value={storeName} onChange={event => setStoreName(event.target.value)} /></label>
            <label className="gm-npc-notes"><span>Description</span><textarea maxLength={2000} value={storeDescription} onChange={event => setStoreDescription(event.target.value)} placeholder="Merchant, atmosphere, and other details the party should see." /></label>
            <button type="submit" className="campaign-secondary" disabled={busy || !storeName.trim()}>Save Store Details</button>
          </form>
          <section className="campaign-store-stock">
            <div className="campaign-store-stock-heading"><div><p className="campaign-kicker">INVENTORY</p><h3>Stock</h3><p>SRD entries keep an equipment snapshot and default cost. Campaign items are added as independent snapshots, so this store can show them to everyone in the party.</p></div><small>{selectedStore.items.length} stocked · {stockLabel(selectedStore.items.reduce<number | null>((total, item) => total === null || item.quantity === null ? null : total + item.quantity, 0))}</small></div>
            <form className="campaign-store-add-item" onSubmit={addItem}>
              <label><span>Source</span><select value={addDraft.sourceType} onChange={event => setAddDraft(current => ({ ...current, sourceType: event.target.value as "srd" | "campaign", sourceItemId: "", cost: "" }))}><option value="srd">SRD item</option><option value="campaign">Campaign custom item</option></select></label>
              <label className="campaign-store-add-source"><span>Item</span><select required value={addDraft.sourceItemId} onChange={event => {
                const choice = choices.find(item => item.id === event.target.value);
                setAddDraft(current => ({ ...current, sourceItemId: event.target.value, cost: current.sourceType === "srd" ? (choice && "defaultCost" in choice ? choice.defaultCost : "") : current.cost }));
              }}><option value="">Choose an item…</option>{choices.map(item => <option key={item.id} value={item.id}>{item.name} · {kindLabel(item.kind)}</option>)}</select>{addDraft.sourceType === "campaign" && !campaignItems.length && <small>Create a custom item in the Items tab first.</small>}{selectedSource && <small>{selectedSource.details || ("description" in selectedSource ? selectedSource.description : "")}</small>}</label>
              <label><span>Cost</span><input required maxLength={80} value={addDraft.cost} onChange={event => setAddDraft(current => ({ ...current, cost: event.target.value }))} placeholder={addDraft.sourceType === "srd" ? "Choose an SRD item" : "For example, 20 sp"} /></label>
              <label><span>Stock</span><input required disabled={addDraft.unlimited} type="number" min={0} max={1000000} value={addDraft.quantity} onChange={event => setAddDraft(current => ({ ...current, quantity: event.target.value }))} /></label>
              <label className="campaign-store-unlimited"><input type="checkbox" checked={addDraft.unlimited} onChange={event => setAddDraft(current => ({ ...current, unlimited: event.target.checked }))} /> Unlimited stock</label>
              <label className="campaign-store-item-note"><span>Shop note</span><input maxLength={1000} value={addDraft.note} onChange={event => setAddDraft(current => ({ ...current, note: event.target.value }))} placeholder="Optional note visible to the party" /></label>
              <button type="submit" className="campaign-primary" disabled={busy || !addDraft.sourceItemId || !addDraft.cost.trim() || (!addDraft.unlimited && (!addDraft.quantity || Number(addDraft.quantity) < 0))}>Add to Store</button>
            </form>
            {!selectedStore.items.length && <p className="campaign-empty-copy">This store has no stocked items yet.</p>}
            <div className="campaign-store-managed-list">{selectedStore.items.map(item => <ManagedStoreItem key={item.id} item={item} busy={busy} onSave={(item, value) => void saveItem(item, value)} onDelete={item => void removeItem(item)} />)}</div>
          </section>
        </>}
      </div>
    </div>}
  </section>;
}
