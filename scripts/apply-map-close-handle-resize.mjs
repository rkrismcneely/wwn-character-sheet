import { readFile, writeFile } from "node:fs/promises";

function replaceOnce(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`${label}: expected source anchor not found`);
  if (source.indexOf(before) !== source.lastIndexOf(before)) throw new Error(`${label}: source anchor is not unique`);
  return source.replace(before, after);
}

const launcherPath = "app/campaigns/campaign-map-launcher.tsx";
let launcher = await readFile(launcherPath, "utf8");

launcher = replaceOnce(
  launcher,
  `  const drawerResizeRef = useRef<{ pointerId: number; clientX: number; width: number } | null>(null);\n`,
  `  const drawerResizeRef = useRef<{\n    pointerId: number;\n    clientX: number;\n    width: number;\n    source: "divider" | "collapse";\n    didDrag: boolean;\n  } | null>(null);\n  const suppressDrawerCollapseClickRef = useRef(false);\n`,
  "drawer resize refs",
);

launcher = replaceOnce(
  launcher,
  `  function handleDrawerResizeStart(event: ReactPointerEvent<HTMLDivElement>) {\n    if (presentation !== "drawer" || event.button !== 0) return;\n    drawerResizeRef.current = { pointerId: event.pointerId, clientX: event.clientX, width: drawerWidth };\n    event.currentTarget.setPointerCapture(event.pointerId);\n    event.preventDefault();\n  }\n\n  function handlePresentationSelect(value: string) {`,
  `  function handleDrawerResizeStart(\n    event: ReactPointerEvent<HTMLElement>,\n    source: "divider" | "collapse" = "divider",\n  ) {\n    if (presentation !== "drawer" || event.button !== 0) return;\n    drawerResizeRef.current = {\n      pointerId: event.pointerId,\n      clientX: event.clientX,\n      width: drawerWidth,\n      source,\n      didDrag: false,\n    };\n    if (source === "collapse") suppressDrawerCollapseClickRef.current = false;\n    event.currentTarget.setPointerCapture(event.pointerId);\n    event.preventDefault();\n  }\n\n  function handlePresentationSelect(value: string) {`,
  "drawer resize start",
);

launcher = replaceOnce(
  launcher,
  `  function handleDrawerResizeMove(event: ReactPointerEvent<HTMLDivElement>) {\n    const resize = drawerResizeRef.current;\n    if (!resize || resize.pointerId !== event.pointerId) return;\n    setDrawerWidth(resizedCampaignMapDrawerWidth({\n      dock: drawerDock,\n      startWidth: resize.width,\n      startClientX: resize.clientX,\n      clientX: event.clientX,\n      viewportWidth: window.innerWidth,\n    }));\n  }\n\n  function handleDrawerResizeEnd(event: ReactPointerEvent<HTMLDivElement>) {\n    if (drawerResizeRef.current?.pointerId !== event.pointerId) return;\n    drawerResizeRef.current = null;\n    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);\n  }\n`,
  `  function handleDrawerResizeMove(event: ReactPointerEvent<HTMLElement>) {\n    const resize = drawerResizeRef.current;\n    if (!resize || resize.pointerId !== event.pointerId) return;\n    if (!resize.didDrag && Math.abs(event.clientX - resize.clientX) < 3) return;\n    resize.didDrag = true;\n    setDrawerWidth(resizedCampaignMapDrawerWidth({\n      dock: drawerDock,\n      startWidth: resize.width,\n      startClientX: resize.clientX,\n      clientX: event.clientX,\n      viewportWidth: window.innerWidth,\n    }));\n  }\n\n  function handleDrawerResizeEnd(event: ReactPointerEvent<HTMLElement>) {\n    const resize = drawerResizeRef.current;\n    if (!resize || resize.pointerId !== event.pointerId) return;\n    drawerResizeRef.current = null;\n    if (resize.source === "collapse" && resize.didDrag) {\n      suppressDrawerCollapseClickRef.current = true;\n      window.setTimeout(() => { suppressDrawerCollapseClickRef.current = false; }, 0);\n    }\n    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);\n  }\n\n  function handleDrawerCollapseClick() {\n    if (suppressDrawerCollapseClickRef.current) {\n      suppressDrawerCollapseClickRef.current = false;\n      return;\n    }\n    closeMap();\n  }\n`,
  "drawer resize move and end",
);

