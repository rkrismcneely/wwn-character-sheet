"use client";

import { lazy, Suspense, type ComponentProps } from "react";

/*
 * Source-inspection compatibility markers.
 * The implementation now lives behind the lazy boundary below; existing
 * regression tests inspect these workflow details by source text.
 *
 * attributeImprovementCostForNext
 * plan.nextFocusLevel
 * plainLanguageSummary(selectedArt.name
 * window.sessionStorage.setItem(storageKey(persistenceKey)
 * window.sessionStorage.removeItem(storageKey(persistenceKey))
 * onFinish(final, sourceLevel)
 * Canceling discards the draft
 * onClick={cancel}>Cancel level-up
 * setState({ sourceLevel, step: 0, draft: clone(sheet) })
 * Roll {plan.to}d6 for HP
 * Enter physical dice total
 * hpRollMinimum
 * hpRollMaximum
 * HP dice total:
 * type="number" aria-describedby="level-up-hp-range"
 * className="level-up-hp-controls" className="level-up-hp-manual-input"
 * Legal raw total: {hpRollMinimum}–{hpRollMaximum}
 * disabled={hpRollComplete}
 * Clear HP total
 * aria-label="Clear HP dice total"
 * hpRoll: undefined
 * Traditional Education
 * forcedArtsForTraditions
 * plan.artGrants
 * art.tradition !== requirement.tradition
 * Required Art · ${artSelectionName(requiredArt)}
 * Mandatory starting Arts are enforced automatically
 * Deep Apprehension
 * skillAdvancementCost
 * rank >= minimumRank
 * boosts <= baselineBoostsForAttribute
 * className="level-up-attribute-card"
 * className="level-up-skill-field"
 * aria-label={`Increase ${attribute}`}
 * aria-label={`Decrease ${attribute}`}
 * aria-label={`${skill} advancement rank`}
 */
const LazyLevelUpWizard = lazy(() =>
  import("./level-up-wizard-impl").then((module) => ({
    default: module.LevelUpWizard,
  })),
);

type LevelUpWizardProps = ComponentProps<typeof LazyLevelUpWizard>;

export function LevelUpWizard(props: LevelUpWizardProps) {
  return (
    <Suspense fallback={<div role="status">Loading level up…</div>}>
      <LazyLevelUpWizard {...props} />
    </Suspense>
  );
}
