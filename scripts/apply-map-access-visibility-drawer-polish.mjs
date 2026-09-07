import { readFile, writeFile } from "node:fs/promises";

function replaceOnce(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`${label}: expected source anchor not found`);
  if (source.indexOf(before) !== source.lastIndexOf(before)) throw new Error(`${label}: source anchor is not unique`);
  return source.replace(before, after);
}

// 1. Keep route-independent access discoverable on the normal character URL.
const characterPagePath = "app/character/[publicId]/page.tsx";
let characterPage = await readFile(characterPagePath, "utf8");
characterPage = replaceOnce(
  characterPage,
  `        showFloatingButton={false}\n`,
  `        showFloatingButton={campaigns.length === 1}\n`,
  "direct character map launcher",
);
await writeFile(characterPagePath, characterPage);

// 2. Make player visibility obvious in the selected-map controls and fix drawer state hooks/tab copy.
const launcherPath = "app/campaigns/campaign-map-launcher.tsx";
let launcher = await readFile(launcherPath, "utf8");
launcher = replaceOnce(
  launcher,
  `  useEffect(() => {\n    const documentElement = document.documentElement;\n    if (!open || presentation !== "drawer") {\n      delete documentElement.dataset.campaignMapDrawer;\n      documentElement.style.removeProperty("--campaign-map-drawer-space");\n      return;\n    }\n    documentElement.dataset.campaignMapDrawer = drawerDock;\n    documentElement.style.setProperty("--campaign-map-drawer-space", \`${drawerWidth}px\`);\n    return () => {\n      if (documentElement.dataset.campaignMapDrawer === drawerDock) delete documentElement.dataset.campaignMapDrawer;\n      documentElement.style.removeProperty("--campaign-map-drawer-space");\n    };\n  }, [drawerDock, drawerWidth, open, presentation]);`,
  `  useEffect(() => {\n    const documentElement = document.documentElement;\n    const clearDrawerState = () => {\n      delete documentElement.dataset.campaignMapDrawer;\n      delete documentElement.dataset.campaignMapPane;\n      documentElement.style.removeProperty("--campaign-map-drawer-space");\n    };\n    if (!open || presentation !== "drawer") {\n      clearDrawerState();\n      return;\n    }\n    const syncDrawerState = () => {\n      const remainingWidth = Math.max(0, window.innerWidth - drawerWidth);\n      documentElement.dataset.campaignMapDrawer = drawerDock;\n      documentElement.dataset.campaignMapPane = remainingWidth < 760 ? "narrow" : remainingWidth < 1120 ? "compact" : "wide";\n      documentElement.style.setProperty("--campaign-map-drawer-space", \`${drawerWidth}px\`);\n    };\n    syncDrawerState();\n    window.addEventListener("resize", syncDrawerState);\n    return () => {\n      window.removeEventListener("resize", syncDrawerState);\n      if (documentElement.dataset.campaignMapDrawer === drawerDock) clearDrawerState();\n    };\n  }, [drawerDock, drawerWidth, open, presentation]);`,
  "drawer pane width state",
);
launcher = replaceOnce(
  launcher,
  `              {map.isActive\n                ? <div className="campaign-map-visible-status"><strong>Visible to Players</strong><span>Party members opening Map see this map.</span></div>\n                : <button type="button" className="campaign-primary" disabled={busy} onClick={() => void showToPlayers()}>Show to Players</button>}\n`,
  ``,
  "remove hidden table visibility control",
);
launcher = replaceOnce(
  launcher,
  `              {map && <div className="campaign-map-selected-controls">\n                <label><span>Map name</span><input type="text" maxLength={80} value={mapNameDraft} onChange={event => setMapNameDraft(event.target.value)} /></label>\n                <button type="button" className="campaign-secondary" disabled={busy || !mapNameDraft.trim() || mapNameDraft.trim() === map.name} onClick={() => void renameMap()}>Save Name</button>\n                <button type="button" className="campaign-danger" disabled={busy} onClick={() => void deleteMap()}>Delete Map</button>\n              </div>}`,
  `              {map && <div className="campaign-map-selected-controls">\n                <div className="campaign-map-player-visibility" aria-label="Player visibility">\n                  <strong className="campaign-map-setting-label">Player Visibility</strong>\n                  {map.isActive\n                    ? <div className="campaign-map-visible-status"><strong>Visible to Players</strong><span>Party members opening Map see this map.</span></div>\n                    : <>\n                      <div className="campaign-map-hidden-status"><strong>GM Only</strong><span>Players continue to see the map currently marked Visible to Players.</span></div>\n                      <button type="button" className="campaign-primary" disabled={busy} onClick={() => void showToPlayers()}>Make Visible to Players</button>\n                    </>}\n                  <small>Only one campaign map is visible to players at a time.</small>\n                </div>\n                <label><span>Map name</span><input type="text" maxLength={80} value={mapNameDraft} onChange={event => setMapNameDraft(event.target.value)} /></label>\n                <button type="button" className="campaign-secondary" disabled={busy || !mapNameDraft.trim() || mapNameDraft.trim() === map.name} onClick={() => void renameMap()}>Save Name</button>\n                <button type="button" className="campaign-danger" disabled={busy} onClick={() => void deleteMap()}>Delete Map</button>\n              </div>}`,
  "selected map player visibility",
);
launcher = replaceOnce(
  launcher,
  `  >Open Map</button> : null;`,
  `  >Close Map</button> : null;`,
  "open drawer tab copy",
);
await writeFile(launcherPath, launcher);

