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
  `  >\n    <span className="campaign-map-drawer-grip" aria-hidden="true" />\n    <span className="campaign-map-drawer-collapse-label">Close Map</span>\n    <span className="campaign-map-drawer-grip" aria-hidden="true" />\n  </button> : null;`,
  `  >\n    <span className="campaign-map-drawer-collapse-label">Close Map</span>\n  </button> : null;`,
  "drawer close markup",
);
await writeFile(launcherPath, launcher);

const cssPath = "app/campaigns/campaign-map.css";
let css = await readFile(cssPath, "utf8");
const gripBlock = /\n\.campaign-map-drawer-grip \{[\s\S]*?\n\.campaign-map-drawer-collapse:active \.campaign-map-drawer-grip \{[\s\S]*?\n\}\n/u;
if (!gripBlock.test(css)) throw new Error("grip CSS block not found");
css = css.replace(gripBlock, "\n");
await writeFile(cssPath, css);

const testPath = "tests/campaign-map-drawer.test.mjs";
let testSource = await readFile(testPath, "utf8");
testSource = replaceOnce(testSource, "  assert.match(launcher, /campaign-map-drawer-grip/u);\n", "", "launcher grip assertion");
testSource = replaceOnce(testSource, "  assert.match(css, /campaign-map-drawer-grip[\\s\\S]*?radial-gradient\\(circle at 20% 50%[\\s\\S]*?radial-gradient\\(circle at 80% 50%/u);\n", "", "CSS grip assertion");
await writeFile(testPath, testSource);
