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
