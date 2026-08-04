import { additionalClassData } from "./additional-class-data.ts";

export type ClassKind = "warrior" | "expert" | "mage";
export type AdditionalTraditionName = keyof typeof additionalClassData;
export type TraditionName = "High Mage" | "Elementalist" | "Necromancer" | "Healer" | "Vowed" | "Invoker" | AdditionalTraditionName;

export const fullClasses = ["Warrior", "Expert", "High Mage", "Elementalist", "Necromancer", "Invoker"] as const;
export const partialClasses = [
  "Warrior", "Expert", "High Mage", "Elementalist", "Necromancer", "Healer", "Vowed",
  "Accursed", "Bard", "Beastmaster", "Blood Priest", "Duelist", "Mageslayer",
  "Skinshifter", "Thought Noble", "Wise", "Invoker",
] as const;

export const traditionKinds: Record<string, ClassKind> = {
  Warrior: "warrior",
  Expert: "expert",
  "High Mage": "mage",
  Elementalist: "mage",
  Necromancer: "mage",
  Healer: "mage",
  Vowed: "mage",
  Invoker: "mage",
  ...Object.fromEntries(Object.entries(additionalClassData).map(([name, data]) => [name, data.kind])),
};

const fullMage = [
  { max: 1, casts: 1, prepared: 3, arts: 2 },
  { max: 1, casts: 1, prepared: 3, arts: 3 },
  { max: 2, casts: 2, prepared: 4, arts: 3 },
  { max: 2, casts: 2, prepared: 5, arts: 4 },
  { max: 3, casts: 3, prepared: 6, arts: 4 },
  { max: 3, casts: 3, prepared: 7, arts: 5 },
  { max: 4, casts: 4, prepared: 8, arts: 5 },
  { max: 4, casts: 4, prepared: 9, arts: 6 },
  { max: 5, casts: 5, prepared: 10, arts: 6 },
  { max: 5, casts: 6, prepared: 12, arts: 7 },
] as const;

const partialMage = [
  { max: 1, casts: 1, prepared: 2, arts: 1 },
  { max: 1, casts: 1, prepared: 3, arts: 2 },
  { max: 1, casts: 1, prepared: 3, arts: 3 },
  { max: 1, casts: 2, prepared: 4, arts: 3 },
  { max: 2, casts: 2, prepared: 5, arts: 3 },
  { max: 2, casts: 3, prepared: 6, arts: 4 },
  { max: 2, casts: 3, prepared: 7, arts: 4 },
  { max: 2, casts: 3, prepared: 7, arts: 4 },
  { max: 3, casts: 4, prepared: 8, arts: 5 },
  { max: 3, casts: 4, prepared: 9, arts: 5 },
] as const;

export const traditionArtProgression = {
  "High Mage": [2, 3, 3, 4, 4, 5, 5, 6, 6, 7],
  Elementalist: [3, 4, 4, 5, 5, 6, 6, 7, 7, 8],
  Necromancer: [1, 2, 2, 3, 3, 4, 4, 5, 5, 6],
  Healer: [2, 3, 3, 4, 5, 6, 6, 7, 7, 8],
  Vowed: [4, 5, 5, 6, 7, 8, 8, 9, 9, 10],
  Invoker: [0,0,0,0,0,0,0,0,0,0],
  ...Object.fromEntries(Object.entries(additionalClassData).map(([name, data]) => [name, data.progression])),
} as unknown as Record<TraditionName, readonly number[]>;

export const partialTraditionArtProgression = {
  "High Mage": [1, 2, 3, 3, 3, 4, 4, 4, 5, 5],
  Elementalist: [3, 3, 4, 4, 4, 5, 5, 5, 6, 6],
  Necromancer: [1, 1, 2, 2, 2, 3, 3, 3, 4, 4],
  Healer: traditionArtProgression.Healer,
  Vowed: traditionArtProgression.Vowed,
  Invoker: traditionArtProgression.Invoker,
  ...Object.fromEntries(Object.entries(additionalClassData).map(([name, data]) => [name, data.progression])),
} as unknown as Record<TraditionName, readonly number[]>;

