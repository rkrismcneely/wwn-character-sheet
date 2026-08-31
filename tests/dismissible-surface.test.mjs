import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { shouldDismissPointerInteraction } from "../app/dismissible-surface.ts";

const source = async path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("dismissible surface only closes a pointer interaction that stays outside", async () => {
  const surface = await source("app/dismissible-surface.ts");
  assert.match(surface, /export function shouldDismissPointerInteraction\(startedInside: boolean, endedInside: boolean\)/u);
  assert.match(surface, /return !startedInside && !endedInside/u);
  assert.match(surface, /document\.addEventListener\("pointerdown", onPointerDown, true\)/u);
  assert.match(surface, /document\.addEventListener\("pointerup", onPointerUp, true\)/u);
  assert.match(surface, /document\.addEventListener\("pointercancel", onPointerCancel, true\)/u);
  assert.equal(shouldDismissPointerInteraction(false, false), true);
  assert.equal(shouldDismissPointerInteraction(true, true), false);
  assert.equal(shouldDismissPointerInteraction(true, false), false);
  assert.equal(shouldDismissPointerInteraction(false, true), false);
});

test("dismissible surfaces preserve existing controls and use the shared interaction model", async () => {
  const [history, assistant, dialog, sheet, liveSession] = await Promise.all([
    source("app/roll-presentation.tsx"),
    source("app/rules-assistant.tsx"),
    source("app/campaigns/campaign-dialog.tsx"),
    source("app/character-sheet.tsx"),
    source("app/character-live-session-panel.tsx"),
  ]);
  assert.match(history, /useDismissibleSurface/iu);
  assert.match(history, /Clear history/u);
  assert.match(history, /onClick=\{onClose\}/u);
  assert.match(history, /event\.key === "Escape"/u);
  assert.match(assistant, /useDismissibleSurface/iu);
  assert.match(assistant, /event\.key === "Escape"/u);
  assert.match(dialog, /useDismissibleSurface/iu);
  assert.match(dialog, /aria-modal="true"/u);
  assert.match(dialog, /aria-label=\{`Close \$\{title\}`\}/u);
  assert.doesNotMatch(dialog, /onMouseDown=\{event =>/u);
  assert.match(sheet, /useDismissibleSurface/iu);
  assert.match(sheet, /aria-label="Close character library"/u);
  assert.match(sheet, /event\.key !== "Escape"/u);
  assert.match(liveSession, /useDismissibleSurface/iu);
  assert.match(liveSession, /aria-modal="false"/u);
  assert.match(liveSession, /aria-label="Close Live Session"/u);
});