// 3. Attach the open tab to the drawer's moving edge and style visibility state.
const mapCssPath = "app/campaigns/campaign-map.css";
let mapCss = await readFile(mapCssPath, "utf8");
mapCss = replaceOnce(
  mapCss,
  `.campaign-map-drawer-collapse-left {\n  left: calc(var(--campaign-map-drawer-space) - 1.45rem);\n  border-radius: .55rem 0 0 .55rem;\n}\n\n.campaign-map-drawer-collapse-right {\n  right: calc(var(--campaign-map-drawer-space) - 1.45rem);\n  border-radius: 0 .55rem .55rem 0;\n}`,
  `.campaign-map-drawer-collapse-left {\n  left: var(--campaign-map-drawer-space);\n  border-left: 0;\n  border-radius: 0 .55rem .55rem 0;\n}\n\n.campaign-map-drawer-collapse-right {\n  right: var(--campaign-map-drawer-space);\n  border-right: 0;\n  border-radius: .55rem 0 0 .55rem;\n}`,
  "drawer tab edge attachment",
);
mapCss = replaceOnce(
  mapCss,
  `.campaign-map-visible-status span {\n  color: var(--text-muted, #b9ad9b);\n  font-size: .74rem;\n}\n`,
  `.campaign-map-visible-status span {\n  color: var(--text-muted, #b9ad9b);\n  font-size: .74rem;\n}\n\n.campaign-map-player-visibility {\n  display: grid;\n  gap: .45rem;\n  padding-bottom: .65rem;\n  border-bottom: 1px solid color-mix(in srgb, var(--border, #725f47) 42%, transparent);\n}\n\n.campaign-map-setting-label {\n  color: var(--text, #f4ead8);\n  font: 700 .72rem/1 var(--font-ui, sans-serif);\n  letter-spacing: .08em;\n  text-transform: uppercase;\n}\n\n.campaign-map-hidden-status {\n  display: grid;\n  gap: .15rem;\n  padding: .55rem .6rem;\n  border: 1px solid color-mix(in srgb, var(--border, #725f47) 58%, transparent);\n  border-radius: 7px;\n  background: color-mix(in srgb, var(--surface, #17130f) 88%, #000 12%);\n}\n\n.campaign-map-hidden-status strong {\n  color: #d9b979;\n  font-size: .82rem;\n}\n\n.campaign-map-hidden-status span,\n.campaign-map-player-visibility > small {\n  color: var(--text-muted, #b9ad9b);\n  font-size: .74rem;\n}\n`,
  "player visibility styles",
);
await writeFile(mapCssPath, mapCss);

// 4. Make the shared header react to the width left beside the drawer, not the full viewport.
const headerCssPath = "app/app-header.css";
let headerCss = await readFile(headerCssPath, "utf8");
const headerMarker = `\n/* Side-drawer pane-width layout. The browser can remain desktop-wide while\n   the folio itself becomes tablet-width, so viewport media queries alone are\n   insufficient. CampaignMapWorkspace publishes the remaining-pane bucket. */\nhtml[data-campaign-map-drawer][data-campaign-map-pane="compact"] .app-header {\n  display:grid;\n  grid-template-columns:minmax(0,1fr) auto;\n  grid-template-areas:\"brand nav\" \"utilities utilities\";\n  align-items:center;\n  gap:8px 12px;\n  padding:9px 14px;\n}\nhtml[data-campaign-map-drawer][data-campaign-map-pane="compact"] .app-header > .twe-brand { grid-area:brand; }\nhtml[data-campaign-map-drawer][data-campaign-map-pane="compact"] .app-header > nav {\n  grid-area:nav;\n  flex-wrap:nowrap;\n  justify-content:flex-end;\n}\nhtml[data-campaign-map-drawer][data-campaign-map-pane="compact"] .app-header > .app-header-utilities {\n  grid-area:utilities;\n  width:100%;\n  margin-left:0;\n  justify-content:flex-end;\n}\nhtml[data-campaign-map-drawer][data-campaign-map-pane="compact"] .app-header-utilities .status {\n  width:100%;\n  justify-content:flex-end;\n  flex-wrap:wrap;\n}\n\nhtml[data-campaign-map-drawer][data-campaign-map-pane="narrow"] .app-header {\n  display:grid;\n  grid-template-columns:minmax(0,1fr);\n  grid-template-areas:\"brand\" \"utilities\" \"nav\";\n  align-items:stretch;\n  gap:8px;\n  padding:9px 12px;\n}\nhtml[data-campaign-map-drawer][data-campaign-map-pane="narrow"] .app-header > .twe-brand { grid-area:brand; }\nhtml[data-campaign-map-drawer][data-campaign-map-pane="narrow"] .app-header > .app-header-utilities {\n  grid-area:utilities;\n  width:100%;\n  margin-left:0;\n  justify-content:flex-start;\n}\nhtml[data-campaign-map-drawer][data-campaign-map-pane="narrow"] .app-header > nav {\n  grid-area:nav;\n  width:100%;\n  justify-content:flex-start;\n}\nhtml[data-campaign-map-drawer][data-campaign-map-pane="narrow"] .app-header nav,\nhtml[data-campaign-map-drawer][data-campaign-map-pane="narrow"] .app-header-utilities,\nhtml[data-campaign-map-drawer][data-campaign-map-pane="narrow"] .app-header-utilities .status {\n  flex-wrap:wrap;\n}\n`;
if (headerCss.includes("Side-drawer pane-width layout")) throw new Error("header drawer layout already present");
headerCss += headerMarker;
await writeFile(headerCssPath, headerCss);