export function artSlots(tradition: TraditionName, level: number, partial: boolean) {
  const index = Math.min(10, Math.max(1, level)) - 1;
  return (partial ? partialTraditionArtProgression : traditionArtProgression)[tradition][index];
}

export function knownSpellSlots(traditions: readonly TraditionName[], level: number, partial: boolean) {
  const spellcasters = traditions.filter(tradition => traditionInfo[tradition]?.spells);
  const boundedLevel = Math.min(10, Math.max(1, level));
  if (partial && spellcasters.length > 1) return boundedLevel * 2 + 2;
  return spellcasters.reduce((total, tradition) => total + (
    tradition === "Invoker"
      ? partial ? boundedLevel + 1 : boundedLevel * 2 + 2
      : tradition === "High Mage"
      ? partial ? boundedLevel * 2 : boundedLevel * 2 + 2
      : partial ? boundedLevel + 1 : boundedLevel + 3
  ), 0);
}

export function casterLimits(level: number, partial: boolean) {
  return (partial ? partialMage : fullMage)[Math.min(10, Math.max(1, level)) - 1];
}

export function dualCasterLimits(level: number) {
  return [
    {max:1,casts:1,prepared:3},{max:1,casts:1,prepared:4},{max:1,casts:2,prepared:5},
    {max:2,casts:2,prepared:6},{max:2,casts:2,prepared:8},{max:2,casts:3,prepared:9},
    {max:3,casts:3,prepared:10},{max:3,casts:4,prepared:12},{max:3,casts:4,prepared:13},
    {max:4,casts:5,prepared:15},
  ][Math.min(10,Math.max(1,level))-1];
}

export function invokerLimits(level: number, partial: boolean, intelligenceModifier: number) {
  const index = Math.min(10, Math.max(1, level)) - 1;
  const full = [
    {max:1,points:2,prepared:2},{max:1,points:3,prepared:3},{max:2,points:4,prepared:4},
    {max:2,points:5,prepared:4},{max:3,points:6,prepared:5},{max:3,points:7,prepared:6},
    {max:4,points:8,prepared:7},{max:4,points:9,prepared:7},{max:5,points:10,prepared:8},
    {max:5,points:11,prepared:9},
  ];
  const half = [
    {max:1,points:1,prepared:2},{max:1,points:1,prepared:3},{max:1,points:2,prepared:3},
    {max:1,points:2,prepared:4},{max:2,points:3,prepared:4},{max:2,points:3,prepared:5},
    {max:2,points:4,prepared:5},{max:2,points:4,prepared:6},{max:3,points:5,prepared:6},
    {max:3,points:6,prepared:7},
  ];
  const row = (partial ? half : full)[index];
  return {
    max: row.max,
    casts: Math.max(0, row.points + intelligenceModifier),
    prepared: Math.max(0, row.prepared + intelligenceModifier),
    arts: 0,
  };
}

