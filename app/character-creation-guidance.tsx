"use client";

import { useState } from "react";
import "./character-creation-guidance.css";

export const classPlayDescriptions: Record<string, string> = {
  Warrior:
    "A durable front-line combatant built to hit reliably, survive danger, and make weapon attacks count.",
  Expert:
    "A versatile problem-solver who excels at skills, exploration, social challenges, and other non-combat expertise.",
  "High Mage":
    "A classic spellcaster with broad High Magic access, trading durability for flexible and powerful prepared spells.",
  Elementalist:
    "An elemental spellcaster who combines High Magic with fire, frost, stone, wind, and other battlefield-shaping Arts.",
  Necromancer:
    "A grim spellcaster who manipulates death, corpses, life force, and undead servants alongside High Magic.",
  Invoker:
    "A flexible caster who spends spell points instead of fixed spell slots and can broaden into another magical tradition.",
  Healer:
    "A supernatural medic focused on restoring allies, removing injuries and conditions, and keeping a party alive.",
  Vowed:
    "A disciplined unarmed mystic who fights without conventional armor and develops supernatural martial techniques.",
  Accursed:
    "A magically cursed warrior who turns an eldritch blade or bolt and dark supernatural powers against their foes.",
  Bard:
    "A charismatic support specialist whose performances, social talents, and Arts manipulate morale, attention, and influence.",
  Beastmaster:
    "A companion-focused adventurer who forms a supernatural bond with beasts and grows stronger through that partnership.",
  "Blood Priest":
    "A miracle-working divine adept who supports allies with blessings, healing, protection, and sacred authority.",
  Duelist:
    "A mobile weapon specialist built around a favored melee weapon, precision, and one-on-one martial techniques.",
  Mageslayer:
    "An anti-magic hunter whose fixed Arts are devoted to finding, resisting, and destroying spellcasters.",
  Skinshifter:
    "A shapeshifting adventurer who assumes alternate forms and customizes them with supernatural physical abilities.",
  "Thought Noble":
    "A psychic adept who reads, influences, and assaults minds through a steadily expanding set of telepathic Arts.",
  Wise:
    "A concept-driven occult or learned specialist whose Arts represent a particular role such as priest, witch, seer, or sage.",
};

export function ruleSummary(text: string) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  const sentence = cleaned.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim();
  return sentence || cleaned;
}

export function focusFullRules(focus: {
  intro?: string;
  level1?: string;
  level2?: string;
}) {
  return [
    focus.intro?.trim(),
    focus.level1?.trim() ? `Level 1: ${focus.level1.trim()}` : "",
    focus.level2?.trim() ? `Level 2: ${focus.level2.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function SelectionRuleHelp({
  label,
  fullText,
}: {
  label: string;
  fullText: string;
}) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pinned, setPinned] = useState(false);
  const open = hovered || focused || pinned;
  if (!label || !fullText.trim()) return null;

  return (
    <span
      className="creation-rule-help"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        className="creation-rule-help-button"
        aria-label={`Show full rules for ${label}`}
        aria-expanded={open}
        title={`Full rules for ${label}`}
        onClick={(event) => {
          if (pinned) {
            setPinned(false);
            event.currentTarget.blur();
          } else {
            setPinned(true);
          }
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          setPinned(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setPinned(false);
            setFocused(false);
            event.currentTarget.blur();
          }
        }}
      >
        ?
      </button>
      {open && (
        <span className="creation-rule-help-panel" role="tooltip">
          <strong>{label}</strong>
          {fullText.split(/\n\n+/).map((paragraph, index) => (
            <span key={index}>{paragraph}</span>
          ))}
        </span>
      )}
    </span>
  );
}