// 5. Strengthen focused regression coverage.
const routeTestPath = "tests/campaign-map-route-independent.test.mjs";
let routeTest = await readFile(routeTestPath, "utf8");
routeTest = replaceOnce(
  routeTest,
  `  assert.match(page, /showFloatingButton=\\{false\\}/u);`,
  `  assert.match(page, /showFloatingButton=\\{campaigns\\.length === 1\\}/u);\n  assert.match(page, /listAuthorizedCharacterCampaigns\\(db, actor, publicId\\)/u);`,
  "route-independent test",
);
await writeFile(routeTestPath, routeTest);

const drawerTestPath = "tests/campaign-map-drawer.test.mjs";
let drawerTest = await readFile(drawerTestPath, "utf8");
drawerTest = replaceOnce(
  drawerTest,
  `  const campaignCss = await readFile(new URL("../app/campaigns/campaign-ui.css", import.meta.url), "utf8");`,
  `  const campaignCss = await readFile(new URL("../app/campaigns/campaign-ui.css", import.meta.url), "utf8");\n  const headerCss = await readFile(new URL("../app/app-header.css", import.meta.url), "utf8");`,
  "drawer header css fixture",
);
drawerTest = replaceOnce(
  drawerTest,
  `  assert.match(launcher, /aria-label="Collapse map"/u);`,
  `  assert.match(launcher, /aria-label="Collapse map"/u);\n  assert.match(launcher, />Close Map<\\/button> : null/u);\n  assert.match(launcher, /dataset\\.campaignMapPane/u);\n  assert.match(launcher, /remainingWidth < 760 \\? "narrow" : remainingWidth < 1120 \\? "compact" : "wide"/u);`,
  "drawer runtime assertions",
);
drawerTest = replaceOnce(
  drawerTest,
  `  assert.match(css, /campaign-map-drawer-collapse-left/u);\n  assert.match(css, /campaign-map-drawer-collapse-right/u);`,
  `  assert.match(css, /campaign-map-drawer-collapse-left[\\s\\S]*?left: var\\(--campaign-map-drawer-space\\)[\\s\\S]*?border-left: 0/u);\n  assert.match(css, /campaign-map-drawer-collapse-right[\\s\\S]*?right: var\\(--campaign-map-drawer-space\\)[\\s\\S]*?border-right: 0/u);`,
  "drawer attached tab css assertions",
);
drawerTest = replaceOnce(
  drawerTest,
  `  assert.match(globals, /site-shell\\{width:100%;[\\s\\S]*?transition:width \\.24s ease,margin-left \\.24s ease,margin-right \\.24s ease/u);`,
  `  assert.match(globals, /site-shell\\{width:100%;[\\s\\S]*?transition:width \\.24s ease,margin-left \\.24s ease,margin-right \\.24s ease/u);\n  assert.match(headerCss, /data-campaign-map-pane="compact"[\\s\\S]*?grid-template-areas:\\"brand nav\\" \\"utilities utilities\\"/u);\n  assert.match(headerCss, /data-campaign-map-pane="narrow"[\\s\\S]*?grid-template-areas:\\"brand\\" \\"utilities\\" \\"nav\\"/u);`,
  "drawer pane header assertions",
);
await writeFile(drawerTestPath, drawerTest);

const bundleTestPath = "tests/action-bundle-10-map-workspace.test.mjs";
let bundleTest = await readFile(bundleTestPath, "utf8");
bundleTest += `\n\ntest("map settings expose the selected map's player visibility explicitly", async () => {\n  const launcher = await read("app/campaigns/campaign-map-launcher.tsx");\n  const route = await read("app/api/campaigns/[id]/map/route.ts");\n\n  assert.match(launcher, /campaign-map-player-visibility/u);\n  assert.match(launcher, />Player Visibility<\\/strong>/u);\n  assert.match(launcher, />Make Visible to Players<\\/button>/u);\n  assert.match(launcher, /Only one campaign map is visible to players at a time/u);\n  assert.match(route, /body\\.action === "activate"/u);\n  assert.match(route, /activateCampaignMap/u);\n});\n`;
await writeFile(bundleTestPath, bundleTest);