export function classRules(mode: "full" | "adventurer", first: string, second: string, level: number) {
  const l = Math.min(10, Math.max(1, level));
  const picks = 1 + (l >= 2 ? 1 : 0) + (l >= 5 ? 1 : 0) + (l >= 7 ? 1 : 0) + (l >= 10 ? 1 : 0);
  if (mode === "full") {
    if (first === "Warrior") return { attack: l, hitDice: `${l}d6+${l * 2}`, focusPicks: picks + 1, summary: "Killing Blow adds half level, rounded up, to damage and Shock. Veteran’s Luck can force one hit or miss once per scene." };
    if (first === "Expert") return { attack: Math.floor(l / 2), hitDice: `${l}d6`, focusPicks: picks + 1, summary: "Masterful Expertise rerolls one failed non-combat skill check per scene. Quick Learner grants one extra non-combat skill point each level." };
    return { attack: Math.floor(l / 5), hitDice: `${l}d6-${l}`, focusPicks: picks, summary: `${first} spellcasting, arts, and Effort. Magic is a bonus skill. Armor and shields normally prevent spellcasting and arts.` };
  }
  const selected = [first, second];
  const kinds = selected.map(name => traditionKinds[name]);
  const hasWarriorAttack = kinds.includes("warrior");
  const hasExpertAttack = kinds.includes("expert");
  const standardWarrior = selected.includes("Warrior");
  const standardExpert = selected.includes("Expert");
  const duelistFragility = selected.includes("Duelist");
  const attack = hasWarriorAttack ? [1,2,2,3,4,5,5,6,6,7][l-1] : hasExpertAttack ? Math.floor(l/2) : Math.floor(l/5);
  let hitDice = standardWarrior && !duelistFragility ? `${l}d6+${l*2}` : hasExpertAttack || standardWarrior ? `${l}d6` : `${l}d6-${l}`;
  if (first === "Vowed" || second === "Vowed") hitDice = standardWarrior ? hitDice : `${l}d6`;
  const bonusFoci = Number(standardWarrior) + Number(standardExpert);
  const notes = [
    standardWarrior && "Partial Warrior: improved hit dice and attack; no Killing Blow or Veteran’s Luck.",
    standardExpert && "Partial Expert: Quick Learner; no Masterful Expertise.",
    selected.includes("Duelist") && standardWarrior && "Duelist fragility removes the Partial Warrior hit-point bonus.",
    selected.includes("Mageslayer") && "Mageslayer cannot be combined with a Mage partial class.",
    kinds.filter(k => k === "mage").length > 0 && "Each partial magical tradition uses its own arts, Effort, and restrictions.",
  ].filter(Boolean).join(" ");
  return { attack, hitDice, focusPicks: picks + bonusFoci, summary: notes };
}

