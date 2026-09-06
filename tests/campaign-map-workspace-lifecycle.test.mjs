import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createMapWorkspaceState,
  mapWorkspaceReducer,
} from "../lib/campaigns/map-workspace-lifecycle.ts";

test("map workspace transitions keep exactly one host and preserve the selected in-page presentation", () => {
  let state = createMapWorkspaceState({ initialOpen: false, preferredPresentation: "drawer" });
  assert.deepEqual(state, { presentation: "closed", inPagePresentation: "drawer" });

  state = mapWorkspaceReducer(state, { type: "open" });
  assert.equal(state.presentation, "drawer");

  state = mapWorkspaceReducer(state, { type: "move-to-picture-in-picture" });
  assert.equal(state.presentation, "pip");

  state = mapWorkspaceReducer(state, { type: "picture-in-picture-closed", returnToPage: true });
  assert.equal(state.presentation, "drawer");

  state = mapWorkspaceReducer(state, { type: "close" });
  assert.equal(state.presentation, "closed");

  state = mapWorkspaceReducer(state, { type: "open" });
  assert.equal(state.presentation, "drawer");
});

test("closing Picture-in-Picture closes the map instead of leaving an empty source host", () => {
  let state = createMapWorkspaceState({ initialOpen: false, preferredPresentation: "fullscreen" });
  state = mapWorkspaceReducer(state, { type: "open" });
  state = mapWorkspaceReducer(state, { type: "move-to-picture-in-picture" });
  state = mapWorkspaceReducer(state, { type: "picture-in-picture-closed", returnToPage: false });

  assert.deepEqual(state, { presentation: "closed", inPagePresentation: "fullscreen" });
});

test("map controls expose Picture-in-Picture and a real open/close toggle", async () => {
  const [launcher, control, events] = await Promise.all([
    readFile(new URL("../app/campaigns/campaign-map-launcher.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-character-map-control.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-map-events.ts", import.meta.url), "utf8"),
  ]);

  assert.match(launcher, /presentation === "pip" && <button[\s\S]*?>Return to Page</u);
  assert.match(launcher, /<option value="pip">Picture-in-Picture<\/option>/u);
  assert.doesNotMatch(launcher, /Separate Window|campaign-map-window-menu|move-to-popout/u);
  assert.match(launcher, /Close Map Window/u);
  assert.doesNotMatch(launcher, /function choosePresentation[\s\S]{0,280}loadMap\(/u);
  assert.match(control, /campaignMapStateEvent/u);
  assert.match(control, /mapIsOpen \? "close" : "open"/u);
  assert.match(control, /mapIsOpen \? "Close Map" : "Map"/u);
  assert.match(events, /action\?: "open" \| "close"/u);
});
