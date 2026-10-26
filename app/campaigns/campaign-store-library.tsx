"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { JournalLinkedNpc } from "./journal-linked-npc";
import type {
  CampaignStore,
  CampaignStoreItem,
  CampaignStoreItemKind,
  CampaignStoreManagementPayload,
} from "@/lib/campaigns/stores";

type AddSourceMode = "catalog" | "campaign";

type CustomItemDraft = {
  sourceItemId: string;
  cost: string;
  quantity: string;
  unlimited: boolean;
  note: string;
};

function blankCustomItem(): CustomItemDraft {
  return {
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
  const hasDetails = Boolean(item.description || item.details);

  return <article className="campaign-store-managed-item">
    <div className="campaign-store-managed-item-heading">
      <div>
        <p className="campaign-kicker">{kindLabel(item.kind).toUpperCase()} · {item.sourceType === "srd" ? "CATALOG" : "CAMPAIGN ITEM"}</p>
        <h4>{item.name}</h4>
        {hasDetails && <details className="campaign-store-managed-details">
          <summary>Description &amp; stats</summary>
          {item.description && <p>{item.description}</p>}
          {item.details && item.details !== item.description && <small>{item.details}</small>}
        </details>}
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


const managedStart="<!-- twe-store-managed:start -->";
const managedEnd="<!-- twe-store-managed:end -->";
function storeJournalManagedContent(store:CampaignStore){
  const safe=(value:string)=>value.replaceAll("\\","\\\\").replaceAll("*","\\*").replaceAll("[","\\[").replaceAll("]","\\]").replaceAll("|","\\|").replaceAll("\n"," ");
  const lines=[managedStart];
  if(store.description.trim())lines.push(store.description.trim(),"");
  if(store.proprietorName||store.proprietorDescription||store.proprietorNpcId){
    lines.push("## Proprietor","");
    if(store.proprietorName)lines.push("**"+safe(store.proprietorName)+"**","");
    if(store.proprietorDescription)lines.push(store.proprietorDescription.trim(),"");

  }
  lines.push("## Goods for sale","","| Item | Price | Availability |","| :--- | ---: | :--- |");
  if(store.items.length)for(const item of store.items){
    const availability=item.quantity===null?"unlimited stock":String(item.quantity)+" in stock";
    lines.push("| **"+safe(item.name)+"**"+(item.note?" — "+safe(item.note):"")+" | "+safe(item.cost)+" | "+availability+" |");
  }else lines.push("No inventory listed yet.");
  lines.push(managedEnd);
  return lines.join("\n");
}
function nextStoreJournalContent(content:string,store:CampaignStore){
  const managed=storeJournalManagedContent(store);
  const start=content.indexOf(managedStart),end=content.indexOf(managedEnd);
  if(start>=0&&end>start)return content.slice(0,start)+managed+content.slice(end+managedEnd.length);
  // Legacy imports: update only the original generated block, never freeform notes.
  const legacy=content.match(/\n\n## Goods for sale\n\n\| Item \| Price \| Availability \|[\s\S]*$/u);
  if(legacy){
    const prefix=content.slice(0,legacy.index);
    // Don't replace notes added after the generated table.
    const rows=legacy[0].trim().split("\n");
    const expected=rows.slice(2).every(line=>line.startsWith("|")||line==="No inventory listed yet.");
    if(expected)return prefix+"\n\n"+managed;
  }
  return content;
}

export function CampaignStoreLibrary({ campaignId }: { campaignId: string }) {
  const [stores, setStores] = useState<CampaignStore[]>([]);
  const syncInitialized=useRef(false);
  const syncQueue=useRef<Promise<void>>(Promise.resolve());
  async function syncStoreJournalPages(updated:CampaignStore[]){
    const url="/api/campaigns/"+encodeURIComponent(campaignId)+"/journal";
    const response=await fetch(url,{cache:"no-store"});
    if(!response.ok)return;
    const body=await response.json() as {entries?:{id:string;kind:string;content:string}[]};
    if(!Array.isArray(body.entries))return;
    let changed=false;
    for(const store of updated){
      const marker="<!-- twe-store:"+store.id+" -->";
      const page=body.entries.find(e=>e.kind==="page"&&e.content.includes(marker));
      if(!page)continue;
      const content=nextStoreJournalContent(page.content,store);
      if(content===page.content)continue;
      const update=await fetch(url,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:page.id,content})});
      if(!update.ok)throw new Error("Could not synchronize the Journal page for "+store.name+".");
      page.content=content;changed=true;
    }
    if(changed)window.dispatchEvent(new CustomEvent("twe:campaign-data-changed",{detail:{campaignId,area:"journal"}}));
  }
  const [catalog, setCatalog] = useState<CampaignStoreManagementPayload["catalog"]>([]);
  const [campaignItems, setCampaignItems] = useState<CampaignStoreManagementPayload["campaignItems"]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [storeName, setStoreName] = useState("");
  const [storeDescription, setStoreDescription] = useState("");
  const [proprietorReady,setProprietorReady]=useState(false);
  const [proprietorName,setProprietorName]=useState("");
  const [proprietorDescription,setProprietorDescription]=useState("");
  const [proprietorNpcId,setProprietorNpcId]=useState("");
  const [npcChoices,setNpcChoices]=useState<{id:string;name:string;notes:string}[]>([]);
  const [creating, setCreating] = useState(false);
  const [addSourceMode, setAddSourceMode] = useState<AddSourceMode>("catalog");
  const [catalogCategory, setCatalogCategory] = useState("");
  const [catalogSource, setCatalogSource] = useState("");
  const [catalogQuery, setCatalogQuery] = useState("");
  const [hideStocked, setHideStocked] = useState(true);
  const [selectedCatalogIds, setSelectedCatalogIds] = useState<string[]>([]);
  const [bulkQuantity, setBulkQuantity] = useState("1");
  const [bulkUnlimited, setBulkUnlimited] = useState(true);
  const [bulkProgress, setBulkProgress] = useState(0);
  const [customDraft, setCustomDraft] = useState<CustomItemDraft>(blankCustomItem);
  const [stockQuery, setStockQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [journalNotice, setJournalNotice] = useState("");
  useEffect(()=>{
    if(!syncInitialized.current){syncInitialized.current=true;return;}
    window.dispatchEvent(new CustomEvent("twe:campaign-data-changed",{detail:{campaignId,area:"stores"}}));
    syncQueue.current=syncQueue.current.catch(()=>{}).then(()=>syncStoreJournalPages(stores)).catch(error=>{
      setJournalNotice(error instanceof Error?error.message:"Could not update linked Journal articles.");
    });
  },[stores,campaignId]);
  type Placement = {id:string;title:string;kind:string;parentId:string|null;content:string;icon?:string};
  const [placements,setPlacements]=useState<Placement[]>([]);
  const [pendingLocation,setPendingLocation]=useState<{storeId:string;id:string}|null>(null);
  const [locationBusy,setLocationBusy]=useState(false);
  const locations=useMemo(()=>{
    const designated=placements.find(e=>e.kind==="folder"&&e.icon==="twe-role:locations");
    const root=designated?[designated]:placements.filter(e=>e.kind==="folder"&&!e.parentId&&e.title.toLowerCase()==="locations");
    const folders=new Set(root.map(e=>e.id));
    for(let i=0;i<20;i++)for(const e of placements)if(e.kind==="folder"&&e.parentId&&folders.has(e.parentId))folders.add(e.id);
    return placements.filter(e=>e.kind==="page"&&!!e.parentId&&folders.has(e.parentId)).sort((a,b)=>a.title.localeCompare(b.title));
  },[placements]);
  async function loadPlacements(){
    const response=await fetch("/api/campaigns/"+encodeURIComponent(campaignId)+"/journal",{cache:"no-store"});
    const body=await response.json() as {entries?:Placement[];error?:string};
    if(!response.ok||!Array.isArray(body.entries))throw new Error(body.error||"Cannot load Journal locations.");
    setPlacements(body.entries);return body.entries;
  }
  useEffect(()=>{const controller=new AbortController();void fetch("/api/campaigns/"+encodeURIComponent(campaignId)+"/journal",{cache:"no-store",signal:controller.signal}).then(r=>r.json()).then((value:unknown)=>{const body=value as {entries?:Placement[]};if(!controller.signal.aborted&&Array.isArray(body.entries))setPlacements(body.entries);}).catch(()=>{});return()=>controller.abort();},[campaignId]);
  useEffect(()=>{
    const onJournalChanged=(event:Event)=>{const detail=(event as CustomEvent<{campaignId?:string;area?:string}>).detail;
      if(detail?.campaignId===campaignId&&detail.area==="journal")void loadPlacements().catch(()=>{});
    };
    window.addEventListener("twe:campaign-data-changed",onJournalChanged);
    return()=>window.removeEventListener("twe:campaign-data-changed",onJournalChanged);
  },[campaignId]);
  async function moveStoreLocation(next:string){
    if(!selectedStore||locationBusy)return;
    if(next&&!locations.some(l=>l.id===next))return;
    setLocationBusy(true);setError("");setJournalNotice("");
    try{
      const latest=await loadPlacements();
      const page=latest.find(e=>e.kind==="page"&&e.content.includes("<!-- twe-store:"+selectedStore.id+" -->"));
      if(!page){
        setPendingLocation({storeId:selectedStore.id,id:next});
        setJournalNotice("Location selected. Use Add to Journal to create the store article there.");
        return;
      }
      const folder=latest.find(e=>e.kind==="folder"&&!e.parentId&&e.title.toLowerCase()==="stores");
      const response=await fetch("/api/campaigns/"+encodeURIComponent(campaignId)+"/journal",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:page.id,parentId:next||folder?.id||null})});
      const body=await response.json() as {entry?:Placement;error?:string};
      if(!response.ok||!body.entry)throw new Error(body.error||"Could not move store article.");
      await loadPlacements();window.dispatchEvent(new CustomEvent("twe:campaign-data-changed",{detail:{campaignId,area:"journal"}}));setPendingLocation({storeId:selectedStore.id,id:next});setJournalNotice(next?"Store filed beneath the selected location.":"Store filed under Stores.");
    }catch(err){setError(err instanceof Error?err.message:"Could not set location.");}
    finally{setLocationBusy(false);}
  }


  const selectedStore = stores.find(store => store.id === selectedStoreId) ?? stores[0] ?? null;
  const linkedPage=placements.find(page=>page.kind==="page"&&!!selectedStore&&page.content.includes("<!-- twe-store:"+selectedStore.id+" -->"));
  const locationId=pendingLocation?.storeId===selectedStore?.id?pendingLocation.id:(linkedPage&&locations.some(location=>location.id===linkedPage.parentId)?linkedPage.parentId!:"");
  const categories = useMemo(
    () => Array.from(new Set(catalog.map(item => item.category))),
    [catalog],
  );
  const sources = useMemo(() => {
    const labels = new Map<string, string>();
    for (const item of catalog) labels.set(item.source, item.sourceLabel);
    return Array.from(labels, ([value, label]) => ({ value, label }));
  }, [catalog]);
  const stockedCatalogIds = useMemo(
    () => new Set((selectedStore?.items ?? []).filter(item => item.sourceType === "srd" && item.sourceItemId).map(item => item.sourceItemId as string)),
    [selectedStore],
  );
  const filteredCatalog = useMemo(() => {
    const needle = catalogQuery.trim().toLocaleLowerCase();
    return catalog.filter(item => {
      if (catalogCategory && item.category !== catalogCategory) return false;
      if (catalogSource && item.source !== catalogSource) return false;
      if (hideStocked && stockedCatalogIds.has(item.id)) return false;
      if (!needle) return true;
      return [
        item.name,
        item.kind,
        item.category,
        item.subcategory,
        item.details,
        item.defaultCost,
        item.sourceLabel,
      ].join(" ").toLocaleLowerCase().includes(needle);
    });
  }, [catalog, catalogCategory, catalogQuery, catalogSource, hideStocked, stockedCatalogIds]);
  const selectedCatalog = useMemo(
    () => selectedCatalogIds.map(id => catalog.find(item => item.id === id)).filter((item): item is CampaignStoreManagementPayload["catalog"][number] => Boolean(item)),
    [catalog, selectedCatalogIds],
  );
  const selectedCustomSource = campaignItems.find(item => item.id === customDraft.sourceItemId);
  const filteredStock = useMemo(() => {
    const needle = stockQuery.trim().toLocaleLowerCase();
    if (!needle) return selectedStore?.items ?? [];
    return (selectedStore?.items ?? []).filter(item => [item.name, item.kind, item.description, item.details, item.note, item.cost]
      .join(" ").toLocaleLowerCase().includes(needle));
  }, [selectedStore, stockQuery]);

  function resetAddControls() {
    setAddSourceMode("catalog");
    setCatalogCategory("");
    setCatalogSource("");
    setCatalogQuery("");
    setSelectedCatalogIds([]);
    setBulkQuantity("1");
    setBulkUnlimited(true);
    setBulkProgress(0);
    setCustomDraft(blankCustomItem());
    setStockQuery("");
  }

  function chooseStore(store: CampaignStore) {
    setCreating(false);
    setSelectedStoreId(store.id);
    setStoreName(store.name);
    setStoreDescription(store.description);
    setProprietorName(store.proprietorName||"");setProprietorDescription(store.proprietorDescription||"");setProprietorNpcId(store.proprietorNpcId||"");
    resetAddControls();
    setError("");
  }

  function toggleCatalogItem(id: string) {
    if (stockedCatalogIds.has(id)) return;
    setSelectedCatalogIds(current => current.includes(id)
      ? current.filter(currentId => currentId !== id)
      : [...current, id]);
  }

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/campaigns/${campaignId}/stores`, { cache: "no-store" })
      .then(async response => {
        const body = await response.json() as CampaignStoreManagementPayload & { error?: string };
        if (!response.ok || !Array.isArray(body.stores) || !Array.isArray(body.catalog) || !Array.isArray(body.campaignItems)) {
          throw new Error(body.error || "Campaign stores are unavailable.");
        }
        if (cancelled) return;
        setProprietorReady(Boolean(body.proprietorReady));
        setStores(body.stores);
        setCatalog(body.catalog);
        setCampaignItems(body.campaignItems);
        const preferred = body.stores.find(store => store.isActive) ?? body.stores[0] ?? null;
        setSelectedStoreId(preferred?.id ?? "");
        setStoreName(preferred?.name ?? "");
        setStoreDescription(preferred?.description ?? "");
        setProprietorName(preferred?.proprietorName??"");setProprietorDescription(preferred?.proprietorDescription??"");setProprietorNpcId(preferred?.proprietorNpcId??"");
        setCreating(body.stores.length === 0);
      })
      .catch(loadError => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Campaign stores are unavailable.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [campaignId]);

  async function createStore(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/stores`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: storeName, description: storeDescription, proprietorName, proprietorDescription, proprietorNpcId:proprietorNpcId||null }),
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

  async function addStoreToJournal() {
    if (!selectedStore || busy) return;
    setBusy(true); setError(""); setJournalNotice("");
    try {
      const url = "/api/campaigns/" + encodeURIComponent(campaignId) + "/journal";
      const response = await fetch(url, { cache: "no-store" });
      const result = await response.json() as {entries?: {id:string;title:string;content:string;kind:string;parentId?:string|null}[];error?:string};
      if (!response.ok || !Array.isArray(result.entries)) throw new Error(result.error || "Could not check existing Journal pages.");
      const marker = "<!-- twe-store:" + selectedStore.id + " -->";
      const duplicate = result.entries.find(page => page.kind === "page" && page.content.includes(marker));
      if (duplicate) {
        window.alert('This store is already in the Journal as "' + duplicate.title + '". No duplicate was created.');
        return;
      }
      const sameName = result.entries.find(page => page.kind === "page" && page.title.trim().toLocaleLowerCase() === selectedStore.name.trim().toLocaleLowerCase());
      if (sameName && !window.confirm('An article named "' + sameName.title + '" already exists. Create a separate store article?')) return;
      const content=marker+"\n\n"+storeJournalManagedContent(selectedStore)+"\n";
      const storesFolder = result.entries.find(page => page.kind === "folder" && !page.parentId && page.title.trim().toLocaleLowerCase() === "stores");
      const destinationId=locationId&&locations.some(e=>e.id===locationId)?locationId:storesFolder?.id;
      const create = await fetch(url, {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({kind:"page",title:selectedStore.name,content,icon:"warehouse",visibility:"gm",...(destinationId?{parentId:destinationId}:{})})});
      const created = await create.json() as {entry?:{id:string};error?:string};
      if (!create.ok || !created.entry) throw new Error(created.error || "Could not create the Journal page.");
      await loadPlacements();
      window.dispatchEvent(new CustomEvent("twe:campaign-data-changed",{detail:{campaignId,area:"journal"}}));
      setJournalNotice('Added "' + selectedStore.name + '" to the Journal (GM only).');
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not add store to Journal."); }
    finally { setBusy(false); }
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
      setProprietorName(body.store.proprietorName||"");setProprietorDescription(body.store.proprietorDescription||"");setProprietorNpcId(body.store.proprietorNpcId||"");
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
      resetAddControls();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Campaign store could not be deleted.");
    } finally {
      setBusy(false);
    }
  }

  async function postStoreItem(sourceItemId: string, cost: string, quantity: number | null, note = "") {
    if (!selectedStore) throw new Error("Choose a store first.");
    const response = await fetch(`/api/campaigns/${campaignId}/stores/${selectedStore.id}/items`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sourceType: "srd", sourceItemId, cost, quantity, note }),
    });
    const body = await response.json() as { item?: CampaignStoreItem; error?: string };
    if (!response.ok || !body.item) throw new Error(body.error || "Store item could not be added.");
    return body.item;
  }

  async function addCatalogSelection() {
    if (!selectedStore || !selectedCatalog.length) return;
    setBusy(true);
    setBulkProgress(0);
    setError("");
    const added: CampaignStoreItem[] = [];
    try {
      const quantity = bulkUnlimited ? null : Number(bulkQuantity);
      for (const choice of selectedCatalog) {
        if (stockedCatalogIds.has(choice.id)) continue;
        added.push(await postStoreItem(choice.id, choice.defaultCost, quantity));
        setBulkProgress(added.length);
      }
      if (added.length) {
        setStores(current => current.map(store => store.id === selectedStore.id
          ? { ...store, items: [...store.items, ...added].sort((left, right) => left.name.localeCompare(right.name)) }
          : store));
      }
      setSelectedCatalogIds([]);
    } catch (bulkError) {
      if (added.length) {
        setStores(current => current.map(store => store.id === selectedStore.id
          ? { ...store, items: [...store.items, ...added].sort((left, right) => left.name.localeCompare(right.name)) }
          : store));
      }
      const message = bulkError instanceof Error ? bulkError.message : "Catalog items could not be added.";
      setError(added.length ? `${message} ${added.length} item${added.length === 1 ? " was" : "s were"} added before the error.` : message);
    } finally {
      setBusy(false);
      setBulkProgress(0);
    }
  }

  async function addCustomItem(event: FormEvent) {
    event.preventDefault();
    if (!selectedStore) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/stores/${selectedStore.id}/items`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceType: "campaign",
          sourceItemId: customDraft.sourceItemId,
          cost: customDraft.cost,
          quantity: customDraft.unlimited ? null : Number(customDraft.quantity),
          note: customDraft.note,
        }),
      });
      const body = await response.json() as { item?: CampaignStoreItem; error?: string };
      if (!response.ok || !body.item) throw new Error(body.error || "Store item could not be added.");
      setStores(current => current.map(store => store.id === selectedStore.id
        ? { ...store, items: [...store.items, body.item as CampaignStoreItem].sort((left, right) => left.name.localeCompare(right.name)) }
        : store));
      setCustomDraft(blankCustomItem());
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
        resetAddControls();
        setError("");
      }}>New Store</button>
    </div>
    {journalNotice && <p className="campaign-notice" role="status">{journalNotice}</p>}
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
            {proprietorReady&&<fieldset className="campaign-store-proprietor"><legend>Proprietor (optional)</legend>
              <label className="gm-npc-notes"><span>Name</span><input maxLength={120} value={proprietorName} onChange={event=>setProprietorName(event.target.value)} placeholder="Shopkeeper name"/></label>
              <label className="gm-npc-notes"><span>Description</span><textarea maxLength={2000} value={proprietorDescription} onChange={event=>setProprietorDescription(event.target.value)} placeholder="Appearance, mannerisms, personality…"/></label>
              <label className="gm-npc-notes"><span>Link an existing NPC</span><select value={proprietorNpcId} onFocus={()=>{void fetch("/api/campaigns/"+encodeURIComponent(campaignId)+"/npcs",{cache:"no-store"}).then(r=>r.json()).then((v:unknown)=>{const data=v as {npcs?:{id:string;name:string;notes:string}[]};setNpcChoices(data.npcs||[]);}).catch(()=>{});}} onChange={event=>{const id=event.target.value;setProprietorNpcId(id);const npc=npcChoices.find(n=>n.id===id);if(npc&&!proprietorName)setProprietorName(npc.name);}}>
                <option value="">No linked NPC</option>{npcChoices.map(npc=><option key={npc.id} value={npc.id}>{npc.name}</option>)}
                {proprietorNpcId&&!npcChoices.some(n=>n.id===proprietorNpcId)&&<option value={proprietorNpcId}>Current linked NPC</option>}
              </select></label>
              {proprietorNpcId&&<details><summary>View linked NPC details</summary><JournalLinkedNpc campaignId={campaignId} npcId={proprietorNpcId}/></details>}
            </fieldset>}
          <button type="submit" className="campaign-primary" disabled={busy || !storeName.trim()}>Create Store</button>
        </form>}
        {!creating && selectedStore && <>
          <form className="gm-npc-form campaign-store-form" onSubmit={saveStore}>
            <div className="gm-npc-form-heading"><div><p className="campaign-kicker">{selectedStore.isActive ? "VISIBLE TO PARTY" : "GM ONLY"}</p><h3>{selectedStore.name}</h3></div><div className="campaign-store-editor-actions"><button type="button" className="campaign-secondary" disabled={busy} onClick={() => void addStoreToJournal()}>Add to Journal</button>{selectedStore.isActive ? <button type="button" className="campaign-quiet" disabled={busy} onClick={() => void setActive(false)}>Hide from Party</button> : <button type="button" className="campaign-primary" disabled={busy} onClick={() => void setActive(true)}>Make Visible to Party</button>}<button type="button" className="campaign-danger" disabled={busy} onClick={() => void removeStore()}>Delete Store</button></div></div>
            <label className="gm-npc-notes"><span>Store name</span><input required maxLength={80} value={storeName} onChange={event => setStoreName(event.target.value)} /></label>
            <label className="gm-npc-notes"><span>Description</span><textarea maxLength={2000} value={storeDescription} onChange={event => setStoreDescription(event.target.value)} placeholder="Merchant, atmosphere, and other details the party should see." /></label>
            <label className="gm-npc-notes"><span>Location (optional)</span><select disabled={busy||locationBusy} value={locationId} onChange={event=>void moveStoreLocation(event.target.value)}><option value="">No location — Stores folder</option>{locations.map(location=><option key={location.id} value={location.id}>{location.title}</option>)}</select></label>
            {proprietorReady&&<fieldset className="campaign-store-proprietor"><legend>Proprietor (optional)</legend>
              <label className="gm-npc-notes"><span>Name</span><input maxLength={120} value={proprietorName} onChange={event=>setProprietorName(event.target.value)} placeholder="Shopkeeper name"/></label>
              <label className="gm-npc-notes"><span>Description</span><textarea maxLength={2000} value={proprietorDescription} onChange={event=>setProprietorDescription(event.target.value)} placeholder="Appearance, mannerisms, personality…"/></label>
              <label className="gm-npc-notes"><span>Link an existing NPC</span><select value={proprietorNpcId} onFocus={()=>{void fetch("/api/campaigns/"+encodeURIComponent(campaignId)+"/npcs",{cache:"no-store"}).then(r=>r.json()).then((v:unknown)=>{const data=v as {npcs?:{id:string;name:string;notes:string}[]};setNpcChoices(data.npcs||[]);}).catch(()=>{});}} onChange={event=>{const id=event.target.value;setProprietorNpcId(id);const npc=npcChoices.find(n=>n.id===id);if(npc&&!proprietorName)setProprietorName(npc.name);}}>
                <option value="">No linked NPC</option>{npcChoices.map(npc=><option key={npc.id} value={npc.id}>{npc.name}</option>)}
                {proprietorNpcId&&!npcChoices.some(n=>n.id===proprietorNpcId)&&<option value={proprietorNpcId}>Current linked NPC</option>}
              </select></label>
              {proprietorNpcId&&<details><summary>View linked NPC details</summary><JournalLinkedNpc campaignId={campaignId} npcId={proprietorNpcId}/></details>}
            </fieldset>}
            <button type="submit" className="campaign-secondary" disabled={busy || !storeName.trim()}>Save Store Details</button>
          </form>
          <section className="campaign-store-stock">
            <div className="campaign-store-stock-heading"><div><p className="campaign-kicker">INVENTORY</p><h3>Store Inventory</h3><p>Browse the built-in catalog by category or source, inspect an item before stocking it, and select many items to add at once.</p></div><small>{selectedStore.items.length} stocked · {stockLabel(selectedStore.items.reduce<number | null>((total, item) => total === null || item.quantity === null ? null : total + item.quantity, 0))}</small></div>

            <div className="campaign-store-add-tabs" role="tablist" aria-label="Inventory source">
              <button type="button" role="tab" aria-selected={addSourceMode === "catalog"} className={addSourceMode === "catalog" ? "is-active" : ""} onClick={() => setAddSourceMode("catalog")}>Built-in Catalog</button>
              <button type="button" role="tab" aria-selected={addSourceMode === "campaign"} className={addSourceMode === "campaign" ? "is-active" : ""} onClick={() => setAddSourceMode("campaign")}>Campaign Custom Item</button>
            </div>

            {addSourceMode === "catalog" && <section className="campaign-store-catalog-browser" aria-label="Built-in store catalog">
              <div className="campaign-store-catalog-filters">
                <label><span>Category</span><select value={catalogCategory} onChange={event => setCatalogCategory(event.target.value)}><option value="">All categories</option>{categories.map(category => <option key={category} value={category}>{category}</option>)}</select></label>
                <label><span>Source</span><select value={catalogSource} onChange={event => setCatalogSource(event.target.value)}><option value="">All sources</option>{sources.map(source => <option key={source.value} value={source.value}>{source.label}</option>)}</select></label>
                <label className="campaign-store-catalog-search"><span>Search</span><input type="search" value={catalogQuery} onChange={event => setCatalogQuery(event.target.value)} placeholder="Name, description, stats…" /></label>
                <label className="campaign-store-hide-stocked"><input type="checkbox" checked={hideStocked} onChange={event => setHideStocked(event.target.checked)} /> Hide items already in this store</label>
              </div>

              <div className="campaign-store-catalog-toolbar">
                <span>{filteredCatalog.length} matching · <strong>{selectedCatalogIds.length} selected</strong></span>
                <div>
                  <button type="button" className="campaign-quiet" disabled={!filteredCatalog.some(item => !stockedCatalogIds.has(item.id))} onClick={() => {
                    const visibleIds = filteredCatalog.filter(item => !stockedCatalogIds.has(item.id)).map(item => item.id);
                    setSelectedCatalogIds(current => Array.from(new Set([...current, ...visibleIds])));
                  }}>Select all shown</button>
                  <button type="button" className="campaign-quiet" disabled={!selectedCatalogIds.length} onClick={() => setSelectedCatalogIds([])}>Clear selection</button>
                </div>
              </div>

              <div className="campaign-store-catalog-list">
                {!filteredCatalog.length && <p className="campaign-empty-copy">No catalog items match these filters.</p>}
                {filteredCatalog.map(item => {
                  const stocked = stockedCatalogIds.has(item.id);
                  const selected = selectedCatalogIds.includes(item.id);
                  return <article key={item.id} className={`campaign-store-catalog-card${selected ? " is-selected" : ""}${stocked ? " is-stocked" : ""}`}>
                    <div className="campaign-store-catalog-card-heading">
                      <label>
                        <input type="checkbox" checked={selected} disabled={stocked || busy} onChange={() => toggleCatalogItem(item.id)} />
                        <span><strong>{item.name}</strong><small>{item.category}{item.subcategory ? ` · ${item.subcategory}` : ""} · {kindLabel(item.kind)}</small></span>
                      </label>
                      <div><strong>{item.defaultCost}</strong>{stocked && <small>Already stocked</small>}</div>
                    </div>
                    <div className="campaign-store-catalog-badges"><span>{item.sourceLabel}</span><span>{item.license}</span></div>
                    <details className="campaign-store-catalog-details">
                      <summary>View description &amp; stats</summary>
                      <p>{item.details || "No additional description or statistics are available for this catalog entry."}</p>
                      <dl><div><dt>Price basis</dt><dd>{item.priceBasis}</dd></div><div><dt>Default price</dt><dd>{item.defaultCost}</dd></div></dl>
                    </details>
                  </article>;
                })}
              </div>

              <div className="campaign-store-bulk-add">
                <div><p><strong>{selectedCatalogIds.length}</strong> selected item{selectedCatalogIds.length === 1 ? "" : "s"}</p><small>Each item keeps its own default catalog price. You can edit prices individually after adding.</small></div>
                <label><span>Stock each</span><input required disabled={bulkUnlimited} type="number" min={0} max={1000000} value={bulkQuantity} onChange={event => setBulkQuantity(event.target.value)} /></label>
                <label className="campaign-store-unlimited"><input type="checkbox" checked={bulkUnlimited} onChange={event => setBulkUnlimited(event.target.checked)} /> Unlimited stock</label>
                <button type="button" className="campaign-primary" disabled={busy || !selectedCatalogIds.length || (!bulkUnlimited && (!bulkQuantity || Number(bulkQuantity) < 0))} onClick={() => void addCatalogSelection()}>{busy && selectedCatalogIds.length ? `Adding ${bulkProgress}/${selectedCatalogIds.length}…` : `Add ${selectedCatalogIds.length || "Selected"} to Store`}</button>
              </div>
            </section>}

            {addSourceMode === "campaign" && <form className="campaign-store-add-item" onSubmit={addCustomItem}>
              <label className="campaign-store-add-source"><span>Campaign item</span><select required value={customDraft.sourceItemId} onChange={event => setCustomDraft(current => ({ ...current, sourceItemId: event.target.value }))}><option value="">Choose a custom item…</option>{campaignItems.map(item => <option key={item.id} value={item.id}>{item.name} · {kindLabel(item.kind)}</option>)}</select>{!campaignItems.length && <small>Create a custom item in the Items tab first.</small>}</label>
              <label><span>Cost</span><input required maxLength={80} value={customDraft.cost} onChange={event => setCustomDraft(current => ({ ...current, cost: event.target.value }))} placeholder="For example, 20 sp" /></label>
              <label><span>Stock</span><input required disabled={customDraft.unlimited} type="number" min={0} max={1000000} value={customDraft.quantity} onChange={event => setCustomDraft(current => ({ ...current, quantity: event.target.value }))} /></label>
              <label className="campaign-store-unlimited"><input type="checkbox" checked={customDraft.unlimited} onChange={event => setCustomDraft(current => ({ ...current, unlimited: event.target.checked }))} /> Unlimited stock</label>
              <label className="campaign-store-item-note"><span>Shop note</span><input maxLength={1000} value={customDraft.note} onChange={event => setCustomDraft(current => ({ ...current, note: event.target.value }))} placeholder="Optional note visible to the party" /></label>
              {selectedCustomSource && <details className="campaign-store-custom-preview" open><summary>Description &amp; stats</summary>{selectedCustomSource.description && <p>{selectedCustomSource.description}</p>}{selectedCustomSource.details && <small>{selectedCustomSource.details}</small>}</details>}
              <button type="submit" className="campaign-primary" disabled={busy || !customDraft.sourceItemId || !customDraft.cost.trim() || (!customDraft.unlimited && (!customDraft.quantity || Number(customDraft.quantity) < 0))}>Add to Store</button>
            </form>}

            <div className="campaign-store-current-stock-heading">
              <div><p className="campaign-kicker">CURRENT STOCK</p><h3>{selectedStore.items.length} stocked items</h3></div>
              <input type="search" value={stockQuery} onChange={event => setStockQuery(event.target.value)} placeholder="Filter current stock…" aria-label="Filter current store stock" />
            </div>
            {!selectedStore.items.length && <p className="campaign-empty-copy">This store has no stocked items yet.</p>}
            {selectedStore.items.length > 0 && !filteredStock.length && <p className="campaign-empty-copy">No stocked items match that filter.</p>}
            <div className="campaign-store-managed-list">{filteredStock.map(item => <ManagedStoreItem key={item.id} item={item} busy={busy} onSave={(item, value) => void saveItem(item, value)} onDelete={item => void removeItem(item)} />)}</div>
          </section>
        </>}
      </div>
    </div>}
  </section>;
}