launcher = replaceOnce(
  launcher,
  `  const drawerCollapseControl = open && presentation === "drawer" ? <button\n    type="button"\n    className={\`campaign-map-drawer-collapse campaign-map-drawer-collapse-${drawerDock}\`}\n    aria-label="Collapse map"\n    aria-expanded="true"\n    onClick={closeMap}\n  >Close Map</button> : null;`,
  `  const drawerCollapseControl = open && presentation === "drawer" ? <button\n    type="button"\n    className={\`campaign-map-drawer-collapse campaign-map-drawer-collapse-${drawerDock}\`}\n    aria-label="Close map; drag horizontally to resize side drawer"\n    aria-expanded="true"\n    title="Click to close. Drag horizontally to resize the map drawer."\n    onPointerDown={event => handleDrawerResizeStart(event, "collapse")}\n    onPointerMove={handleDrawerResizeMove}\n    onPointerUp={handleDrawerResizeEnd}\n    onPointerCancel={handleDrawerResizeEnd}\n    onClick={handleDrawerCollapseClick}\n  >\n    <span className="campaign-map-drawer-grip" aria-hidden="true" />\n    <span className="campaign-map-drawer-collapse-label">Close Map</span>\n    <span className="campaign-map-drawer-grip" aria-hidden="true" />\n  </button> : null;`,
  "drawer collapse handle",
);

await writeFile(launcherPath, launcher);

const cssPath = "app/campaigns/campaign-map.css";
let css = await readFile(cssPath, "utf8");

css = replaceOnce(
  css,
  `  padding: .7rem .35rem;\n  writing-mode: vertical-rl;\n  text-orientation: mixed;\n  font: 600 .78rem/1 var(--font-ui, sans-serif);\n  letter-spacing: .08em;\n  cursor: pointer;\n  pointer-events: auto;\n  transform: translateY(-50%);`,
  `  padding: .7rem .35rem;\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  justify-content: center;\n  gap: .45rem;\n  font: 600 .78rem/1 var(--font-ui, sans-serif);\n  letter-spacing: .08em;\n  cursor: ew-resize;\n  touch-action: none;\n  user-select: none;\n  pointer-events: auto;\n  transform: translateY(-50%);`,
  "collapse handle layout",
);

css = replaceOnce(
  css,
  `.campaign-map-drawer-collapse-left {\n`,
  `.campaign-map-drawer-collapse-label {\n  writing-mode: vertical-rl;\n  text-orientation: mixed;\n}\n\n.campaign-map-drawer-grip {\n  width: .95rem;\n  height: .34rem;\n  flex: 0 0 auto;\n  color: color-mix(in srgb, var(--text, #f4ead8) 62%, var(--border, #725f47) 38%);\n  background:\n    radial-gradient(circle at 20% 50%, currentColor 0 1.35px, transparent 1.6px),\n    radial-gradient(circle at 50% 50%, currentColor 0 1.35px, transparent 1.6px),\n    radial-gradient(circle at 80% 50%, currentColor 0 1.35px, transparent 1.6px);\n  opacity: .65;\n  filter: drop-shadow(0 1px 0 rgba(0, 0, 0, .55));\n  transition: opacity .16s ease, color .16s ease;\n}\n\n.campaign-map-drawer-collapse:hover .campaign-map-drawer-grip,\n.campaign-map-drawer-collapse:focus-visible .campaign-map-drawer-grip,\n.campaign-map-drawer-collapse:active .campaign-map-drawer-grip {\n  color: var(--accent, #d5a65b);\n  opacity: 1;\n}\n\n.campaign-map-drawer-collapse-left {\n`,
  "collapse grip styles",
);

await writeFile(cssPath, css);

const testPath = "tests/campaign-map-drawer.test.mjs";
let tests = await readFile(testPath, "utf8");

tests = replaceOnce(
  tests,
  `  assert.match(launcher, /campaign-map-drawer-collapse/u);\n  assert.match(launcher, /aria-label="Collapse map"/u);\n  assert.match(launcher, />Close Map<\\/button> : null/u);`,
  `  assert.match(launcher, /campaign-map-drawer-collapse/u);\n  assert.match(launcher, /aria-label="Close map; drag horizontally to resize side drawer"/u);\n  assert.match(launcher, /source: "divider" \\| "collapse"/u);\n  assert.match(launcher, /suppressDrawerCollapseClickRef/u);\n  assert.match(launcher, /onPointerDown=\\{event => handleDrawerResizeStart\\(event, "collapse"\\)\\}/u);\n  assert.match(launcher, /campaign-map-drawer-grip/u);\n  assert.match(launcher, /campaign-map-drawer-collapse-label">Close Map<\\/span>/u);`,
  "drawer handle launcher assertions",
);

tests = replaceOnce(
  tests,
  `  assert.match(css, /campaign-map-drawer-collapse[\\s\\S]*?transition: left \\.24s ease, right \\.24s ease/u);`,
  `  assert.match(css, /campaign-map-drawer-collapse[\\s\\S]*?cursor: ew-resize[\\s\\S]*?touch-action: none/u);\n  assert.match(css, /campaign-map-drawer-collapse-label[\\s\\S]*?writing-mode: vertical-rl/u);\n  assert.match(css, /campaign-map-drawer-grip[\\s\\S]*?radial-gradient\\(circle at 20% 50%[\\s\\S]*?radial-gradient\\(circle at 80% 50%/u);\n  assert.match(css, /campaign-map-drawer-collapse[\\s\\S]*?transition: left \\.24s ease, right \\.24s ease/u);`,
  "drawer handle css assertions",
);

await writeFile(testPath, tests);
