import type { StoreCatalogSeed } from "./store-catalog-types.ts";

const raw = String.raw`Magic Items|Amulet of Proof Against Detection|12500 sp|Wards the wearer from crystal balls, scrying, and other remote magical observation.
Magic Items|Bag of Holding|12500 sp|An extradimensional bag that can hold objects fitting within a roughly 10×5×3-foot volume, up to 100 ordinary items. The bag itself counts as 6 Encumbrance; its contents do not add further Encumbrance while inside.
Magic Items|Bag of Tricks|12500 sp|Pull out a small fuzzy sphere and throw it to produce a random animal that obeys the user until dismissed or destroyed.
Magic Items|Boots of Elvenkind|12500 sp|The wearer's footsteps make no sound. Other sources of noise can still reveal them.
Magic Items|Boots of Striding and Springing|12500 sp|Doubles ordinary overland walking speed and doubles normal jumping height and distance.
Magic Items|Candle of Invocation|2500 sp|Burns for up to four hours total. While lit, allies within 30 feet gain +1 to hit rolls and saving throws. It may be snuffed and relit to conserve remaining duration.
Magic Items|Chime of Opening|10000 sp|When struck, opens one ordinary lock or closure within hearing range; against a magical seal it suppresses the seal long enough to open it. Breaks after 10 uses.
Magic Items|Cloak of Elvenkind|50000 sp|Its shifting colors make the wearer extremely difficult to see, granting +2 to Sneak checks made primarily to avoid visual detection.
Magic Items|Cloak of Invisibility|50000 sp|The wearer becomes invisible while the cloak is drawn around them. Attacking or using overtly hostile magic ends the effect until the wearer spends a Main Action to draw the cloak closed again.
Magic Weapons & Armor|Dragon Slayer|50000 sp|A +1 magical weapon. Against dragons it functions as +3 and deals an additional 2d6 damage. In WWN, a magical weapon's bonus applies to hit, damage, and Shock.
Magic Items|Drums of Panic|25000 sp|Creatures that hear the drums and are more than 10 feet away must make a Mental save or flee; NPCs may instead make a Morale check at -2. Allies designated by the drummer are unaffected.
Magic Weapons & Armor|Dwarven Thrower|50000 sp|A +2 magical weapon that can be thrown up to 60 feet and immediately returns to the wielder. Its +2 applies to hit, damage, and Shock.
Magic Items|Eyes of Charming|12500 sp|Crystal lenses usable once per day. One visible sapient target must make a Mental save or regard the wearer as a trusted friend for the scene, ending early if the wearer or allies attack it.
Magic Items|Eyes of the Eagle|12500 sp|Magnifies the wearer's vision by roughly 100 times without reducing ordinary close vision.
Magic Items|Figurine of Wondrous Power|25000 sp|Throwing the figurine to the ground transforms it into the creature it depicts, under the user's control. At 0 hit points it returns to figurine form.
Magic Weapons & Armor|Flametongue|50000 sp|An activated magical weapon that sheds light and deals +2d6 fire damage on a hit.
Magic Weapons & Armor|Frostbrand|50000 sp|An activated magical weapon that sheds light, deals +1d6 cold damage on a hit, halves fire damage to the wielder, and can extinguish ordinary flames once per hour.
Magic Items|Gem of Brightness|10000 sp|A prism with 50 charges. It can shed bright light in a 30-foot radius for no charge, blind one creature within 60 feet on a failed Physical save for 1 charge, or blind creatures in a 30-foot cone on failed Physical saves for 5 charges.
Magic Items|Gem of Seeing|25000 sp|Has 1d6 charges. Spending a charge grants 10 minutes of sight that reveals invisible or magical creatures and objects, secret doors, traps, and other visually concealed features within 120 feet.
Magic Weapons & Armor|Giant Slayer|50000 sp|A +1 magical weapon. Against giants it functions as +3 and deals an additional 2d6 damage. In WWN, a magical weapon's bonus applies to hit, damage, and Shock.
Magic Items|Gloves of Swimming and Climbing|12500 sp|Allows the wearer to swim and climb at their normal Move rate when the surface is physically traversable.
Magic Items|Helm of Comprehend Languages|12500 sp|Allows the wearer to read mundane or magical writing in any language. Each time the wearer is hit in combat, the helm has a 10% chance to break.
Magic Items|Horn of Blasting|25000 sp|A blast fills a 30-foot cone. Creatures take 3d6 damage and are deafened for one round; an Evasion save halves the damage and avoids deafening. Glass or crystal objects take double damage.
Magic Items|Immovable Rod|12500 sp|Pressing its button fixes the rod magically in place, even in midair. Pressing it again releases it.
Magic Weapons & Armor|Javelin of Lightning|50000 sp|A +2 magical javelin. When thrown it becomes a 120-foot line of lightning; creatures in the line take 4d6 damage, with an Evasion save for half. The +2 applies to hit, damage, and Shock when used as a weapon.
Magic Items|Luckstone|50000 sp|While carried, grants +1 to saving throws and skill checks.
Magic Weapons & Armor|Mace of Disruption|50000 sp|A +2 magical mace. Undead and unholy creatures take +2d6 radiant damage. If this bonus damage reduces such a target below 20 hit points, it must make a Physical save or be destroyed.
Magic Items|Necklace of Adaptation|50000 sp|The wearer does not need to breathe and is unharmed by ordinary noxious gases, underwater immersion, or airless environments.
Magic Items|Periapt of Wound Closure|25000 sp|When the wearer would fall to 0 hit points, they instead remain at 1 hit point. The periapt then requires one hour before it can protect the wearer again.
Magic Items|Pipes of the Sewers|25000 sp|Playing the pipes summons and controls 1d6×10 giant rats or 3d6×10 normal rats, subject to the GM's available creature statistics and reasonable local conditions.
Potions|Potion of Animal Control|1000 sp|For one scene, the drinker can command up to 3d6 small animals, 2d8 average-sized animals, or 1d6 very large animals that can perceive the drinker's commands.
Potions|Potion of Fire Resistance|1000 sp|For one scene, the drinker takes half damage from fire and gains +2 on saving throws made specifically to resist fiery breath, flame, or similar effects.
Potions|Potion of Gaseous Form|1500 sp|For one scene, the drinker's body becomes gaseous while worn gear and possessions do not. The drinker can seep through any opening that is not airtight but cannot make physical attacks while gaseous.
Potions|Potion of Healing|250 sp|Heals 2d4+2 hit points and adds 1 System Strain. It cannot be used by a target already at maximum System Strain.
Potions|Potion of Invisibility|1500 sp|For one scene, the drinker becomes invisible. The effect ends early if the drinker attacks or uses overtly hostile magic.
Potions|Potion of Water Breathing|500 sp|For one hour, the drinker can breathe water as easily as air.
Magic Items|Ring of Water Walking|12500 sp|Allows the wearer to stand and walk across liquid surfaces as though they were solid ground.
Magic Items|Robe of Useful Items|10000 sp|The robe bears 1d20 detachable patches. Each patch becomes a useful ordinary item chosen or rolled by the GM when removed, after which that patch is gone.`;

export const tidalStoreSeeds: readonly StoreCatalogSeed[] = raw
  .trim()
  .split("\n")
  .map(line => {
    const [category, name, defaultCost, description] = line.split("|");
    return {
      name,
      kind: "magical" as const,
      category: category as StoreCatalogSeed["category"],
      description,
      details: "WWN-normalized magic item",
      defaultCost,
      source: "d100+ Magic Items" as const,
      license: "Public Domain",
      sourceUrl: "https://tidalwavegames.itch.io/d100-magic-items",
      priceBasis: "TWE suggested WWN value using the SRD magic-item creation tiers.",
    };
  });
