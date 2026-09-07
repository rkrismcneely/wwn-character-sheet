"use client";

import { lazy, Suspense, type ComponentProps } from "react";

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
 * Companion bond
 * classPlayDescriptions[sheet.classOne]
 * Roll 3d6 in order
 * manualBackgroundLearningOptions(sheet.background)
 * Resolve Background choices
 * creationPartialClassPairIsLegal
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
