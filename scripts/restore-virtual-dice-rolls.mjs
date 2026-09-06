import { readFile, writeFile } from "node:fs/promises";

function replaceOnce(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`${label}: expected source anchor not found`);
  if (source.indexOf(before) !== source.lastIndexOf(before)) throw new Error(`${label}: source anchor is not unique`);
  return source.replace(before, after);
}

const adapterPath = "app/virtual-dice-adapter.ts";
let adapter = await readFile(adapterPath, "utf8");

adapter = replaceOnce(
  adapter,
  `type DiceBoxWithTextureRegistry = DiceBox & {\n  DiceColors: DiceTextureRegistry;\n};\ntype DiceBoxRendererInternals = DiceBoxWithTextureRegistry & {\n  scene: { add: (object: unknown) => void };\n};`,
  `type DiceBoxWithTextureRegistry = DiceBox & {\n  DiceColors: DiceTextureRegistry;\n};`,
  "remove renderer-internals type",
);

adapter = replaceOnce(
  adapter,
  `      const threeModuleName = "three";\n      const [{ DiceBox }, { HemisphereLight }] = await Promise.all([\n        loadDiceBoxModule(),\n        import(threeModuleName),\n      ]);`,
  `      const { DiceBox } = await loadDiceBoxModule();`,
  "remove runtime Three import",
);

adapter = replaceOnce(
  adapter,
  `        light_intensity: 1.4,`,
  `        // dice-box-threejs already creates both its spotlight and hemisphere\n        // fill light from this supported setting; no extra Three.js import is needed.\n        light_intensity: 1.6,`,
  "raise renderer-native lighting",
);

adapter = replaceOnce(
  adapter,
  `      // dice-box-threejs predates Three.js' physically-correct lighting default.\n      // A neutral hemispheric fill keeps textured faces and numerals readable at\n      // every resting angle while the renderer's spotlight retains direction.\n      const fillLight = new HemisphereLight(0xffffff, 0xb8c1cb, 1.05);\n      fillLight.name = "twe-dice-fill-light";\n      (box as DiceBoxRendererInternals).scene.add(fillLight);\n`,
  ``,
  "remove extra fill light",
);

await writeFile(adapterPath, adapter);

const testPath = "tests/roll-ui.test.mjs";
let tests = await readFile(testPath, "utf8");
const oldTest = `test("virtual dice lighting keeps every resting face legible", () => {\n  assert.match(adapterSource, /const threeModuleName = "three"/);\n  assert.match(adapterSource, /import\\(threeModuleName\\)/);\n  assert.match(adapterSource, /HemisphereLight/);\n  assert.match(adapterSource, /twe-dice-fill-light/);\n  assert.match(adapterSource, /scene\\.add\\(fillLight\\)/);\n});`;
const newTest = `test("virtual dice readability uses renderer-native lighting without a runtime Three import", () => {\n  assert.match(adapterSource, /light_intensity: 1\\.6/);\n  assert.doesNotMatch(adapterSource, /const threeModuleName = "three"/);\n  assert.doesNotMatch(adapterSource, /import\\(threeModuleName\\)|HemisphereLight|twe-dice-fill-light|scene\\.add\\(fillLight\\)/);\n  assert.match(adapterSource, /import\\("@drdreo\\/dice-box-threejs"\\)/);\n});`;
tests = replaceOnce(tests, oldTest, newTest, "replace unsafe lighting regression test");
await writeFile(testPath, tests);
