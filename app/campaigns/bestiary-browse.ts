import { createElement } from "react";
import type { BuiltInBestiaryCreature } from "../../lib/campaigns/bestiary";

export function BestiaryBrowseItem({ creature, selected, onSelect }: { creature: BuiltInBestiaryCreature; selected: boolean; onSelect: () => void }) {
  const primaryAttack = creature.attacks[0];
  return createElement(
    "li",
    null,
    createElement(
      "button",
      { type: "button", className: "gm-bestiary-row", "aria-current": selected ? "true" : undefined, onClick: onSelect },
      createElement(
        "span",
        { className: "gm-bestiary-row-copy" },
        createElement("strong", null, creature.name),
        createElement("span", null, creature.description),
      ),
      createElement(
        "span",
        { className: "gm-bestiary-row-stats" },
        createElement("span", null, `${creature.sourceStats.hitDice} HD · AC ${creature.armorClass}`),
        createElement("span", null, `HP ${creature.hpMax}`),
        primaryAttack ? createElement("span", null, primaryAttack.damage) : null,
      ),
    ),
  );
}
