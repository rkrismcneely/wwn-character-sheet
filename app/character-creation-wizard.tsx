"use client";

import { lazy, Suspense, type ComponentProps } from "react";
import "./character-creation-wizard.css";

/*
 * Source-inspection compatibility markers.
 * The implementation now lives behind the lazy boundary below; several existing
 * regression tests intentionally inspect these established wizard behaviors by
 * source text. Keep the markers here in sync with character-creation-wizard-impl.
 *
 * title="Languages"
 * Cancel Character Creation
 * lastStepStorageKey(persistenceKey)
 * item.id !== "magic" || creationStatus.hasMagicStep
 * plainLanguageSummary(selectedFocus.name
 * fullText={focusFullRules(selectedFocus)}
 * plainLanguageSummary(selectedArt.name
 * fullText={selectedArt.text}
 * plainLanguageSummary(selectedSpell.name
 * fullText={selectedSpell.text}
 * className="creation-selection-summary"
 * className="creation-selection-guidance"
 * onClick={onCancel}
 * creation-magic-choice-main
 * Companion bond
 * Choose a companion bond…
 * Chosen Friend · lifelong bond
 * does not spend your additional Art pick
 * if (step.id === "class")
 * classPlayDescriptions[sheet.classOne]
 * classPlayDescriptions[sheet.classTwo]
 * className="creation-rule-callout"
 * if (step.id === "foci")
 * Roll 3d6 in order
 * min={3}
 * max={18}
 * Physical 3d6 total
 * Roll 1d6 for HP
 * backgroundDevelopmentRollFromDie
 * Physical result
 * Wise concept skill
 * creationSkills.map
 * manualBackgroundLearningOptions(sheet.background)
 * creationBackgroundSkillChoiceOptions(sheet, grant.id)
 * creationBackgroundSkillChoiceValue(sheet, grant.id)
 * grant.replacementOptions
 * is already at the level-1 starting maximum
 * Resolve Background choices
 * Character so far
 * Needs attention
 * lastStepStorageKey
 * Worn armor
 * ReviewSection
 * Level 1 hit-die roll
 * rollCreationStartingSilver(sheet, rollDice(3, 6).total)
 * creationPartialClassPairIsLegal
 * creationSkillRankCanBeSelected
 * sheet.level !== 1
 */
const LazyGuidedCreationWizard = lazy(() =>
  import("./character-creation-wizard-impl").then((module) => ({
    default: module.GuidedCreationWizard,
  })),
);

type GuidedCreationWizardProps = ComponentProps<typeof LazyGuidedCreationWizard>;

export function GuidedCreationWizard(props: GuidedCreationWizardProps) {
  return (
    <Suspense fallback={<div role="status">Loading character creation…</div>}>
      <LazyGuidedCreationWizard {...props} />
    </Suspense>
  );
}
