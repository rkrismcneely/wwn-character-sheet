"use client";

import type { DiceBox, DiceConfig } from "@drdreo/dice-box-threejs";
import {
  rendererConfigForDiceStyle,
  rendererTextureForKey,
  type DiceStyleId,
  type DiceStyleRendererConfig,
} from "./virtual-dice-style";

export type VirtualDiceTheme = "light" | "dark";

export type VirtualDiceRequest = {
  dice: Array<{ sides: number; value: number }>;
  style: DiceStyleId;
};

type DiceBoxModule = typeof import("@drdreo/dice-box-threejs");
type DiceTextureRegistry = {
  getTexture: (texture: unknown) => unknown;
};
type DiceFactoryStyleCache = {
  materials_cache: Record<string, unknown>;
};
type DiceBoxWithTextureRegistry = DiceBox & {
  DiceColors: DiceTextureRegistry;
};
type DiceBoxStyleRuntime = DiceBoxWithTextureRegistry & {
  DiceFactory: DiceFactoryStyleCache;
  theme_customColorset: DiceStyleRendererConfig | null;
  theme_colorset?: string;
  theme_texture?: string;
  theme_material?: string;
  loadTheme: (theme: {
    colorset?: string;
    texture?: string;
    material?: string;
  }) => Promise<void>;
};

let diceBoxModule: Promise<DiceBoxModule> | null = null;

function loadDiceBoxModule() {
  diceBoxModule ||= import("@drdreo/dice-box-threejs");
  return diceBoxModule;
}

function notationFor(request: VirtualDiceRequest) {
  return `${request.dice.map(die => `1d${die.sides}`).join("+")}@${request.dice.map(die => die.value).join(",")}`;
}

function installStyleTextureRegistry(box: DiceBox) {
  const diceColors = (box as DiceBoxWithTextureRegistry).DiceColors;
  const getBuiltInTexture = diceColors.getTexture.bind(diceColors);
  diceColors.getTexture = texture => {
    if (typeof texture === "string") {
      const styleTexture = rendererTextureForKey(texture);
      if (styleTexture) return { ...styleTexture };
    }
    return getBuiltInTexture(texture);
  };
}

/**
 * Apply a new custom Dice Style without reusing the renderer's material-canvas
 * cache from a previous style. The pinned dice-box renderer's public
 * updateConfig path is unreliable for repeated custom texture changes, so this
 * uses the same loadTheme routine that initialization uses after replacing the
 * custom colorset and clearing only the renderer's derived material cache.
 */
export async function applyRendererDiceStyle(box: DiceBox, style: DiceStyleId) {
  const runtime = box as DiceBoxStyleRuntime;
  box.clearDice();
  runtime.DiceFactory.materials_cache = {};
  runtime.theme_customColorset = rendererConfigForDiceStyle(style);
  await runtime.loadTheme({
    colorset: runtime.theme_colorset,
    texture: runtime.theme_texture,
    material: runtime.theme_material,
  });
}

export class VirtualDiceRendererAdapter {
  private box: DiceBox | null = null;
  private initializing: Promise<void> | null = null;
  private currentStyle: DiceStyleId | null = null;
  private active = false;
  private contextLost = false;
  private readonly container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  private async applyStyle(style: DiceStyleId) {
    if (!this.box || this.currentStyle === style) return;
    await applyRendererDiceStyle(this.box, style);
    this.currentStyle = style;
  }

  private async initialize(style: DiceStyleId) {
    if (this.box?.initialized) {
      await this.applyStyle(style);
      return;
    }
    if (this.initializing) {
      await this.initializing;
      await this.applyStyle(style);
      return;
    }

    this.initializing = (async () => {
      const { DiceBox } = await loadDiceBoxModule();
      const config: Partial<DiceConfig> = {
        assetPath: "/assets/virtual-dice/",
        sounds: false,
        shadows: false,
        theme_surface: "green-felt",
        theme_material: "plastic",
        theme_customColorset: rendererConfigForDiceStyle(style),
        gravity_multiplier: 400,
        // dice-box-threejs already creates both its spotlight and hemisphere
        // fill light from this supported setting; no extra Three.js import is needed.
        color_spotlight: 0xffffff,
        light_intensity: 2.8,
        baseScale: 70,
        strength: 1,
        iterationLimit: 1400,
      };
      const box = new DiceBox(this.container, config);
      installStyleTextureRegistry(box);
      await box.initialize();
      this.box = box;
      this.currentStyle = style;
      const canvas = this.container.querySelector("canvas");
      canvas?.addEventListener("webglcontextlost", () => {
        this.contextLost = true;
        this.box?.clearDice();
      }, { passive: true });
    })();

    try {
      await this.initializing;
    } finally {
      this.initializing = null;
    }
  }

  async init(style: DiceStyleId) {
    await this.initialize(style);
  }

  async roll(request: VirtualDiceRequest) {
    if (this.active) throw new Error("A virtual dice roll is already active.");
    this.active = true;
    this.contextLost = false;
    try {
      await this.initialize(request.style);
      if (!this.box) throw new Error("The virtual dice renderer did not initialize.");
      const box = this.box;
      const canvas = this.container.querySelector("canvas");
      const contextFailure = new Promise<never>((_, reject) => {
        const onContextLost = () => reject(new Error("The WebGL dice context was lost."));
        canvas?.addEventListener("webglcontextlost", onContextLost, { once: true, passive: true });
      });
      await Promise.race([box.roll(notationFor(request)), contextFailure]);
      if (this.contextLost) throw new Error("The WebGL dice context was lost.");
    } finally {
      this.active = false;
    }
  }

  cancel() {
    this.box?.clearDice();
    this.active = false;
  }

  destroy() {
    this.cancel();
    this.box = null;
    this.currentStyle = null;
    this.container.replaceChildren();
  }
}
