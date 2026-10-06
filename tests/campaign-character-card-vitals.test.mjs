import assert from "node:assert/strict";
import test from "node:test";
import {
  campaignCardArmorClass,
  campaignCardHpMax,
  campaignCharacterStatus,
  campaignGmPartyStatus,
} from "../lib/campaigns/character-card.ts";

const cecilLikeSnapshot = {
  level: 5,
  classMode: "full",
  classOne: "High Mage",
  attrs: { STR: 9, DEX: 9, CON: 12, INT: 18, WIS: 14, CHA: 9 },
  armor: "No Armor",
  shield: "",
  armorBonus: 0,
  hpCurrent: 10,
  hpMax: 18,
  hpRolls: [2, 6, 10, 15, 18],
  focusPicks: [{ name: "Impervious Defense" }],
};

const rolfeLikeSnapshot = {
  level: 5,
  classMode: "adventurer",
  classOne: "Expert",
  classTwo: "Beastmaster",
  attrs: { STR: 10, DEX: 7, CON: 12, INT: 10, WIS: 14, CHA: 10 },
  armor: "No Armor",
  shield: "",
  armorBonus: 0,
  hpCurrent: 30,
  hpMax: 26,
  hpRolls: [],
  focusPicks: [],
  artPicks: ["Bind Companion", "Feral Toughness"],
  companions: [{ kind: "beastmaster", bound: true, hitDice: "4 HD" }],
};

test("campaign vitals use WWN attribute modifiers instead of D&D-style modifiers", () => {
  assert.equal(campaignCardHpMax(cecilLikeSnapshot), 13);
  assert.equal(campaignCardArmorClass(cecilLikeSnapshot), 18);
});

test("GM party projections share the same canonical WWN modifiers", () => {
  const status = campaignGmPartyStatus(cecilLikeSnapshot, {
    id: "chr_cecil",
    name: "Cecil the Amber",
    player: "Kris",
    level: 5,
    classLabel: "High Mage",
  });

  assert.equal(status.hpCurrent, 10);
  assert.equal(status.hpMax, 13);
  assert.equal(status.armorClass, 18);
  assert.deepEqual(status.saves, {
    physical: 11,
    evasion: 9,
    mental: 10,
    luck: 11,
  });
});

test("live-session character status includes Feral Toughness AC and bound-companion HP", () => {
  const status = campaignCharacterStatus(rolfeLikeSnapshot, {
    id: "chr_rolfe",
    name: "Rolfe Goldmaine",
    level: 5,
    classLabel: "Expert / Beastmaster Adventurer",
  });

  assert.equal(status.hpCurrent, 30);
  assert.equal(status.hpMax, 30);
  assert.equal(status.armorClass, 15);
});
