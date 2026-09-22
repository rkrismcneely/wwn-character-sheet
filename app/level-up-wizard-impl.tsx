"use client";

import { useEffect, useMemo, useState } from "react";
import { artSlots, casterLimits, dualCasterLimits, forcedArtsForTraditions, invokerLimits, traditionInfo, traditionSpells, type TraditionName } from "./class-data";
import {
  artSelectionName,
  artSelectionValue,
  artChoiceDefinition,
  artChoiceIsComplete,
  artChoiceKey,
  artChoiceValues,
  creationFocusBonusSkill,
  creationFocusChoiceOptions,
  creationSkillSources,
  creationSkills,
  type LevelOneCreationCharacter,
} from "./character-creation";
import { rollDice } from "./dice";
import {
  advancementClassPerDieBonus,
  advancementFocusOptionLabel,
  attributeImprovementCostForCount,
  attributeImprovementCostForNext,
  advancementPlan,
  advancementSkillCreditBySkill,
  legalAdvancementFocuses,
  levelUpHitPointRollBounds,
  levelUpHitPointTotal,
  skillAdvancementCost,
  validLevelUpHitPointRoll,
  type AdvancementCharacter,
} from "./level-advancement";
import { deriveSkillProfile, missingArtPrerequisite, storedRankForDisplayedSkillRank } from "./phase2-rules";
import { foci, highMageArts, highMagic } from "./wwn-data";
import { beastmasterArtAvailableForBond } from "./beastmaster-companion";
import { focusFullRules, SelectionRuleHelp } from "./character-creation-guidance";
import { plainLanguageSummary } from "./plain-language";
import "./character-creation-wizard.css";

type WizardCharacter = LevelOneCreationCharacter & {
  strainCurrent?: number;
  levelUpUnspentSkillPoints?: number;
  artEffort?: number[];
};

type Props = {
  sheet: WizardCharacter;
  persistenceKey: string;
  canEdit: boolean;
  onCancel: () => void;
  onFinish: (character: WizardCharacter, sourceLevel: number) => Promise<boolean>;
};

type DraftState = { sourceLevel: number; step: number; draft: WizardCharacter; hpRoll?: number };
const storageKey = (key: string) => `twe-level-up:${key}`;
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const attributes = ["STR", "DEX", "CON", "INT", "WIS", "CHA"] as const;
const skillLabel = (rank: number) => rank < 0 ? "Untrained" : `+${rank}`;

