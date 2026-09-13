"use client";

import type { DiceBox, DiceConfig } from "@drdreo/dice-box-threejs";
import {
  rendererConfigForDiceStyle,
  rendererTextureForKey,
  type DiceStyleId,
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
type DiceBoxWithTextureRegistry = DiceBox & {
  DiceColors: DiceTextureRegistry;
};
type DiceBoxDisposableRuntime = DiceBox & {
  renderer?: {
    dispose?: () => void;
    domElement?: HTMLCanvasElement;
  };
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

function disposeDiceBox(box: DiceBox) {
  box.clearDice();
  const runtime = box as DiceBoxDisposableRuntime;
  runtime.renderer?.dispose?.();
  runtime.renderer?.domElement?.remove();
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

  private discardCurrentBox() {
    if (!this.box) return;
    const oldBox = this.box;
    this.box = null;
    this.currentStyle = null;
    disposeDiceBox(oldBox);
  }

  private async initialize(style: DiceStyleId) {
    if (this.box?.initialized && this.currentStyle === style) return;

    if (this.initializing) {
      await this.initializing;
      if (this.box?.initialized && this.currentStyle === style) return;
    }

    // dice-box-threejs retains several independent colorset, texture, and
    // material caches. Reusing one DiceBox across custom style changes can let
    // visual state from the previous set bleed into the next one. Style changes
    // are rare, so use a fresh renderer instance instead of trying to invalidate
    // private caches individually. Rolls that keep the same style still reuse the
    // existing initialized box.
    if (this.box) this.discardCurrentBox();

    const initialization = (async () => {
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
      try {
        await box.initialize();
      } catch (error) {
        disposeDiceBox(box);
        throw error;
      }

      this.box = box;
      this.currentStyle = style;
      const canvas = (box as DiceBoxDisposableRuntime).renderer?.domElement
        ?? this.container.querySelector("canvas");
      canvas?.addEventListener("webglcontextlost", () => {
        // Ignore a context event from a renderer that has already been replaced
        // by a later Dice Style.
        if (this.box !== box) return;
        this.contextLost = true;
        box.clearDice();
      }, { passive: true });
    })();

    this.initializing = initialization;
    try {
      await initialization;
    } finally {
      if (this.initializing === initialization) this.initializing = null;
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
      const canvas = (box as DiceBoxDisposableRuntime).renderer?.domElement
        ?? this.container.querySelector("canvas");
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
    this.discardCurrentBox();
    this.container.replaceChildren();
  }
}
