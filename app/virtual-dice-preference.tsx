"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  DEFAULT_DICE_STYLE,
  DICE_STYLE_OPTIONS,
  isDiceStyleId,
  type DiceStyleId,
} from "./virtual-dice-style";

export const VIRTUAL_DICE_STORAGE_KEY = "wwn-virtual-dice";
export const DICE_STYLE_STORAGE_KEY = "wwn-dice-style";

function readPreference(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(VIRTUAL_DICE_STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  function onStorage(event: StorageEvent) {
    if (event.key === VIRTUAL_DICE_STORAGE_KEY) listener();
  }
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function writePreference(enabled: boolean) {
  try {
    window.localStorage.setItem(VIRTUAL_DICE_STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    // Rolling remains available even when browser-local preferences are blocked.
  }
  listeners.forEach(listener => listener());
}

function readDiceStylePreference(): DiceStyleId {
  if (typeof window === "undefined") return DEFAULT_DICE_STYLE;
  try {
    const stored = window.localStorage.getItem(DICE_STYLE_STORAGE_KEY);
    return stored && isDiceStyleId(stored) ? stored : DEFAULT_DICE_STYLE;
  } catch {
    return DEFAULT_DICE_STYLE;
  }
}

const diceStyleListeners = new Set<() => void>();

function subscribeToDiceStyle(listener: () => void) {
  diceStyleListeners.add(listener);
  function onStorage(event: StorageEvent) {
    if (event.key === DICE_STYLE_STORAGE_KEY) listener();
  }
  window.addEventListener("storage", onStorage);
  return () => {
    diceStyleListeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function writeDiceStylePreference(style: DiceStyleId) {
  try {
    window.localStorage.setItem(DICE_STYLE_STORAGE_KEY, style);
  } catch {
    // Dice retain the safe default style when browser-local preferences are blocked.
  }
  diceStyleListeners.forEach(listener => listener());
}

export function useVirtualDicePreference() {
  const enabled = useSyncExternalStore(subscribe, readPreference, () => false);
  const setEnabled = useCallback((next: boolean) => writePreference(next), []);
  return { enabled, setEnabled };
}

export function useDiceStylePreference() {
  const style = useSyncExternalStore(
    subscribeToDiceStyle,
    readDiceStylePreference,
    () => DEFAULT_DICE_STYLE,
  );
  const setStyle = useCallback((next: DiceStyleId) => writeDiceStylePreference(next), []);
  return { style, setStyle };
}

export function VirtualDiceSelect({
  id,
  describedBy,
}: {
  id: string;
  describedBy?: string;
}) {
  const { enabled, setEnabled } = useVirtualDicePreference();

  return (
    <>
      <label htmlFor={id}>Virtual Dice</label>
      <select
        id={id}
        value={enabled ? "on" : "off"}
        onChange={event => setEnabled(event.target.value === "on")}
        aria-describedby={describedBy}
      >
        <option value="off">Off</option>
        <option value="on">On</option>
      </select>
    </>
  );
}

export function DiceStyleSelect({
  id,
  describedBy,
}: {
  id: string;
  describedBy?: string;
}) {
  const { style, setStyle } = useDiceStylePreference();

  return (
    <>
      <label htmlFor={id}>Dice Style</label>
      <select
        id={id}
        value={style}
        onChange={event => setStyle(
          isDiceStyleId(event.target.value) ? event.target.value : DEFAULT_DICE_STYLE,
        )}
        aria-describedby={describedBy}
      >
        {DICE_STYLE_OPTIONS.map(option => (
          <option key={option.id} value={option.id}>{option.label}</option>
        ))}
      </select>
    </>
  );
}
