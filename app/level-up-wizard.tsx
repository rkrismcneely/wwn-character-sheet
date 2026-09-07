"use client";

import { lazy, Suspense, type ComponentProps } from "react";

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
