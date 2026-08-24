"use client";

import { useCallback, useSyncExternalStore } from "react";

export const VIRTUAL_DICE_STORAGE_KEY = "wwn-virtual-dice";

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

export function useVirtualDicePreference() {
  const enabled = useSyncExternalStore(subscribe, readPreference, () => false);
  const setEnabled = useCallback((next: boolean) => writePreference(next), []);
  return { enabled, setEnabled };
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