function StepTitle({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) {
  return <header className="creation-step-title"><p>{eyebrow}</p><h2>{title}</h2>{children && <p>{children}</p>}</header>;
}

function modifier(score: number) {
  return score <= 3 ? -2 : score <= 7 ? -1 : score <= 13 ? 0 : score <= 17 ? 1 : 2;
}

function traditionalEducationTradition(character: WizardCharacter): TraditionName | null {
  const choice = character.focusPicks.find((pick) => pick.name === "Traditional Education")?.choice;
  return choice && choice in traditionInfo ? choice as TraditionName : null;
}

function magicTraditions(character: WizardCharacter) {
  const classes = character.classMode === "adventurer" ? [character.classOne, character.classTwo] : [character.classOne];
  const education = traditionalEducationTradition(character);
  return [...classes, ...(education ? [education] : [])]
    .filter((name): name is TraditionName => name in traditionInfo)
    .filter((name, index, all) => all.indexOf(name) === index);
}

function artChoices(character: WizardCharacter, targetLevel: number) {
  return magicTraditions(character).flatMap((tradition) => (tradition === "High Mage" ? highMageArts : traditionInfo[tradition].arts)
    .filter((art) => tradition !== "Beastmaster" || beastmasterArtAvailableForBond(art.name, character.beastmasterBond))
    .map((art) => ({ ...art, tradition, value: artSelectionValue(tradition, art.name), minLevel: "minLevel" in art ? art.minLevel : undefined }))
    .filter((art) => (art.minLevel || 1) <= targetLevel));
}

function spellChoices(character: WizardCharacter, targetLevel: number) {
  const classTraditions = (character.classMode === "adventurer" ? [character.classOne, character.classTwo] : [character.classOne])
    .filter((name): name is TraditionName => name in traditionInfo);
  const traditions = classTraditions
    .filter((tradition) => traditionInfo[tradition].spells);
  const education = traditionalEducationTradition(character);
  const intModifier = modifier(character.attrs.INT || 0);
  const limits = traditions.includes("Invoker") && traditions.length === 1
    ? invokerLimits(targetLevel, character.classMode === "adventurer", intModifier)
    : traditions.length > 1 ? dualCasterLimits(targetLevel)
      : traditions.length ? casterLimits(targetLevel, character.classMode === "adventurer")
        : { max: 0 };
  const options = [
    ...(traditions.length > 0 || education ? highMagic.map((spell) => ({ ...spell, tradition: "High Magic" })) : []),
    ...(traditions.includes("Elementalist") || education === "Elementalist" ? traditionSpells.Elementalist.map((spell) => ({ ...spell, tradition: "Elementalist" })) : []),
    ...(traditions.includes("Necromancer") || education === "Necromancer" ? traditionSpells.Necromancer.map((spell) => ({ ...spell, tradition: "Necromancer" })) : []),
  ];
  return { options: options.filter((spell) => spell.level <= limits.max), limits };
}

function focusChoiceRequired(name: string) {
  return creationFocusChoiceOptions(name).length > 0;
}

export function LevelUpWizard({ sheet, persistenceKey, canEdit, onCancel, onFinish }: Props) {
  const sourceLevel = Math.max(1, Math.min(10, Number(sheet.level) || 1));
  const [state, setState] = useState<DraftState>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = JSON.parse(window.sessionStorage.getItem(storageKey(persistenceKey)) || "null") as DraftState | null;
        if (stored?.sourceLevel === sourceLevel && stored.draft?.level === sourceLevel) return stored;
      } catch { /* A malformed UI-only draft is safely discarded. */ }
    }
    return { sourceLevel, step: 0, draft: clone(sheet) };
  });
  const [notice, setNotice] = useState("");
  const [finishing, setFinishing] = useState(false);
  const plan = useMemo(() => advancementPlan(state.draft as AdvancementCharacter), [state.draft]);
  const sources = useMemo(() => creationSkillSources(state.draft), [state.draft]);
  const baselineSources = useMemo(() => creationSkillSources(sheet), [sheet]);
  const credits = useMemo(() => advancementSkillCreditBySkill(state.draft), [state.draft]);
  const artOptions = useMemo(() => artChoices(state.draft, plan.to), [state.draft, plan.to]);
  const spellOptions = useMemo(() => spellChoices(state.draft, plan.to), [state.draft, plan.to]);

  useEffect(() => {
    window.sessionStorage.setItem(storageKey(persistenceKey), JSON.stringify(state));
  }, [persistenceKey, state]);

  const update = (recipe: (draft: WizardCharacter) => WizardCharacter) =>
    setState((current) => ({ ...current, draft: recipe(current.draft) }));
  const selectedFocus = state.draft.focusPicks.find((pick, index) =>
    pick.name !== sheet.focusPicks[index]?.name || pick.level !== sheet.focusPicks[index]?.level,
  ) || state.draft.focusPicks.filter((pick) => pick.name).slice(-1)[0];
  const focusAdded = state.draft.focusPicks.length > sheet.focusPicks.length;
  const focusChanged = state.draft.focusPicks.some((pick, index) =>
    pick.name !== sheet.focusPicks[index]?.name || pick.level !== sheet.focusPicks[index]?.level,
  );
  const focusComplete = !plan.gainsFocus || (focusChanged && (!focusAdded || !focusChoiceRequired(selectedFocus?.name || "") || Boolean(selectedFocus?.choice)));
  const originalBoosts = Object.values(sheet.attributeBoosts).reduce((total, count) => total + Number(count), 0);
  const draftBoosts = Object.values(state.draft.attributeBoosts).reduce((total, count) => total + Number(count), 0);
  const attributePointsSpent = Math.max(0, attributeImprovementCostForCount(draftBoosts) - attributeImprovementCostForCount(originalBoosts));
  const skillSpendForRank = (skill: string, targetRank: number) => {
    const baselineProfile = deriveSkillProfile({
      purchased: sheet.skillPurchases[skill],
      sourceCount: baselineSources[skill].length,
    });
    // Normal advancement points buy the trained rank. Focus bonus-skill
    // credit is a separate, skill-bound pool applied afterward.
    return skillAdvancementCost(baselineProfile.granted, targetRank);
  };
  const skillPointsSpent = creationSkills.reduce((total, skill) => {
    const profile = deriveSkillProfile({
      purchased: state.draft.skillPurchases[skill],
      sourceCount: sources[skill].length,
      credit: credits[skill] || 0,
    });
    return total + skillSpendForRank(skill, profile.granted);
  }, 0);
  const pointsSpent = skillPointsSpent + attributePointsSpent;
  const combatSkillSpent = ["Punch", "Shoot", "Stab"].reduce((total, skill) => {
    const profile = deriveSkillProfile({
      purchased: state.draft.skillPurchases[skill],
      sourceCount: sources[skill].length,
      credit: credits[skill] || 0,
    });
    return total + skillSpendForRank(skill, profile.granted);
  }, 0);
  const skillBudget = plan.skillPoints + Math.max(0, Number(sheet.levelUpUnspentSkillPoints) || 0);
  const pointsRemaining = skillBudget - pointsSpent;
  const { minimum: hpRollMinimum, maximum: hpRollMaximum } = levelUpHitPointRollBounds(plan.to);
  const hpRollComplete = Number.isInteger(state.hpRoll)
    && Number(state.hpRoll) >= hpRollMinimum
    && Number(state.hpRoll) <= hpRollMaximum;
  const developedCon = state.draft.focusPicks.some((pick) => pick.name === "Developed Attribute" && pick.choice === "CON");
  const dieHard = state.draft.focusPicks.some((pick) => pick.name === "Die Hard");
  const hpMaximum = hpRollComplete
    ? levelUpHitPointTotal(sheet.hpMax, Number(state.hpRoll), plan.to, modifier(state.draft.attrs.CON || 0) + (developedCon ? 1 : 0), advancementClassPerDieBonus(state.draft), dieHard)
    : 0;
  const newArts = Math.max(0, state.draft.artPicks.length - sheet.artPicks.length);
  const newSpells = Math.max(0, state.draft.spellPicks.length - sheet.spellPicks.length);
  const education = traditionalEducationTradition(state.draft);
  const educationAdded = focusAdded && selectedFocus?.name === "Traditional Education" && Boolean(education);
  const educationArtCount = educationAdded && education
    ? artSlots(education, 1, state.draft.classMode === "adventurer")
    : 0;
  const artGrants = [
    ...plan.artGrants.map((grant) => ({
      tradition: grant.tradition,
      count: grant.count,
      fixedSelections: grant.fixedArts.map((name) => artSelectionValue(grant.tradition, name)),
    })),
    ...(educationAdded && education ? [{
      tradition: education,
      count: educationArtCount,
      fixedSelections: forcedArtsForTraditions([education]).map((name) => artSelectionValue(education, name)),
    }] : []),
  ];
  const artRequirements = artGrants.flatMap((grant) =>
    Array.from({ length: grant.count }, (_, index) => ({
      tradition: grant.tradition,
      requiredArt: grant.fixedSelections[index] || "",
    })),
  );
  const requiredArtPicks = artRequirements.length;
  const newArtSelections = state.draft.artPicks.slice(sheet.artPicks.length);
  const artsComplete = newArts === requiredArtPicks && artRequirements.every((requirement, index) => {
    const selection = newArtSelections[index] || "";
    if (!selection) return false;
    if (requirement.requiredArt && selection !== requirement.requiredArt) return false;
    const selectedArt = artOptions.find((art) => art.value === selection && art.tradition === requirement.tradition);
    if (!selectedArt) return false;
    if (missingArtPrerequisite(
      selectedArt.name,
      state.draft.artPicks.map(artSelectionName),
    )) return false;
    return artChoiceIsComplete(selection, state.draft.artChoices);
  });
  const spellsComplete = newSpells === plan.spellPicks;
  const ready = hpRollComplete && pointsRemaining >= 0 && focusComplete && artsComplete && spellsComplete;

  const focusOptions = useMemo(() => legalAdvancementFocuses({
    ...state.draft,
    focusPicks: sheet.focusPicks,
  }), [sheet.focusPicks, state.draft]);
  const selectedFocusDefinition = foci.find((focus) => focus.name === selectedFocus?.name);
  const selectedFocusActionLabel = selectedFocus?.name
    ? advancementFocusOptionLabel(sheet as AdvancementCharacter, selectedFocus.name)
    : "";
  const chooseFocus = (name: string) => {
    if (!name) {
      update((draft) => ({ ...draft, focusPicks: clone(sheet.focusPicks), artPicks: clone(sheet.artPicks), artChoices: clone(sheet.artChoices), spellPicks: clone(sheet.spellPicks) }));
      return;
    }
    const focus = focusOptions.find((item) => item.name === name);
    if (!focus) return;
    update((draft) => {
      const baseline = clone(sheet.focusPicks);
      const sameIndex = baseline.findIndex((pick) => pick.name === name && pick.level === 1);
      if (sameIndex >= 0 && focus.level2) {
        return { ...draft, focusPicks: baseline.map((pick, index) => index === sameIndex ? { ...pick, level: 2 } : pick), artPicks: clone(sheet.artPicks), artChoices: clone(sheet.artChoices), spellPicks: clone(sheet.spellPicks) };
      }
      const repeatedSpiritFamiliar = name === "Spirit Familiar" && baseline.some((pick) => pick.name === name && pick.level >= 2);
      return { ...draft, focusPicks: [...baseline, { name, level: repeatedSpiritFamiliar ? 2 : 1, choice: "", advancement: true }], artPicks: clone(sheet.artPicks), artChoices: clone(sheet.artChoices), spellPicks: clone(sheet.spellPicks) };
    });
  };
  const chooseFocusOption = (choice: string) => update((draft) => ({
    ...draft,
    focusPicks: draft.focusPicks.map((pick, index) => index === draft.focusPicks.length - 1 ? { ...pick, choice } : pick),
    // A Focus option can change the traditions available to its magic; do not
    // carry dependent draft selections across that change.
    artPicks: clone(sheet.artPicks),
    spellPicks: clone(sheet.spellPicks),
  }));
  const cancel = () => {
    if (typeof window !== "undefined") window.sessionStorage.removeItem(storageKey(persistenceKey));
    setState({ sourceLevel, step: 0, draft: clone(sheet) });
    setNotice("");
    onCancel();
  };

  const next = () => {
    if (state.step === 1 && !hpRollComplete) return setNotice("Roll the required hit-point total before continuing.");
    if (state.step === 2 && pointsRemaining < 0) return setNotice("Spend no more than the available skill points.");
    if (state.step === 3 && !focusComplete) return setNotice("Choose the required Focus and any required Focus option.");
    if (state.step === 4 && (!artsComplete || !spellsComplete)) return setNotice("Choose every Art and spell granted at this level from the class or tradition that grants it.");
    setNotice("");
    setState((current) => ({ ...current, step: Math.min(5, current.step + 1) }));
  };

  async function finish() {
    if (!ready || finishing) {
      setNotice("Complete each required advancement choice before applying this level.");
      return;
    }
    setFinishing(true);
    const final = {
      ...state.draft,
      level: plan.to,
      hpRolls: [...sheet.hpRolls.slice(0, sourceLevel), Number(state.hpRoll)],
      hpMax: hpMaximum,
      // Keep the same damage taken rather than silently healing from the new maximum.
      hpCurrent: Math.max(0, Math.min(hpMaximum, sheet.hpCurrent + Math.max(0, hpMaximum - sheet.hpMax))),
      levelUpUnspentSkillPoints: Math.max(0, pointsRemaining),
      artEffort: state.draft.artPicks.map(() => 0),
    } as WizardCharacter;
    const applied = await onFinish(final, sourceLevel);
    setFinishing(false);
    if (applied) window.sessionStorage.removeItem(storageKey(persistenceKey));
  }

  const content = (() => {
    if (state.step === 0) return <>
      <StepTitle eyebrow={`LEVEL ${plan.from} → ${plan.to}`} title="Advancement overview">
        This wizard applies one legal level at a time. Nothing is changed until you confirm the final summary.
      </StepTitle>
      <div className="creation-rule-callout"><strong>Automatic progression</strong>{plan.automatic.map((line) => <span key={line}>{line}</span>)}</div>
      <div className="creation-rule-callout"><strong>This level grants</strong><span>{plan.skillPoints} skill point{plan.skillPoints === 1 ? "" : "s"}{plan.quickLearner ? " (including Quick Learner’s restricted point)" : ""}.</span>{plan.gainsFocus && <span>One Focus pick.</span>}{plan.artPicks > 0 && <span>{plan.artPicks} Art choice{plan.artPicks === 1 ? "" : "s"}.</span>}{plan.spellPicks > 0 && <span>{plan.spellPicks} new spell{plan.spellPicks === 1 ? "" : "s"}.</span>}</div>
    </>;
    if (state.step === 1) return <>
      <StepTitle eyebrow="HIT POINTS" title="Roll your new total">
        Roll {plan.to}d6. The result is compared to your current maximum; the character always gains at least 1 maximum HP.
      </StepTitle>
      <div className="level-up-hp-entry">
        <div className="level-up-hp-controls">
        <button type="button" className="primary-button" disabled={hpRollComplete} onClick={() => {
          const result = rollDice(plan.to, 6);
          setState((current) => ({ ...current, hpRoll: result.total }));
          setNotice("");
        }}>Roll {plan.to}d6 for HP</button>
        <label className="level-up-hp-manual-label" htmlFor="level-up-hp-total">Enter physical dice total</label>
          <input
            id="level-up-hp-total"
            className="level-up-hp-manual-input"
            type="number"
            aria-describedby="level-up-hp-range"
            aria-invalid={Boolean(notice && !hpRollComplete)}
            min={hpRollMinimum}
            max={hpRollMaximum}
            step={1}
            value={state.hpRoll || ""}
            onChange={(event) => {
              const raw = event.target.value;
              const value = Number(raw);
              if (!raw) {
                setState((current) => ({ ...current, hpRoll: undefined }));
                setNotice("");
              } else if (!validLevelUpHitPointRoll(value, plan.to)) {
                setState((current) => ({ ...current, hpRoll: undefined }));
                setNotice(`Enter an HP dice total from ${hpRollMinimum} to ${hpRollMaximum}.`);
              } else {
                setState((current) => ({ ...current, hpRoll: value }));
                setNotice("");
              }
            }}
          />
        <small className="level-up-hp-range" id="level-up-hp-range">Legal raw total: {hpRollMinimum}–{hpRollMaximum} ({plan.to}d6).</small>
        </div>
        {hpRollComplete && <div className="level-up-hp-result creation-success" role="status">
          <strong>HP dice total: {state.hpRoll}</strong>
          <span> · new maximum HP: {hpMaximum}</span>
          <p>Current HP rises by the same amount as maximum HP, preserving the character’s current damage state.</p>
          <button type="button" className="secondary-button" aria-label="Clear HP dice total" onClick={() => {
            setState((current) => ({ ...current, hpRoll: undefined }));
            setNotice("");
          }}>Clear HP total</button>
        </div>}
      </div>
    </>;
    if (state.step === 2) return <>
      <StepTitle eyebrow="SKILLS & ATTRIBUTES" title="Spend advancement points">
        {skillBudget} point{skillBudget === 1 ? "" : "s"} available; {pointsRemaining} remaining. Reversing a selection refunds its cost immediately.
      </StepTitle>
      <div className="creation-rule-callout"><strong>Increasing costs</strong><span>Skills cost 1 point for level 0, 2 for level 1, 3 for level 2, 4 for level 3, and 5 for level 4. The dropdown edits the trained rank bought with normal advancement points; Focus bonus-skill credit is applied afterward and any unused credit remains banked on that skill.</span></div>
      <section className="level-up-spend-section" aria-labelledby="level-up-attributes-title">
        <h3 id="level-up-attributes-title">Attributes</h3>
        <p className="level-up-attribute-progression">Attribute improvements use one shared escalating cost: 1 point for the first increase, 2 for the second, 3 for the third, 4 for the fourth, and 5 for the fifth. The next increase costs {attributeImprovementCostForNext(draftBoosts)} point{attributeImprovementCostForNext(draftBoosts) === 1 ? "" : "s"}.</p>
        <div className="level-up-attributes-grid">{attributes.map((attribute) => {
          const boosts = state.draft.attributeBoosts[attribute] || 0;
          const baselineBoostsForAttribute = sheet.attributeBoosts[attribute] || 0;
          const nextCost = draftBoosts < plan.attributeBoostLimit ? attributeImprovementCostForNext(draftBoosts) : null;
          const canIncrease = nextCost !== null && (state.draft.attrs[attribute] || 0) < 18 && pointsRemaining >= nextCost;
          return <article className="level-up-attribute-card" key={attribute}>
            <div className="level-up-attribute-heading"><strong>{attribute}</strong><b>{state.draft.attrs[attribute]}</b></div>
            <span>{boosts} purchased increase{boosts === 1 ? "" : "s"} · {nextCost === null ? "No further increase at this level" : `next increase costs ${nextCost} point${nextCost === 1 ? "" : "s"}`}</span>
            <div className="level-up-attribute-controls">
              <button type="button" aria-label={`Decrease ${attribute}`} disabled={boosts <= baselineBoostsForAttribute} onClick={() => update((draft) => ({ ...draft, attributeBoosts: { ...draft.attributeBoosts, [attribute]: boosts - 1 }, attrs: { ...draft.attrs, [attribute]: draft.attrs[attribute] - 1 } }))}>−</button>
              <button type="button" aria-label={`Increase ${attribute}`} disabled={!canIncrease} onClick={() => update((draft) => ({ ...draft, attributeBoosts: { ...draft.attributeBoosts, [attribute]: boosts + 1 }, attrs: { ...draft.attrs, [attribute]: draft.attrs[attribute] + 1 } }))}>+</button>
            </div>
          </article>;
        })}</div>
      </section>
      <section className="level-up-spend-section" aria-labelledby="level-up-skills-title">
        <h3 id="level-up-skills-title">Skills</h3>
        <div className="level-up-skills-grid">{creationSkills.map((skill) => {
          const profile = deriveSkillProfile({ purchased: state.draft.skillPurchases[skill], sourceCount: sources[skill].length, credit: credits[skill] || 0 });
          const baselineProfile = deriveSkillProfile({ purchased: sheet.skillPurchases[skill], sourceCount: baselineSources[skill].length });
          const automaticProfile = deriveSkillProfile({ purchased: sheet.skillPurchases[skill], sourceCount: sources[skill].length });
          const minimumRank = Math.max(baselineProfile.granted, automaticProfile.granted);
          const options = [-1, 0, 1, 2, 3, 4].filter((rank) => rank >= minimumRank && (rank <= plan.skillCap || rank === minimumRank || rank === profile.granted));
          const currentSkillSpend = skillSpendForRank(skill, profile.granted);
          return <label className="level-up-skill-field" key={skill}><span>{skill}{profile.credit ? ` · Focus credit ${profile.credit}${profile.creditRemaining ? ` · ${profile.creditRemaining} banked` : ""} · effective ${skillLabel(profile.effective)}` : ""}</span><select aria-label={`${skill} trained advancement rank before Focus credit`} value={profile.granted} onChange={(event) => {
            const selected = Number(event.target.value);
            const stored = storedRankForDisplayedSkillRank(selected, profile.sourceCount);
            const roundTrip = deriveSkillProfile({ purchased: stored, sourceCount: profile.sourceCount });
            if (roundTrip.granted !== selected) return;
            update((draft) => ({ ...draft, skillPurchases: { ...draft.skillPurchases, [skill]: stored } }));
          }}>{options.map((rank) => {
            const candidateSkillSpend = skillSpendForRank(skill, rank);
            const candidateCost = pointsSpent - currentSkillSpend + candidateSkillSpend;
            const isCombatSkill = ["Punch", "Shoot", "Stab"].includes(skill);
            const candidateCombat = combatSkillSpent + (isCombatSkill ? candidateSkillSpend - currentSkillSpend : 0);
            const disabled = candidateCost > skillBudget || (plan.quickLearner && candidateCombat > 3 && candidateCost > 3);
            const costText = rank === baselineProfile.granted
              ? ""
              : ` · ${candidateSkillSpend} pt${candidateSkillSpend === 1 ? "" : "s"}`;
            return <option key={rank} value={rank} disabled={disabled}>{skillLabel(rank)}{costText}</option>;
          })}</select></label>;
        })}</div>
      </section>
    </>;
    if (state.step === 3) return <>
      <StepTitle eyebrow="FOCI" title={plan.gainsFocus ? "Choose a Focus" : "No Focus this level"}>
        {plan.gainsFocus
          ? `A Focus may improve an existing Focus to level 2 or add a legal new Focus.${plan.nextFocusLevel ? ` The next Focus opportunity is at level ${plan.nextFocusLevel}.` : " This is the final Focus opportunity in the normal level-1-to-10 progression."}`
          : plan.nextFocusLevel
            ? `The next Focus opportunity is at level ${plan.nextFocusLevel}.`
            : "There are no further Focus opportunities in the normal level-1-to-10 progression."}
      </StepTitle>
      {plan.gainsFocus && <div className="creation-fields"><div className="creation-magic-choice-main"><label><span>Focus</span><select value={focusChanged ? selectedFocus?.name || "" : ""} onChange={(event) => chooseFocus(event.target.value)}><option value="">Choose a Focus…</option>{focusOptions.map((focus) => <option key={focus.name} value={focus.name}>{advancementFocusOptionLabel(sheet as AdvancementCharacter, focus.name)}</option>)}</select></label>{selectedFocusDefinition && <div className="creation-selection-guidance"><SelectionRuleHelp label={selectedFocusDefinition.name} fullText={focusFullRules(selectedFocusDefinition)} /><small className="creation-selection-summary">{plainLanguageSummary(selectedFocusDefinition.name, selectedFocusDefinition.level1 || selectedFocusDefinition.intro || "")}</small></div>}</div>{focusAdded && focusChoiceRequired(selectedFocus?.name || "") && <label><span>{selectedFocus?.name} choice</span><select value={selectedFocus?.choice || ""} onChange={(event) => chooseFocusOption(event.target.value)}><option value="">Choose…</option>{creationFocusChoiceOptions(selectedFocus?.name || "").map((choice) => <option key={choice} value={choice}>{choice}</option>)}</select></label>}{focusAdded && selectedFocus?.name === "Traditional Education" && selectedFocus.choice && <div className="creation-rule-callout"><strong>Traditional Education</strong><span>Choose the first-level Arts of {selectedFocus.choice} in the magic step. Mandatory starting Arts are enforced automatically, and this tradition grants no further Arts after these initial selections.</span></div>}{selectedFocus?.name === "Spirit Familiar" && selectedFocus.level >= 2 && <div className="creation-rule-callout"><strong>{selectedFocusActionLabel}</strong><span>After applying this level, choose the newly unlocked familiar benefits on the Spirit Familiar tab. Each level-2 purchase unlocks two more benefit boxes.</span></div>}{focusAdded && creationFocusBonusSkill(selectedFocus || { name: "", level: 1 }) && <div className="creation-rule-callout"><strong>Focus bonus skill</strong><span>{creationFocusBonusSkill(selectedFocus)} receives three skill-specific points. Any portion that does not immediately buy another skill level stays banked toward a later increase.</span></div>}</div>}
    </>;
    if (state.step === 4) return <>
      <StepTitle eyebrow="MAGIC" title={requiredArtPicks || plan.spellPicks ? "Choose new magic" : "No new magic choices"}>
        Spell limits, preparation, and Effort are derived by the normal character sheet after advancement.
      </StepTitle>
      {requiredArtPicks > 0 && <div className="creation-magic-section">
        <h3>Arts ({newArts}/{requiredArtPicks})</h3>
        {artRequirements.map((requirement, index) => {
          const requiredArt = requirement.requiredArt;
          const artIndex = sheet.artPicks.length + index;
          const selection = state.draft.artPicks[artIndex] || "";
          const selectedArt = artOptions.find((art) => art.value === selection || art.name === artSelectionName(selection));
          const choiceDefinition = artChoiceDefinition(selection);
          const choiceValues = artChoiceValues(selection, state.draft.artChoices);
          return <div className="creation-art-row" key={`${requirement.tradition}-${index}`}>
            <div className="creation-magic-choice-main">
              <label>
                <span>{requiredArt ? `${requirement.tradition} · Required Art · ${artSelectionName(requiredArt)}` : `New ${requirement.tradition} Art`}</span>
                <select value={selection} onChange={(event) => update((draft) => ({
                  ...draft,
                  artPicks: [...draft.artPicks.slice(0, artIndex), event.target.value, ...draft.artPicks.slice(artIndex + 1)],
                }))}>
                  <option value="">{requiredArt ? `Choose ${artSelectionName(requiredArt)}…` : `Choose a ${requirement.tradition} Art…`}</option>
                  {artOptions.filter((art) => {
                    if (art.tradition !== requirement.tradition) return false;
                    if (requiredArt && art.value !== requiredArt) return false;
                    const duplicate = art.name !== "Skilled" && state.draft.artPicks.some((picked, selectedIndex) => selectedIndex !== artIndex && picked === art.value);
                    const missingPrerequisite = missingArtPrerequisite(
                      art.name,
                      state.draft.artPicks.map(artSelectionName),
                    );
                    return !duplicate && !missingPrerequisite;
                  }).map((art) => <option key={art.value} value={art.value}>{art.name} · {art.tradition}</option>)}
                </select>
              </label>
              {selectedArt && <div className="creation-selection-guidance"><SelectionRuleHelp label={`${selectedArt.tradition} · ${selectedArt.name}`} fullText={selectedArt.text} /><small className="creation-selection-summary">{plainLanguageSummary(selectedArt.name, selectedArt.text)}</small></div>}
            </div>
            {choiceDefinition && <div className="art-choice-fields" aria-label={choiceDefinition.label}>
              {choiceValues.map((value, choiceIndex) => <label key={`${artChoiceKey(selection)}-${choiceIndex}`}>
                <span>{choiceDefinition.itemLabel}{choiceDefinition.count > 1 ? ` ${choiceIndex + 1}` : ""}</span>
                <input value={value} maxLength={80} onChange={(event) => update((draft) => ({
                  ...draft,
                  artChoices: {
                    ...draft.artChoices,
                    [artChoiceKey(selection)]: choiceValues.map((current, valueIndex) => valueIndex === choiceIndex ? event.target.value : current),
                  },
                }))}/>
              </label>)}
              <small>{choiceDefinition.help}</small>
            </div>}
          </div>;
        })}
      </div>}
      {plan.spellPicks > 0 && <div className="creation-magic-section"><h3>Spells ({newSpells}/{plan.spellPicks})</h3>{Array.from({ length: plan.spellPicks }, (_, index) => {
        const spellIndex = sheet.spellPicks.length + index;
        const selection = state.draft.spellPicks[spellIndex]?.name || "";
        const selectedSpell = spellOptions.options.find((spell) => spell.name === selection);
        return <div className="creation-magic-choice-main" key={index}>
          <label><span>New spell {index + 1}</span><select value={selection} onChange={(event) => update((draft) => ({ ...draft, spellPicks: [...draft.spellPicks.slice(0, spellIndex), { name: event.target.value, prepared: false, cast: false }, ...draft.spellPicks.slice(spellIndex + 1)] }))}><option value="">Choose a spell…</option>{spellOptions.options.filter((spell) => !state.draft.spellPicks.some((pick, selectedIndex) => selectedIndex !== spellIndex && pick.name === spell.name)).map((spell) => <option key={spell.name} value={spell.name}>{spell.name} · level {spell.level}</option>)}</select></label>
          {selectedSpell && <div className="creation-selection-guidance"><SelectionRuleHelp label={`${selectedSpell.tradition} · ${selectedSpell.name}`} fullText={selectedSpell.text} /><small className="creation-selection-summary">{plainLanguageSummary(selectedSpell.name, selectedSpell.text)}</small></div>}
        </div>;
      })}</div>}
    </>;
    return <>
      <StepTitle eyebrow="REVIEW" title={`Level ${plan.from} → Level ${plan.to}`}>
        Review this single advancement before it is saved.
      </StepTitle>
      <div className="creation-success"><strong>Maximum HP {sheet.hpMax} → {hpMaximum}</strong><span> · Current HP {sheet.hpCurrent} → {Math.max(0, Math.min(hpMaximum, sheet.hpCurrent + Math.max(0, hpMaximum - sheet.hpMax)))}</span><p>{pointsSpent} skill/attribute point{pointsSpent === 1 ? "" : "s"} spent; {pointsRemaining} saved for later.</p>{plan.gainsFocus && <p>Focus: {selectedFocusActionLabel}</p>}{newArts > 0 && <p>Arts: {state.draft.artPicks.slice(sheet.artPicks.length).map(artSelectionName).join(", ")}</p>}{newSpells > 0 && <p>Spells: {state.draft.spellPicks.slice(sheet.spellPicks.length).map((spell) => spell.name).join(", ")}</p>}</div>
    </>;
  })();

  return <section className="guided-creation" aria-label="Level-Up Wizard"><header className="guided-creation-header"><div><p>LEVEL-UP WIZARD · LEVEL {plan.from} → {plan.to}</p><h1>Advance your character</h1><span>This is a transactional draft. Canceling discards the draft; nothing changes until you confirm the final summary.</span></div><button type="button" className="secondary-button" onClick={cancel}>Cancel level-up</button></header><div className="guided-creation-layout"><nav className="creation-progress" aria-label="Level-up steps">{["Overview", "Hit Points", "Skills", "Focus", "Magic", "Review"].map((label, index) => <button type="button" key={label} className={state.step === index ? "active" : ""} onClick={() => setState((current) => ({ ...current, step: index }))}><span>{index + 1}</span><b>{label}</b></button>)}</nav><main className="creation-workspace">{notice && <div className="creation-notice" role="status">{notice}<button type="button" onClick={() => setNotice("")}>×</button></div>}{content}</main><aside className="creation-summary-rail"><h2>Advancement</h2><div className="creation-summary-content"><div><span>Current</span><b>Level {plan.from}</b></div><div><span>New</span><b>Level {plan.to}</b></div><div><span>Skill points</span><p>{pointsRemaining}/{skillBudget} remaining</p></div><div><span>HP</span><p>{hpRollComplete ? hpMaximum : "Awaiting roll"}</p></div></div></aside></div><footer className="creation-navigation"><button type="button" onClick={() => setState((current) => ({ ...current, step: Math.max(0, current.step - 1) }))} disabled={state.step === 0}>Back</button>{state.step === 5 ? <button type="button" className="primary-button" disabled={!ready || finishing || !canEdit} onClick={() => void finish()}>{finishing ? "Applying…" : "Confirm level-up"}</button> : <button type="button" className="primary-button" onClick={next}>Continue</button>}</footer></section>;
}
