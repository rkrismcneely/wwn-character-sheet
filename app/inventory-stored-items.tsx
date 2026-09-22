"use client";

import { useEffect, useState } from "react";
import {
  adventuringGear,
  gearBundles,
  inventoryArmors,
  inventoryWeapons,
} from "./equipment-data";
import {
  campaignInventorySnapshot,
  campaignInventoryValue,
  campaignInventoryKindLabel,
  inventoryItemDisplayName,
  inventoryItemDescription,
  type CampaignInventoryItemSnapshot,
} from "@/lib/inventory/items";

export type CampaignInventoryOption = CampaignInventoryItemSnapshot & {
  campaignName: string;
};

export function useCampaignInventoryItems(
  characterId: string | null,
  campaigns: readonly { id: string; name: string }[],
  enabled: boolean,
) {
  const [items, setItems] = useState<CampaignInventoryOption[]>([]);
  const [error, setError] = useState("");
  const active = enabled && Boolean(characterId) && campaigns.length > 0;

  useEffect(() => {
    let cancelled = false;
    if (!active || !characterId) return () => { cancelled = true; };
    void Promise.all(campaigns.map(async campaign => {
      const response = await fetch(
        `/api/campaigns/${encodeURIComponent(campaign.id)}/items?characterId=${encodeURIComponent(characterId)}`,
        { cache: "no-store" },
      );
      const body = await response.json() as { items?: CampaignInventoryItemSnapshot[]; error?: string };
      if (!response.ok || !Array.isArray(body.items)) {
        throw new Error(body.error || `Items from ${campaign.name} are unavailable.`);
      }
      return body.items.map(item => ({ ...item, campaignName: campaign.name }));
    })).then(groups => {
      if (!cancelled) {
        setItems(groups.flat());
        setError("");
      }
    }).catch(loadError => {
      if (!cancelled) {
        setItems([]);
        setError(loadError instanceof Error ? loadError.message : "Campaign items are unavailable.");
      }
    });
    return () => { cancelled = true; };
  }, [active, campaigns, characterId]);

  return active ? { items, error } : { items: [], error: "" };
}

export function CampaignInventoryOptions({ items }: { items: readonly CampaignInventoryOption[] }) {
  if (!items.length) return null;
  return <optgroup label="Campaign Items">
    {items.map(item => <option key={`${item.campaignId}-${item.id}`} value={campaignInventoryValue(item)}>
      {item.name} · {campaignInventoryKindLabel(item.kind)} · {item.campaignName}
    </option>)}
  </optgroup>;
}

export function StoredItemsSection({
  items,
  campaignItems,
  customItems,
  campaignError,
  onChange,
  onStow,
}: {
  items: readonly string[];
  campaignItems: readonly CampaignInventoryOption[];
  customItems: readonly string[];
  campaignError?: string;
  onChange: (items: string[]) => void;
  onStow: (index: number) => void;
}) {
  const compact = items.filter(item => typeof item === "string" && item.trim());
  const slots = [...compact, ""];
  const [otherIndex, setOtherIndex] = useState<number | null>(null);
  const [otherDraft, setOtherDraft] = useState("");

  function setItem(index: number, value: string) {
    const next = [...compact];
    if (index >= next.length) {
      if (value.trim()) next.push(value);
    } else if (value.trim()) {
      next[index] = value;
    } else {
      next.splice(index, 1);
    }
    onChange(next);
  }

  function drop(index: number, item: string) {
    if (!window.confirm(`Drop ${inventoryItemDisplayName(item)}?\n\nThis removes it from the character’s inventory.`)) return;
    onChange(compact.filter((_, itemIndex) => itemIndex !== index));
    setOtherIndex(null);
    setOtherDraft("");
  }

  return <section className="sheet-section stored-items-section">
    <header><h2>Stored Items</h2></header>
    <div className="section-aside"><span className="caption">Unlimited storage · does not count against Strength</span></div>
    <div className="section-body">
      <p className="section-intro">Items left at a safe location, cache, home, vehicle, or other off-person storage. Move an item back to Stowed when the character carries it again.</p>
      {campaignError && <p className="campaign-item-load-error" role="status">{campaignError}</p>}
      {slots.map((item, index) => {
        const campaignItem = campaignInventorySnapshot(item);
        const editingOther = otherIndex === index;
        const campaignStillAvailable = Boolean(campaignItem && campaignItems.some(candidate => campaignInventoryValue(candidate) === item));
        return <div className="inventory-item-row stored-item-row" key={`${index}-${campaignItem?.id ?? item}`}>
          <label className="field">
            <span>{index < compact.length ? index + 1 : "Add item"}</span>
            <select value={editingOther ? "__other__" : item} aria-label={`Stored item ${index + 1}`} onChange={event => {
              if (event.target.value === "__other__") {
                setOtherIndex(index);
                setOtherDraft("");
              } else {
                setOtherIndex(null);
                setOtherDraft("");
                setItem(index, event.target.value);
              }
            }}>
              <option value="">Choose an item…</option>
              <option value="__other__">Other…</option>
              {campaignItem && !campaignStillAvailable && <option value={item}>{inventoryItemDisplayName(item)} · Campaign item</option>}
              <CampaignInventoryOptions items={campaignItems} />
              {customItems.length > 0 && <optgroup label="Custom Items">{customItems.map(customItem => <option key={customItem} value={customItem}>{customItem}</option>)}</optgroup>}
              <optgroup label="Weapons">{inventoryWeapons.map(weapon => <option key={weapon.name} value={weapon.name}>{weapon.name}</option>)}</optgroup>
              <optgroup label="Armor & Shields">{inventoryArmors.map(armor => <option key={armor} value={armor}>{armor}</option>)}<option>Small Shield</option><option>Large Shield</option></optgroup>
              <optgroup label="Adventuring Gear">{adventuringGear.map(gear => <option key={gear.name} value={gear.name}>{gear.name}</option>)}</optgroup>
              <optgroup label="Gear Bundles">{gearBundles.map(bundle => <option key={bundle.name} value={bundle.name}>{bundle.name}</option>)}</optgroup>
            </select>
            {!editingOther && campaignItem && <small className="campaign-item-description"><strong>{campaignInventoryKindLabel(campaignItem.kind)}</strong>{inventoryItemDescription(item) ? ` · ${inventoryItemDescription(item)}` : ""}</small>}
          </label>
          {editingOther && <div className="custom-item-entry">
            <input autoFocus aria-label={`Other stored item ${index + 1}`} placeholder="Type item name…" value={otherDraft} onChange={event => setOtherDraft(event.target.value)} onKeyDown={event => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              const name = otherDraft.trim();
              if (!name) return;
              setItem(index, name);
              setOtherIndex(null);
              setOtherDraft("");
            }} />
            <button type="button" className="custom-item-save" disabled={!otherDraft.trim()} onClick={() => {
              const name = otherDraft.trim();
              if (!name) return;
              setItem(index, name);
              setOtherIndex(null);
              setOtherDraft("");
            }}>Save</button>
          </div>}
          {item && !editingOther && <span className="inventory-item-actions"><button type="button" className="drop-item" onClick={() => onStow(index)}>Stow</button><button type="button" className="drop-item" onClick={() => drop(index, item)}>Drop</button></span>}
        </div>;
      })}
    </div>
  </section>;
}
