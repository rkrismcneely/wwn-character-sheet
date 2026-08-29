import type { LevelOneCreationCharacter } from "./character-creation.ts";
import {
  purchasableEquipmentById,
  startingEquipmentPackageById,
  type EquipmentKind,
} from "./equipment-data.ts";

export type CreationEquipmentMethod = "" | "package" | "buy";

export type CreationEquipmentBase = {
  armor: string;
  shield: string;
  readied: string[];
  stowed: string[];
  sp: number;
  cp: number;
};

export type CreationEquipmentFields = {
  creationEquipmentMethod: CreationEquipmentMethod;
  creationEquipmentPackage: string;
  creationStartingSilver: number | null;
  creationEquipmentPurchases: string[];
  creationEquipmentBase: CreationEquipmentBase | null;
};

type EquipmentState = Pick<
  LevelOneCreationCharacter,
  "armor" | "shield" | "readied" | "stowed" | "sp" | "cp"
> &
  CreationEquipmentFields;

export type CreationEquipmentUpdate = Pick<
  EquipmentState,
  | "armor"
  | "shield"
  | "readied"
  | "stowed"
  | "sp"
  | "cp"
  | "creationEquipmentMethod"
  | "creationEquipmentPackage"
  | "creationStartingSilver"
  | "creationEquipmentPurchases"
  | "creationEquipmentBase"
>;

export type CreationEquipmentResult =
  | { ok: true; update: CreationEquipmentUpdate }
  | { ok: false; reason: string };

const compact = (items: readonly string[]) =>
  items.filter((item) => typeof item === "string" && item.trim());
const money = (value: unknown) =>
  Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;

const snapshot = (state: EquipmentState): CreationEquipmentBase => ({
  armor: state.armor || "",
  shield: state.shield || "",
  readied: compact(state.readied),
  stowed: compact(state.stowed),
  sp: money(state.sp),
  cp: money(state.cp),
});

const baseFor = (state: EquipmentState) =>
  state.creationEquipmentBase || snapshot(state);

const withMoney = (
  base: CreationEquipmentBase,
  addedCopper: number,
): Pick<CreationEquipmentUpdate, "sp" | "cp"> => {
  const totalCopper = base.sp * 10 + base.cp + Math.max(0, addedCopper);
  return { sp: Math.floor(totalCopper / 10), cp: totalCopper % 10 };
};

const packageUpdate = (
  state: EquipmentState,
  packageId: string,
): CreationEquipmentUpdate => {
  const base = baseFor(state);
  const selected = startingEquipmentPackageById.get(packageId);
  return {
    armor: selected?.armor || base.armor,
    shield: selected?.shield || base.shield,
    readied: [...base.readied, ...(selected?.weapons || [])],
    stowed: [...base.stowed, ...(selected?.stowed || [])],
    ...withMoney(base, (selected?.silver || 0) * 10),
    creationEquipmentMethod: "package",
    creationEquipmentPackage: selected?.id || "",
    creationStartingSilver: state.creationStartingSilver,
    creationEquipmentPurchases: [],
    creationEquipmentBase: base,
  };
};

const buyUpdate = (
  state: EquipmentState,
  purchases = state.creationEquipmentPurchases,
): CreationEquipmentUpdate => {
  const base = baseFor(state);
  let armor = base.armor;
  let shield = base.shield;
  const readied = [...base.readied];
  const stowed = [...base.stowed];
  let spentCopper = 0;
  purchases.forEach((id) => {
    const item = purchasableEquipmentById.get(id);
    if (!item) return;
    spentCopper += item.costCopper;
    if (item.kind === "armor") armor = item.name;
    else if (item.kind === "shield") shield = item.name;
    else if (item.kind === "weapon") readied.push(item.name);
    else stowed.push(item.name);
  });
  const budgetCopper = (state.creationStartingSilver || 0) * 10;
  return {
    armor,
    shield,
    readied,
    stowed,
    ...withMoney(base, Math.max(0, budgetCopper - spentCopper)),
    creationEquipmentMethod: "buy",
    creationEquipmentPackage: "",
    creationStartingSilver: state.creationStartingSilver,
    creationEquipmentPurchases: purchases.filter((id) =>
      purchasableEquipmentById.has(id),
    ),
    creationEquipmentBase: base,
  };
};

export function selectCreationEquipmentMethod(
  state: EquipmentState,
  method: Exclude<CreationEquipmentMethod, "">,
): CreationEquipmentUpdate {
  if (state.creationEquipmentMethod === method)
    return {
      armor: state.armor,
      shield: state.shield,
      readied: [...state.readied],
      stowed: [...state.stowed],
      sp: state.sp,
      cp: state.cp,
      creationEquipmentMethod: state.creationEquipmentMethod,
      creationEquipmentPackage: state.creationEquipmentPackage,
      creationStartingSilver: state.creationStartingSilver,
      creationEquipmentPurchases: [...state.creationEquipmentPurchases],
      creationEquipmentBase: state.creationEquipmentBase,
    };
  const base = baseFor(state);
  const reset = {
    ...state,
    armor: base.armor,
    shield: base.shield,
    readied: [...base.readied],
    stowed: [...base.stowed],
    sp: base.sp,
    cp: base.cp,
    creationEquipmentMethod: method,
    creationEquipmentPackage: "",
    creationEquipmentPurchases: [],
    creationEquipmentBase: base,
  };
  return method === "buy" ? buyUpdate(reset) : packageUpdate(reset, "");
}

