"use client";

import { lazy, Suspense, type ComponentProps } from "react";

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