export const traditionInfo = {
  "High Mage": {
    spells: true, effortSkill: "Magic", effortBase: 1,
    armor: "Cannot cast spells or use arts in armor, bulky clothing, or with a shield unless Armored Magic permits it.",
    arts: [],
  },
  Elementalist: {
    spells: true, effortSkill: "Magic", effortBase: 1,
    armor: "Cannot cast spells or use arts while armored or using a shield unless Armored Magic permits it.",
    arts: [
      {name:"Elemental Resilience",text:"You are unharmed by mundane extremes of cold or lesser heat, and suffer half damage from magical or extremely intense flame or frost."},
      {name:"Elemental Sparks",text:"Conjure petty amounts of flame, water, ice, stone, or wind for minor tricks. Conjured substances last no longer than a scene."},
      {name:"Beckoned Deluge",text:"Commit Effort for the scene as a Main Action to conjure enough water to drench one 10-foot cube per level within fifty feet per level."},
      {name:"Earthsight",text:"Commit Effort for the scene. See solid outlines in darkness and peer through feet of earth or stone equal to your level."},
      {name:"Elemental Blast",text:"Commit Effort for the scene to make an elemental ranged attack using Magic, dealing 1d6 plus level and attribute modifier."},
      {name:"Flamesight",text:"Commit Effort to perceive thermal gradients in darkness and optionally shed light from your eyes."},
      {name:"Pavis of Elements",text:"Commit Effort to gain +4 Armor Class, to a maximum AC of 18, while the Effort remains committed."},
      {name:"Petrifying Stare",text:"Commit Effort for the day; a visible target must make a Physical save or lose its Move action for half your caster level in rounds."},
      {name:"Rune of Destruction",text:"Commit Effort for the day to place a one-hour elemental rune that explodes in a five-foot radius for 2d6 plus caster level damage."},
      {name:"Steps of Air",text:"Commit Effort for the scene to grant brief flight, or as an Instant action to negate falling damage."},
      {name:"Stunning Shock",text:"Commit Effort for the day to stun a damp or metal-bearing target; a Physical save reduces the lost action."},
      {name:"Thermal Shield",text:"Commit Effort for the scene as an Instant action to negate one instance of fire or frost damage."},
    ],
  },
  Necromancer: {
    spells: true, effortSkill: "Magic", effortBase: 1,
    armor: "Cannot cast spells or use arts while armored or using a shield unless Armored Magic permits it.",
    arts: [
      {name:"Bonetalker",text:"See and communicate with undead; Commit Effort for the scene to sense a visible undead creature’s surface thoughts and commands."},
      {name:"Cold Flesh",text:"You need no sleep, suffer at most 2 Shock from an instance, and have natural AC 12 plus half level."},
      {name:"Consume Life Energy",text:"Consecrated melee attacks can heal you 1d6, up to the damage inflicted and target hit points remaining."},
      {name:"False Death",text:"Commit Effort to appear dead, suspend bodily needs, and resist disease or poison progression for up to one day per level."},
      {name:"Gravesight",text:"Commit Effort to see life energy, physical afflictions, and normally in perfect darkness."},
      {name:"Keeper of the Gate",text:"Control death around you; Commit Effort for the day to stabilize creatures in range, adding System Strain."},
      {name:"Life Bridge",text:"Commit Effort for the day to transfer hit points between two willing or helpless touched targets for a scene."},
      {name:"Master of Bones",text:"Undead roll twice and take the worse save against you; Commit Effort for the scene to negate an undead attack or power."},
      {name:"Red Harvest",text:"When an intelligent living creature dies nearby, Commit Effort for the day to heal or gain +4 on your next hit roll."},
      {name:"Unaging",text:"You cease normal aging until an extended natural maximum and become immune to poison and disease."},
      {name:"Uncanny Ichor",text:"Predators reject your blood and puncture wounds cannot kill you without catastrophic injury."},
      {name:"Unliving Persistence",text:"Commit Effort for the day to stabilize yourself or a touched creature when Mortally Wounded."},
    ],
  },
  Healer: {
    spells: false, effortSkill: "Heal", effortBase: 0, armor: "Healer arts can be used while armored or carrying a shield.",
    arts: [
      {name:"Healing Touch",text:"Commit Effort for the scene; heal a touched ally for 2d6 plus Heal as a Main Action, adding 1 System Strain."},
      {name:"Empowered Healer",text:"Add your level to Healing Touch healing."},
      {name:"Facile Healer",text:"Healing Touch no longer requires committed Effort to activate."},
      {name:"Far Healer",text:"Healing Touch can affect a visible target within ten feet per level."},
      {name:"Final Repose",text:"Commit Effort for the day to penalize a target’s Physical saves and prevent stabilization if reduced to zero."},
      {name:"Healer’s Eye",text:"Commit Effort to diagnose, see living creatures, and learn their current hit points."},
      {name:"Limb Restoration",text:"Commit all remaining Effort for the day to restore a missing limb or organ.",minLevel:8},
      {name:"Purge Ailment",text:"Commit Effort for the day to cure one poison or disease; at seventh level this costs Effort for the scene."},
      {name:"Refined Restoration",text:"You and tended allies lose 2 System Strain from a good night’s rest."},
      {name:"Revive the Fallen",text:"Commit Effort for the day to revive a recently slain touched creature.",minLevel:8},
      {name:"Swift Healer",text:"Use Healing Touch as an On Turn action a limited number of times each day."},
      {name:"The Healer’s Knife",text:"Use Healing Touch to damage a living target, taking the System Strain yourself."},
      {name:"Tireless Vigor",text:"Commit Effort to suspend bodily needs, exert tirelessly, and regain 1 hit point per hour."},
      {name:"Vital Furnace",text:"Commit Effort for the day to negate a non-mortal injury; you also automatically stabilize at zero hit points."},
    ],
  },
  Vowed: {
    spells: false, effortSkill: "Vowed", effortBase: 0, armor: "Vowed arts require freedom from armor, shields, and heavy clothing unless Armored Magic permits otherwise.",
    arts: [
      {name:"Martial Style",text:"Your hit die is never worse than 1d6 per level and your Punch class hit bonus is never worse than an Expert’s."},
      {name:"Unarmed Might",text:"Your unarmed damage and Shock improve by level; Punch skill may add to damage."},
      {name:"Unarmored Defense",text:"Without armor or shield, base AC is 13 plus half your level, rounded down."},
      {name:"Brutal Counter",text:"Commit Effort for the scene after a melee attack against you to make a free physical attack against the assailant."},
      {name:"Faultless Awareness",text:"You cannot be surprised and wake in time to respond to imminent peril."},
      {name:"Hurling Throw",text:"After a hit, Commit Effort for the scene to force a Physical save or throw the target prone."},
      {name:"The Inward Eye",text:"Commit Effort to perceive your surroundings as sight regardless of darkness, mist, blindness, or closed eyes."},
      {name:"Leap of the Heavens",text:"Commit Effort for the scene to leap exceptionally or negate falling damage."},
      {name:"Master’s Vigor",text:"Retain youthful vigor and regain 2 lost hit points per hour."},
      {name:"Mob Justice",text:"Commit Effort for the day to resist swarm attacks and become immune to Shock while engaged by multiple foes."},
      {name:"Nimble Ascent",text:"Commit Effort for the scene to move across walls, ceilings, and difficult terrain at full speed."},
      {name:"Purified Body",text:"Commit Effort for the day to cure poison or disease, or suspend bodily needs for 24 hours."},
      {name:"Revivifying Breath",text:"Commit Effort for the day to heal yourself 1d6 plus level without System Strain."},
      {name:"Shattering Strike",text:"Prepare a devastating blow that can break progressively tougher fixed barriers."},
      {name:"Style Weaponry",text:"Choose three weapon classes that may use Punch for hit rolls."},
      {name:"Unobtrusive Step",text:"Once per scene, Commit Effort for the day to reroll a failed Sneak or impersonation check."},
    ],
  },
  Invoker: {
    spells: true,
    effortSkill: "Magic",
    effortBase: 0,
    usesEffort: false,
    armor: "Invoker spellcasting follows the same armor and shield restrictions as High Magic.",
    arts: [],
  },
  ...Object.fromEntries(Object.entries(additionalClassData).map(([name, data]) => [
    name,
    {
      spells: false,
      effortSkill: data.skill,
      effortBase: 0,
      effortAttributes: data.attribute ? data.attribute.split("/") : [],
      usesEffort: name !== "Wise",
      armor: data.armor,
      arts: data.arts,
    },
  ])),
} as unknown as Record<TraditionName, {
  spells: boolean; effortSkill: string; effortBase: number; effortAttributes?: readonly string[];
  usesEffort?: boolean; armor: string; arts: readonly {name:string;text:string;minLevel?:number}[];
}>;

