"use client";

import type { DiceBox, DiceConfig } from "@drdreo/dice-box-threejs";
import {
  rendererConfigForDiceStyle,
  type DiceStyleId,
} from "./virtual-dice-style";

export type VirtualDiceTheme = "light" | "dark";

export type VirtualDiceRequest = {
  dice: Array<{ sides: number; value: number }>;
  style: DiceStyleId;
};

type DiceBoxModule = typeof import("@drdreo/dice-box-threejs");

let diceBoxModule: Promise<DiceBoxModule> | null = null;

function loadDiceBoxModule() {
  diceBoxModule ||= import("@drdreo/dice-box-threejs");
  return diceBoxModule;
}

function notationFor(request: VirtualDiceRequest) {
  return `${request.dice.map(die => `1d${die.sides}`).join("+")}@${request.dice.map(die => die.value).join(",")}`;
}

export class VirtualDiceRendererAdapter {
  private box: DiceBox | null = null;
  private initializing: Promise<void> | null = null;
  private active = false;
  private contextLost = false;
  private readonly container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  private async initialize(style: DiceStyleId) {
    if (this.box?.initialized) {
      await this.box.updateConfig({ theme_customColorset: rendererConfigForDiceStyle(style) });
      return;
    }
    if (this.initializing) {
      await this.initializing;
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
        light_intensity: 1.4,
        baseScale: 70,
        strength: 1,
        iterationLimit: 1400,
      };
      const box = new DiceBox(this.container, config);
      await box.initialize();
      this.box = box;
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
    this.container.replaceChildren();
  }
}
