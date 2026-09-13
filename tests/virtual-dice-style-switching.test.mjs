import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../app/virtual-dice-adapter.ts", import.meta.url), "utf8");

test("Dice Style changes use a fresh renderer instead of reusing private style caches", () => {
  assert.match(source, /if \(this\.box\?\.initialized && this\.currentStyle === style\) return/);
  assert.match(source, /if \(this\.box\) this\.discardCurrentBox\(\)/);
  assert.match(source, /const box = new DiceBox\(this\.container, config\)/);
  assert.match(source, /theme_customColorset: rendererConfigForDiceStyle\(style\)/);
  assert.match(source, /this\.currentStyle = style/);
  assert.doesNotMatch(source, /updateConfig\(\{\s*theme_customColorset/);
  assert.doesNotMatch(source, /applyRendererDiceStyle/);
});

test("discarding a style renderer clears dice, disposes WebGL resources, and removes its canvas", () => {
  assert.match(source, /function disposeDiceBox\(box: DiceBox\)/);
  assert.match(source, /box\.clearDice\(\)/);
  assert.match(source, /runtime\.renderer\?\.dispose\?\.\(\)/);
  assert.match(source, /runtime\.renderer\?\.domElement\?\.remove\(\)/);
  assert.match(source, /this\.box = null/);
  assert.match(source, /this\.currentStyle = null/);
});

test("context-loss handling is scoped to the renderer instance that raised it", () => {
  assert.match(source, /if \(this\.box !== box\) return/);
  assert.match(source, /this\.contextLost = true/);
  assert.match(source, /box\.clearDice\(\)/);
});