export const vowedProgression = [
  {hit:0,damage:"1d6",shock:"1/15",arts:4},{hit:1,damage:"1d6",shock:"2/15",arts:5},
  {hit:1,damage:"1d8",shock:"2/15",arts:5},{hit:2,damage:"1d8",shock:"2/15",arts:6},
  {hit:2,damage:"1d10",shock:"2/15",arts:7},{hit:3,damage:"1d10",shock:"3/15",arts:8},
  {hit:3,damage:"1d10+1",shock:"3/15",arts:8},{hit:4,damage:"1d10+1",shock:"3/15",arts:9},
  {hit:4,damage:"1d10+2",shock:"4/15",arts:9},{hit:5,damage:"1d10+3",shock:"4/15",arts:10},
] as const;

export const traditionSpells = {
  Elementalist: [
    {name:"Aqueous Harmony",level:1,text:"The caster and up to a dozen allies can breathe water, endure deep pressure and cold, see through water, move normally, and use attacks without aquatic hindrance for one hour per level."},
    {name:"Flame Scrying",level:1,text:"Sense open flames within thirty feet per level and see and hear through one chosen flame while remaining motionless."},
    {name:"Elemental Favor",level:1,text:"Ask a non-magical ten-foot cube of earth, stone, water, flame, or air to move or reshape itself until the end of the scene."},
    {name:"Elemental Spy",level:1,text:"Enchant a small elemental object and see and hear through it as a Main Action for one day per level."},
    {name:"Boreal Wings",level:2,text:"A visible ally flies at twice their movement rate for a scene, with longer durations for higher-level casters."},
    {name:"The Burrower Below",level:2,text:"Carve a stable passage through natural earth or stone up to twenty feet per level, or two feet per level through worked stone."},
    {name:"Flame Without End",level:2,text:"Make a flame effectively eternal and non-consuming. As a weapon it adds +2 damage to a hit but not Shock."},
    {name:"Pact of Stone and Sea",level:2,text:"Grant immunity for a scene to mundane injury from earth, water, fire, or wind and the chosen element’s secondary effects."},
    {name:"Elemental Vallation",level:3,text:"Create a shaped wall of earth, fire, water, or air ten feet long per level, each with its own defensive or damaging effect."},
    {name:"Like the Stones",level:3,text:"Take on qualities of stone, water, air, or fire for a scene, gaining the element’s special movement and defensive benefits."},
    {name:"Wind Walking",level:3,text:"Turn a visible creature and possessions into an insubstantial cloud able to fly and pass anywhere mist could reach for a scene."},
    {name:"Calcifying Scourge",level:4,text:"A target within one hundred feet must make a Physical save or turn to stone; a successful save still costs Move actions for 1d6 rounds."},
    {name:"Elemental Guardian",level:4,text:"Awaken a human-sized elemental mass as a loyal, intelligent guardian with statistics altered by its chosen substance."},
    {name:"Fury of the Elements",level:5,text:"Create a wandering thirty-foot cataclysm of molten rock, pyroclastic wind, and steam that inflicts 10d6 damage and destroys conventional structures."},
    {name:"Tremors of the Depths",level:5,text:"Over five minutes, call a quake that destroys non-magically reinforced structures, tunnels, and caves in a five-hundred-foot radius."},
  ],
  Necromancer: [
    {name:"Command the Dead",level:1,text:"Bind visible undead totaling twice your level in hit dice, subject to Mental saves penalized by your Magic skill."},
    {name:"Query the Skull",level:1,text:"Question a sufficiently intact corpse once, receiving up to one truthful, literal answer per caster level."},
    {name:"Smite the Dead",level:1,text:"Blast hostile undead in a twenty-foot radius for 1d10 damage per level; weaker undead may be destroyed outright."},
    {name:"Terrible Liveliness",level:1,text:"Give an undead creature the tangible appearance and ordinary physical functions of a healthy living being."},
    {name:"Augment Mortal Vitality",level:2,text:"A willing target gains a Physical save bonus, automatic stabilization, and one chance to undo a non-mortal injury during the scene."},
    {name:"Enfeebling Wave",level:2,text:"Living creatures in a twenty-foot radius save or move at half speed and roll attacks and damage twice, taking the worse result."},
    {name:"Final Death",level:2,text:"Curse one visible target per level so they cannot recover hit points and die instantly if Mortally Wounded."},
    {name:"Raise Corpse",level:2,text:"Animate a mostly-intact corpse or skeleton as a loyal 1 HD servant; active servants cannot exceed your level."},
    {name:"Compel Flesh",level:3,text:"Paralyze and physically command a living or embodied undead target; repeated saves tear their flesh for damage."},
    {name:"Festering Curse",level:3,text:"Afflict a living target with repulsive corpse-like qualities and a -2 social skill penalty until dispelled."},
    {name:"Forgetting the Grave",level:3,text:"A willing target cannot die for one round per level, though they may become Mortally Wounded when the spell ends."},
    {name:"Merge Souls",level:3,text:"Two willing or helpless touched targets pool hit points and communicate telepathically until daybreak."},
    {name:"Boneshaper",level:4,text:"Reshape a willing or helpless living or undead body over an hour, including limited exchanges between physical or Charisma modifiers."},
    {name:"Raise Grave Knight",level:4,text:"Raise a powerful corpse as one intelligent, self-repairing, utterly devoted 4 HD grave knight."},
    {name:"Call of the Tomb",level:5,text:"Enemies within forty feet save or suffer automatic hits, maximized damage dice, and loss of special defenses."},
    {name:"Everlasting",level:5,text:"As an Instant action, keep nearby allies above 0 HP for five rounds; afterward the caster falls to 1 HP."},
  ],
} as const;
