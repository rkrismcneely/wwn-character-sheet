import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { applyRendererDiceStyle } from "../app/virtual-dice-adapter.ts";
import { DICE_STYLE_RENDERER_CONFIG } from "../app/virtual-dice-style.ts";

test("switching Dice Styles clears stale material canvases and loads the requested custom theme", async () => {
  const loadedThemes = [];
  let clearCalls = 0;
  const box = {
    clearDice() {
      clearCalls += 1;
    },
    DiceFactory: {
      materials_cache: { stale: true },
    },
    theme_customColorset: DICE_STYLE_RENDERER_CONFIG["ivory-gold"],
    theme_colorset: "white",
    theme_texture: "",
    theme_material: "plastic",
    async loadTheme(theme) {
      loadedThemes.push({ theme, colorset: this.theme_customColorset });
    },
  };

  await applyRendererDiceStyle(box, "dragon-scale");

  assert.equal(clearCalls, 1);
  assert.deepEqual(box.DiceFactory.materials_cache, {});
  assert.equal(box.theme_customColorset, DICE_STYLE_RENDERER_CONFIG["dragon-scale"]);
  assert.deepEqual(loadedThemes, [{
    theme: { colorset: "white", texture: "", material: "plastic" },
    colorset: DICE_STYLE_RENDERER_CONFIG["dragon-scale"],
  }]);

  box.DiceFactory.materials_cache.staleAgain = true;
  await applyRendererDiceStyle(box, "astral-nebula");

  assert.equal(clearCalls, 2);
  assert.deepEqual(box.DiceFactory.materials_cache, {});
  assert.equal(box.theme_customColorset, DICE_STYLE_RENDERER_CONFIG["astral-nebula"]);
  assert.equal(loadedThemes.at(-1).colorset, DICE_STYLE_RENDERER_CONFIG["astral-nebula"]);
});

test("the adapter routes initialized style changes through the cache-safe style loader", async () => {
  const source = await readFile(new URL("../app/virtual-dice-adapter.ts", import.meta.url), "utf8");
  assert.match(source, /private currentStyle: DiceStyleId \| null = null/);
  assert.match(source, /await applyRendererDiceStyle\(this\.box, style\)/);
  assert.doesNotMatch(source, /this\.box\.updateConfig\(\{\s*theme_customColorset/);
});