export function selectStartingEquipmentPackage(
  state: EquipmentState,
  packageId: string,
): CreationEquipmentResult {
  if (!startingEquipmentPackageById.has(packageId))
    return { ok: false, reason: "Choose one of the six starting packages." };
  return { ok: true, update: packageUpdate(state, packageId) };
}

export function rollCreationStartingSilver(
  state: EquipmentState,
  diceTotal: number,
): CreationEquipmentResult {
  if (state.creationEquipmentMethod !== "buy")
    return { ok: false, reason: "Choose Buy Equipment before rolling." };
  if (state.creationStartingSilver !== null)
    return {
      ok: false,
      reason: "Starting silver has already been rolled for this character.",
    };
  if (!Number.isInteger(diceTotal) || diceTotal < 3 || diceTotal > 18)
    return { ok: false, reason: "A 3d6 roll must total between 3 and 18." };
  const rolled = diceTotal * 10;
  return {
    ok: true,
    update: buyUpdate({ ...state, creationStartingSilver: rolled }, []),
  };
}

export function creationEquipmentSpentCopper(state: EquipmentState) {
  return state.creationEquipmentPurchases.reduce(
    (total, id) =>
      total + (purchasableEquipmentById.get(id)?.costCopper || 0),
    0,
  );
}

export function creationEquipmentRemainingCopper(state: EquipmentState) {
  return Math.max(
    0,
    (state.creationStartingSilver || 0) * 10 -
      creationEquipmentSpentCopper(state),
  );
}

export function purchaseCreationEquipment(
  state: EquipmentState,
  itemId: string,
): CreationEquipmentResult {
  if (state.creationEquipmentMethod !== "buy" || state.creationStartingSilver === null)
    return { ok: false, reason: "Roll starting silver before buying equipment." };
  const item = purchasableEquipmentById.get(itemId);
  if (!item) return { ok: false, reason: "Choose a canonical equipment item." };
  if (
    (item.kind === "armor" || item.kind === "shield") &&
    state.creationEquipmentPurchases.some(
      (id) => purchasableEquipmentById.get(id)?.kind === item.kind,
    )
  )
    return {
      ok: false,
      reason: `Remove the purchased ${item.kind} before choosing another.`,
    };
  if (item.costCopper > creationEquipmentRemainingCopper(state))
    return { ok: false, reason: "That item costs more than the remaining silver." };
  const purchases = [...state.creationEquipmentPurchases, item.id];
  return { ok: true, update: buyUpdate(state, purchases) };
}

export function removeCreationEquipmentPurchase(
  state: EquipmentState,
  purchaseIndex: number,
): CreationEquipmentResult {
  if (
    state.creationEquipmentMethod !== "buy" ||
    purchaseIndex < 0 ||
    purchaseIndex >= state.creationEquipmentPurchases.length
  )
    return { ok: false, reason: "That purchase is no longer available." };
  const purchases = state.creationEquipmentPurchases.filter(
    (_, index) => index !== purchaseIndex,
  );
  return { ok: true, update: buyUpdate(state, purchases) };
}

export function creationEquipmentKindAlreadyPurchased(
  state: EquipmentState,
  kind: EquipmentKind,
) {
  return state.creationEquipmentPurchases.some(
    (id) => purchasableEquipmentById.get(id)?.kind === kind,
  );
}

export function normalizeCreationEquipmentFields(
  incoming: Partial<CreationEquipmentFields>,
): CreationEquipmentFields {
  const method = ["package", "buy"].includes(incoming.creationEquipmentMethod || "")
    ? (incoming.creationEquipmentMethod as CreationEquipmentMethod)
    : "";
  const startingSilver = Number(incoming.creationStartingSilver);
  const base = incoming.creationEquipmentBase;
  return {
    creationEquipmentMethod: method,
    creationEquipmentPackage:
      typeof incoming.creationEquipmentPackage === "string"
        ? incoming.creationEquipmentPackage
        : "",
    creationStartingSilver:
      incoming.creationStartingSilver !== null &&
      Number.isInteger(startingSilver) &&
      startingSilver >= 30 &&
      startingSilver <= 180
        ? startingSilver
        : null,
    creationEquipmentPurchases: Array.isArray(incoming.creationEquipmentPurchases)
      ? incoming.creationEquipmentPurchases.filter(
          (id): id is string =>
            typeof id === "string" && purchasableEquipmentById.has(id),
        )
      : [],
    creationEquipmentBase:
      base &&
      Array.isArray(base.readied) &&
      Array.isArray(base.stowed)
        ? {
            armor: typeof base.armor === "string" ? base.armor : "",
            shield: typeof base.shield === "string" ? base.shield : "",
            readied: compact(base.readied),
            stowed: compact(base.stowed),
            sp: money(base.sp),
            cp: money(base.cp),
          }
        : null,
  };
}

export function creationEquipmentChoiceIsComplete(state: EquipmentState) {
  if (state.creationEquipmentMethod === "package")
    return startingEquipmentPackageById.has(state.creationEquipmentPackage);
  if (state.creationEquipmentMethod === "buy")
    return state.creationStartingSilver !== null;
  return false;
}
