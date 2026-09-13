import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Dice Style switching clears stale renderer materials before loading the requested custom colorset", async () => {
  const source = await readFile(new URL("../app/virtual-dice-adapter.ts", import.meta.url), "utf8");

  assert.match(source, /export async function applyRendererDiceStyle\(box: DiceBox, style: DiceStyleId\)/);
  assert.match(source, /box\.clearDice\(\)/);
  assert.match(source, /runtime\.DiceFactory\.materials_cache = \{\}/);
  assert.match(source, /runtime\.theme_customColorset = rendererConfigForDiceStyle\(style\)/);
  assert.match(source, /await runtime\.loadTheme\(\{/);
  assert.match(source, /colorset: runtime\.theme_colorset/);
  assert.match(source, /texture: runtime\.theme_texture/);
  assert.match(source, /material: runtime\.theme_material/);
});

test("the adapter routes every actual style change through the cache-safe loader", async () => {
  const source = await readFile(new URL("../app/virtual-dice-adapter.ts", import.meta.url), "utf8");

  assert.match(source, /private currentStyle: DiceStyleId \| null = null/);
  assert.match(source, /if \(!this\.box \|\| this\.currentStyle === style\) return/);
  assert.match(source, /await applyRendererDiceStyle\(this\.box, style\)/);
  assert.match(source, /this\.currentStyle = style/);
  assert.match(source, /if \(this\.initializing\) \{\s*await this\.initializing;\s*await this\.applyStyle\(style\)/s);
  assert.doesNotMatch(source, /this\.box\.updateConfig\(\{\s*theme_customColorset/);
});
