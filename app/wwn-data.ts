// Canonical WWN data surface used by the character sheet.
// The source file preserves the imported SRD extraction verbatim; normalize
// known extraction quirks here so saved character values use the real rule name.
import {
  foci as importedFoci,
  highMagic,
  highMageArts,
  weapons,
} from "./wwn-data-source.ts";

export const foci = importedFoci.map((focus) =>
  focus.name === "Cultured Through"
    ? { ...focus, name: "Cultured" as const }
    : focus,
);

export { highMagic, highMageArts, weapons };
