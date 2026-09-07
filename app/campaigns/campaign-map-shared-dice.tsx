"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CampaignSharedRoll } from "@/lib/campaigns/live-session";
import { useDisplayTheme } from "../theme-provider";
import { VirtualDiceOverlay, type VirtualDiceOverlayHandle } from "../virtual-dice-overlay";
import { useDiceStylePreference, useVirtualDicePreference } from "../virtual-dice-preference";
import { readRollHistory } from "../roll-history";
import { campaignMapChangedEvent, campaignSharedRollEvent, useCampaignLiveSession } from "./use-live-session";

type InteractionResponse = {
  interactions?: { sharedRollDiceEnabled?: boolean };
  error?: string;
};

type SharedRollEventDetail = {
  campaignId?: string;
  sessionId?: string;
  roll?: CampaignSharedRoll;
};

function rollDice(roll: CampaignSharedRoll) {
  const { count, sides, results } = roll.dice;
  if (!Number.isSafeInteger(count) || count < 1 || results.length !== count) return null;
  if (!Number.isSafeInteger(sides) || sides < 2) return null;
  if (results.some(value => !Number.isSafeInteger(value) || value < 1 || value > sides)) return null;
  return results.map(value => ({ sides, value }));
}

function locallyAnimatedRoll(rollId: string): boolean {
  return readRollHistory().some(entry => entry.id === rollId);
}

export function CampaignMapSharedDice({
  campaignId,
  mapId,
  open,
  canManage,
}: {
  campaignId: string;
  mapId: string;
  open: boolean;
  canManage: boolean;
}) {
  const overlay = useRef<VirtualDiceOverlayHandle>(null);
  const seenRollIds = useRef(new Set<string>());
  const animationQueue = useRef<Promise<void>>(Promise.resolve());
  const [sharedRollDiceEnabled, setSharedRollDiceEnabled] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { theme } = useDisplayTheme();
  const { enabled: virtualDiceEnabled } = useVirtualDicePreference();
  const { style } = useDiceStylePreference();

  // The map establishes its own live-session connection while open. This keeps
  // map dice route-independent even when another page panel is not connected to
  // this campaign (for example, a character linked to multiple active games).
  useCampaignLiveSession(campaignId, open);

  const loadPreference = useCallback(async () => {
    try {
      const params = new URLSearchParams({ mapId });
      const response = await fetch(`/api/campaigns/${campaignId}/map/interactions?${params.toString()}`, { cache: "no-store" });
      const body = await response.json() as InteractionResponse;
      if (!response.ok || !body.interactions) throw new Error(body.error || "Live dice settings could not be loaded.");
      setSharedRollDiceEnabled(body.interactions.sharedRollDiceEnabled !== false);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Live dice settings could not be loaded.");
    }
  }, [campaignId, mapId]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadPreference(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [loadPreference]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(media.matches);
    sync();
    media.addEventListener?.("change", sync);
    return () => media.removeEventListener?.("change", sync);
  }, []);

  useEffect(() => {
    const onMapChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ campaignId?: string }>).detail;
      if (detail?.campaignId === campaignId) void loadPreference();
    };
    window.addEventListener(campaignMapChangedEvent, onMapChanged);
    return () => window.removeEventListener(campaignMapChangedEvent, onMapChanged);
  }, [campaignId, loadPreference]);

  useEffect(() => {
    if (!open || !sharedRollDiceEnabled || !virtualDiceEnabled || reducedMotion) return;
    const onSharedRoll = (event: Event) => {
      const detail = (event as CustomEvent<SharedRollEventDetail>).detail;
      const roll = detail?.roll;
      if (detail?.campaignId !== campaignId || !roll || seenRollIds.current.has(roll.id)) return;

      // A character-sheet roll is animated before it is published to the live
      // session, and is written to this tab's roll history before the publish
      // event comes back through the map. Treat that ID as already animated so
      // opening the map cannot replay the exact same local roll a second time.
      if (locallyAnimatedRoll(roll.id)) {
        seenRollIds.current.add(roll.id);
        return;
      }

      const dice = rollDice(roll);
      if (!dice) return;
      if (seenRollIds.current.size >= 100) seenRollIds.current.clear();
      seenRollIds.current.add(roll.id);
      animationQueue.current = animationQueue.current
        .catch(() => undefined)
        .then(async () => {
          try {
            await overlay.current?.roll({ dice, style });
          } catch {
            overlay.current?.cancel();
          }
        });
    };
    window.addEventListener(campaignSharedRollEvent, onSharedRoll);
    return () => window.removeEventListener(campaignSharedRollEvent, onSharedRoll);
  }, [campaignId, open, reducedMotion, sharedRollDiceEnabled, style, virtualDiceEnabled]);

  useEffect(() => () => overlay.current?.cancel(), []);

  async function toggleSharedRollDice() {
    const enabled = !sharedRollDiceEnabled;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/map/interactions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "set_shared_roll_dice", mapId, enabled }),
      });
      const body = await response.json() as InteractionResponse;
      if (!response.ok || !body.interactions) throw new Error(body.error || "Live dice settings could not be updated.");
      setSharedRollDiceEnabled(body.interactions.sharedRollDiceEnabled !== false);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Live dice settings could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  const title = error || (virtualDiceEnabled
    ? "Animate each published campaign roll using its already-authoritative dice results."
    : "Shared map dice are enabled, but this browser's Virtual Dice preference is Off.");

  return <>
    <VirtualDiceOverlay ref={overlay} theme={theme} />
    {canManage && <button
      type="button"
      className={sharedRollDiceEnabled ? "campaign-primary" : "campaign-secondary"}
      disabled={busy}
      aria-pressed={sharedRollDiceEnabled}
      title={title}
      onClick={() => void toggleSharedRollDice()}
    >Live Dice: {sharedRollDiceEnabled ? "On" : "Off"}</button>}
  </>;
}
