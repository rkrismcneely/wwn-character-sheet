"use client";

import { useEffect, useRef, useState } from "react";
import type { CampaignSharedRoll } from "@/lib/campaigns/live-session";
import { useDisplayTheme } from "../theme-provider";
import { VirtualDiceOverlay, type VirtualDiceOverlayHandle } from "../virtual-dice-overlay";
import { useDiceStylePreference, useVirtualDicePreference } from "../virtual-dice-preference";
import { readRollHistory } from "../roll-history";
import { campaignSharedRollEvent, useCampaignLiveSession } from "./use-live-session";

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

/**
 * Shared campaign rolls animate on the map using the viewer's existing account
 * Virtual Dice and dice-style preferences. This renders no extra map toolbar
 * toggle and does not override another user's animation preferences.
 */
export function CampaignMapSharedDice({
  campaignId,
  open,
  canManage,
}: {
  campaignId: string;
  open: boolean;
  canManage: boolean;
}) {
  const overlay = useRef<VirtualDiceOverlayHandle>(null);
  const seenRollIds = useRef(new Set<string>());
  const animationQueue = useRef<Promise<void>>(Promise.resolve());
  const [reducedMotion, setReducedMotion] = useState(false);
  const { theme } = useDisplayTheme();
  const { enabled: virtualDiceEnabled } = useVirtualDicePreference();
  const { style } = useDiceStylePreference();

  // The map establishes its own session connection even when the character
  // sheet or GM Console is not on the current page.
  useCampaignLiveSession(campaignId, open);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(media.matches);
    sync();
    media.addEventListener?.("change", sync);
    return () => media.removeEventListener?.("change", sync);
  }, []);

  useEffect(() => {
    if (!open || !virtualDiceEnabled || reducedMotion) return;
    const onSharedRoll = (event: Event) => {
      const detail = (event as CustomEvent<SharedRollEventDetail>).detail;
      const roll = detail?.roll;
      if (detail?.campaignId !== campaignId || !roll || seenRollIds.current.has(roll.id)) return;

      // The initiating GM Console already animates its own NPC rolls. Players
      // should still see the published result when their preference allows it.
      if (canManage && roll.character.id === "npc") {
        seenRollIds.current.add(roll.id);
        return;
      }

      // Do not reanimate a roll already shown on this tab's character sheet.
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
  }, [campaignId, canManage, open, reducedMotion, style, virtualDiceEnabled]);

  useEffect(() => () => overlay.current?.cancel(), []);

  return <VirtualDiceOverlay ref={overlay} theme={theme} />;
}
