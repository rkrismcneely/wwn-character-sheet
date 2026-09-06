import { readFile, writeFile } from "node:fs/promises";

const adapterPath = "app/virtual-dice-adapter.ts";
let adapterSource = await readFile(adapterPath, "utf8");
adapterSource = adapterSource.replace(
  `      const [{ DiceBox }, { HemisphereLight }] = await Promise.all([\n        loadDiceBoxModule(),\n        import("three"),\n      ]);`,
  `      const threeModuleName = "three";\n      const [{ DiceBox }, { HemisphereLight }] = await Promise.all([\n        loadDiceBoxModule(),\n        import(threeModuleName),\n      ]);`,
);
if (!adapterSource.includes('const threeModuleName = "three";') || !adapterSource.includes("import(threeModuleName)")) {
  throw new Error("lazy Three runtime import was not materialized");
}
await writeFile(adapterPath, adapterSource);

const testPath = "tests/roll-ui.test.mjs";
let testSource = await readFile(testPath, "utf8");
testSource = testSource.replace(
  `  assert.match(adapterSource, /import\\("three"\\)/);`,
  `  assert.match(adapterSource, /const threeModuleName = "three"/);\n  assert.match(adapterSource, /import\\(threeModuleName\\)/);`,
);
if (!testSource.includes('assert.match(adapterSource, /const threeModuleName = "three"/)')) {
  throw new Error("lazy Three import regression assertion was not materialized");
}
await writeFile(testPath, testSource);
