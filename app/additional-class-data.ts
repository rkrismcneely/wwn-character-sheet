// Generated from the CC0 Worlds Without Number SRD 1.0 class pages.
// Run npm run import:srd-classes to refresh from the declared source.
export const additionalClassData = {
  "Accursed": {
    "kind": "mage",
    "skill": "Magic",
    "attribute": "INT/CHA",
    "armor": "Accursed arts may be used in or out of armor.",
    "progression": [
      2,
      3,
      3,
      4,
      5,
      6,
      6,
      7,
      7,
      8
    ],
    "forcedArts": [
      "Accursed Blade",
      "Accursed Bolt"
    ],
    "arts": [
      {
        "name": "Accursed Blade",
        "text": "As an On Turn action, manifest an occult melee weapon as a one-handed 1d8 weapon or a two-handed 2d weapon. Both add your Magic skill to the damage roll, have a Shock rating of 2/15, and use Magic as the attack skill and the best of Str, Dex, Int, or Cha as its modifying attribute."
      },
      {
        "name": "Accursed Bolt",
        "text": "As Accursed Blade, but you launch blasts of occult force instead of meleeing. Their damage is 1d8 plus your Magic skill, their range is 200’, and the bolts can be thrown in melee at a -4 penalty to hit. These bolts need both hands free to hurl them."
      },
      {
        "name": "Bewitching Distraction",
        "text": "Commit Effort for the day as a Main Action when talking to an intelligent target when not in combat. They must make a Mental save or become dazed, oblivious to their surroundings and forgetting you and all else that happened in that scene. Danger ends the daze but not the forgetting."
      },
      {
        "name": "Compelling Shriek",
        "text": "Once per scene, Commit Effort for the day as a Main Action and shout a command of no more than seven words. Chosen targets who hear and understand must make a Mental save or perform that action for one round, provided it is not totally contrary to their character."
      },
      {
        "name": "Devil’s Bargain",
        "text": "As a Main Action, consecrate a deal you’ve made with an uncoerced person. If they violate the deal or its spirit, you know instantly and may inflict 1d6 damage per level on them if desired."
      },
      {
        "name": "Dire Pact",
        "text": "Foes suffer a penalty equal to your Magic skill on all saves versus your Accursed arts. If they succeed, however, you gain one System Strain."
      },
      {
        "name": "Lying Face",
        "text": "Commit Effort as a Main Action; while it remains Committed, you can disguise yourself as any humanoid of the same general size, including clothing, scent, and voice."
      },
      {
        "name": "Night-Black Eyes",
        "text": "You can see clearly in perfect darkness. As a Main Action, focus on a particular visible object, person, or lo cation; you can tell if it is enchanted, though no details about the magic are seen."
      },
      {
        "name": "Pacted Protection",
        "text": "Choose a type of harmful energy: fire, frost, acid, electricity, or the like. You become immune to natural degrees of this energy and take half damage from magical attacks involving it."
      },
      {
        "name": "Rob Vitality",
        "text": "Once per scene, as an On Turn action, Commit Effort for the scene and target a visible foe. They must make a Physical save or lose their next Main Action, which you immediately gain instead."
      },
      {
        "name": "Scourging Curse",
        "text": "Commit Effort for the scene as a Main Action and target a visible foe. Your curse inflicts a -1 penalty to their hit, damage, and saving throw rolls for one round per level. At 4th level this penalty becomes -2, and at 9th it becomes -3. Only one such curse can be active at a given time."
      },
      {
        "name": "Shadowed Steps",
        "text": "As a Move Action, Commit Effort for the scene and teleport up to your Move distance. You cannot bypass walls or physical obstacles, but you can teleport vertically or into high places."
      },
      {
        "name": "Snaring Speech",
        "text": "Once per round as an Instant action, Commit Effort for the day when failing a skill check to persuade or tempt someone. They must make a Mental save or agree with your proposal if it’s something they would normally consider doing. Gain one System Strain when using this art."
      },
      {
        "name": "Sorcerous Battery",
        "text": "Once per day, as an On Turn action, Commit Effort for the day. You or a visible ally refresh the spell slot of a spell that has been cast since the start of the prior round. Gain one System Strain."
      },
      {
        "name": "Soul Consumption",
        "text": "As an Instant action, Commit Effort for the day when you fell an intelligent target with Accursed Bolt or Accursed Blade. They die instantly. You heal 1d6 hit points plus your level and lose one accumulated System Strain."
      },
      {
        "name": "Tendrils of Night",
        "text": "Commit Effort as an On Turn action. While Committed, you exude numerous tentacles or eldritch arms that can manipulate objects with your strength up to 20’ away. You gain no bonus actions, but the arms can melee at range. These arms have your AC, and you are damaged if they are hurt."
      },
      {
        "name": "Unseen Steps",
        "text": "As an On Turn action, Commit Effort for the day to turn invisible for 1d6 rounds plus your level. This invisibility breaks before you attack, cast spells, or perform other vigorous or violent actions."
      },
      {
        "name": "Weight of Sin",
        "text": "As a Main Action, Commit Effort for the day and target a visible foe. They must make a Physical save or lose their Move action for 1d6 rounds plus your level."
      },
      {
        "name": "Weeping Wounds",
        "text": "Once per round, Commit Effort for the scene as an Instant action when a visible enemy takes damage. They must make a Physical save or suffer 1d6 damage per round for one round per level. They cannot heal or regenerate any hit point damage during this effect. This art does not stack."
      }
    ]
  },
  "Bard": {
    "kind": "expert",
    "skill": "Perform",
    "attribute": "CHA",
    "armor": "Bard arts may be used in or out of armor and are not magical effects.",
    "progression": [
      2,
      3,
      3,
      4,
      4,
      5,
      5,
      6,
      6,
      7
    ],
    "forcedArts": [
      "A Thousand Tongues"
    ],
    "arts": [
      {
        "name": "A Thousand Tongues",
        "text": "Your arts that require communication are intuitively understood by all intelligent creatures, whether or not you speak their language. You can learn a new language with no more than a week of study with a native speaker."
      },
      {
        "name": "Battle Cry",
        "text": "Commit Effort for the day as an On Turn action to bolster your allies. They gain +1 to hit, saving throws, and damage, including Shock, for one round per level. At 4th level this bonus increases to +2, and at 9th, to +3."
      },
      {
        "name": "Cursed Tune",
        "text": "Commit Effort for the scene as a Main Action while targeting an intelligent creature. Your imprecations cause them to falter, inflicting a -1 penalty to their hit, damage, and saving throw rolls for one round per level. At 4th level this penalty becomes -2, and at 9th it becomes -3."
      },
      {
        "name": "Deft Fingers",
        "text": "You’re accustomed to juggling your belongings while holding an instrument. Your maximum Readied item count increases by two."
      },
      {
        "name": "Entangle Incantation",
        "text": "Commit Effort for the scene as an Instant action when an foe within 60’ incants a spell. Your voice tangles with their words, forcing them to make an opposed Int/Magic vs Cha/Perform skill check against you, with a +2 bonus to your roll. If you tie or succeed, the spell fizzles and is wasted. This art can be used only once per round."
      },
      {
        "name": "Evoke Emotion",
        "text": "Commit Effort for the day as a Main Action while performing. You evoke a desired emotion in listeners, whether intelligent or animal, granting a +1 bonus to relevant social skill checks for the scene for you and your allies. If desired, you can force a new Reaction Roll, taking it if it’s more favorable than the original. This art does not work in combat and can be used only once per scene."
      },
      {
        "name": "Inspire Dread",
        "text": "Commit Effort for the day as an Instant action when your enemies are forced to make a Morale check. You goad their fears, forcing them to make two Morale checks instead of one. Those who succeed on both must still make an Instinct check immediately after."
      },
      {
        "name": "Keen Senses",
        "text": "This art gives you the equivalent of sight out to 60’ even if blinded. You cannot distinguish colors, but you can perceive physical details as readily as if with your eyes. Physically-invisible creatures and objects are obvious to you."
      },
      {
        "name": "Liberating Song",
        "text": "You are immune to mind- or emotion-controlling effects. You can Commit Effort for the scene as an Instant action to grant any ally in range a Mental saving throw to throw off such effects, assuming they allowed a save to begin with. If the second save is failed, this art cannot help them."
      },
      {
        "name": "Rally",
        "text": "Commit Effort for the day as a Main Action to exhort a wounded or fallen ally, removing any Frailty. The target regains 2d6 plus your level in hit points, but you incur one System Strain."
      },
      {
        "name": "Soothe the Savage",
        "text": "Commit Effort for the day as a Main Action. For as long as you keep spending a Main Action performing each round, animals and other living bestial creatures will not attack you or your allies unless commanded by their masters or threatened by the party. This art can’t be triggered once actual combat has begun."
      },
      {
        "name": "Soothing Graces",
        "text": "Your arts restore and hearten those with you. You and your allies lose an extra point of System Strain after each night’s comfortable rest. This does not stack with similar rest-aiding powers."
      },
      {
        "name": "Swift Misdirection",
        "text": "Commit Effort for the scene as a Main Action and target one intelligent creature within earshot. Tell them something in no more than one sentence; unless what you say is physically impossible or emotionally unendurable, they must make a Mental save or believe it for one round. After that, they can judge your words with their normal reason. This art can affect a creature only once per scene."
      }
    ]
  },
  "Beastmaster": {
    "kind": "mage",
    "skill": "Survive",
    "attribute": "WIS/CHA",
    "armor": "Beastmaster arts may be used in or out of armor.",
    "progression": [
      2,
      3,
      3,
      4,
      5,
      6,
      6,
      7,
      7,
      8
    ],
    "forcedArts": [
      "Bind Companion"
    ],
    "arts": [
      {
        "name": "Bind Companion",
        "text": "With a day’s work in a location you can find and bind a suitable animal companion. If looking for a particular type of companion, it must be found in the area and may require a Wis/Survive skill check at a difficulty of 10 or more if it’s a particularly rare creature. If you encounter a suitable animal on an adventure, you may bind it as a Main Action, with the creature allowed a Mental saving throw to resist and become impervious to your powers. You may release a companion as a Main Action if you no longer wish its service or want to bind a different beast."
      },
      {
        "name": "Arts Beast Ward",
        "text": "Commit Effort as an On Turn action. So long as the Effort remains Committed, the Beastmaster will not be attacked by unintelligent beasts unless the beast is commanded to do so by its master, the beast is starving, or the Beastmaster or their allies per forms some hostile act against it. Once the ward ends or is broken, it cannot be re-established in the same scene. Magical beasts and those trained specifically as guardians of an area get a Mental save to resist this power."
      },
      {
        "name": "Eyes of the Beast",
        "text": "Commit Effort for the scene as an On Turn action. For the rest of the scene, you can share the senses of your companion. Neither of you can be surprised unless both are surprised."
      },
      {
        "name": "Feral Toughness",
        "text": "Your maximum hit point total is increased by the natural, unmodified hit dice of your companion; thus, a 5 hit die companion increases your maximum hit points by 5. You are impervious to normal outdoor extremes of heat or cold. Your base Armor Class is equal to 13 plus half your level, rounded up. This AC can be modified by shields or Dexterity modifiers, but not by armor."
      },
      {
        "name": "Howl of Distant Summons",
        "text": "You can call former animal companions to your side by Committing Effort for the day as a Main Action. The howl extends through time as well as space, and the subject will have received the message in time to reach your side within five minutes after you call for it. Once summoned, you may bind it again if you have no current companion. If the journey is exceptionally dangerous, difficult, or long, you’ll need to make a Cha/Survive skill check against a difficulty of 10 or more; on a failure, the beast could not make the journey and cannot be called by this power for another week."
      },
      {
        "name": "Know the Weak Spot",
        "text": "Whenever inflicting damage on a beast with a weapon or physical attack, roll the damage twice and take the higher score. Optionally, Commit Effort for the scene as an Instant action when an ally within earshot hits a beast; your shouted advice or distracting help allows them to roll damage twice and take the better result as well."
      },
      {
        "name": "Mind Call",
        "text": "Commit Effort for the scene as an On Turn action. For the rest of the scene you forge a telepathic bond with your animal companion. You can give it orders and receive information from the creature, at least insofar as its limited intellect allows."
      },
      {
        "name": "Natural Weaponry",
        "text": "You may have physically grown fangs and claws, or it may be that you just intuitively absorbed effective unarmed fighting techniques from your animal companions. When unarmed, your attacks count as weapons that use either Str or Dex as their modifier, use Punch or Stab as the skill, do 1d8 damage, and have a Shock value of 2/AC 13. These unarmed attacks can harm even creatures immune to non-magical weapons. The damage and Shock of these weapons gains a +1 bonus at level 3, a + bonus at level 6, and a +3 bonus at level 9."
      },
      {
        "name": "Savage Senses",
        "text": "Commit Effort for the scene as an On Turn action. For the remainder of the scene you are capable of seeing clearly even in pitch blackness, can scent out trails and belongings as perfectly as a wolf could, and gain a +2 bonus on all Notice skill checks involving sight, sound, or smell."
      },
      {
        "name": "Shared Vitality",
        "text": "The animal companions you bind have hit dice no lower than your level, even if they normally have far fewer. Thus, a 2 hit die beast bound by a 7th level Beastmaster would have 7 hit dice while it remained bound. Its hit bonus can’t be less than half its hit dice, rounded up. A Beastmaster can stabilize a Mortally Wounded companion by Committing Effort for the scene as an Instant action."
      },
      {
        "name": "Swift Healing",
        "text": "Commit Effort for the day as a Main Action to heal 1d6 damage per character level to a wounded companion. This healing can be extended only once per scene or fifteen minutes."
      },
      {
        "name": "Tongue of the Beasts",
        "text": "Commit Effort as an On Turn action. While the Effort remains committed, you can speak with any animal that has fur, feathers, scales, or skin. This art allows them to temporarily speak as if they had human intellect, though their interests, knowledge, and desires do not change."
      }
    ]
  },
  "Blood Priest": {
    "kind": "mage",
    "skill": "Pray",
    "attribute": "WIS/CHA",
    "armor": "Blood Priest miracles are not hindered by armor and require no free hand.",
    "progression": [
      2,
      3,
      3,
      4,
      5,
      6,
      6,
      7,
      7,
      8
    ],
    "forcedArts": [],
    "arts": [
      {
        "name": "A Thousand Tongues",
        "text": "Commit Effort as an On Turn action; while it remains Committed, you can speak with and understand any sentient creature with a language of their own. To any listener, it will seem as if you are perfectly fluent in their own language, even as you speak in your own native tongue. This ability does not allow you to read or write unknown languages."
      },
      {
        "name": "Armor of God",
        "text": "Commit Effort as an On Turn action. While the Effort remains Committed, you have a natural Armor Class of 15 plus half your level, rounded down. This AC can be modified by shields or your Dexterity modifier, but not by other worn armor."
      },
      {
        "name": "Divine Guidance",
        "text": "Commit Effort for the day as a Main Action and meditate upon a choice or potential action before you. The GM will tell you whether the likely outcome of that choice is weal, woe, a mix of both, or nothing significant, using their own best estimation. This insight cannot perceive likely outcomes more than an hour or so into the future."
      },
      {
        "name": "Fear No Flame",
        "text": "Commit Effort for the day as an On Turn action while nominating a visible target. For the rest of the scene, they are immune to non-magical flame, smoke, or explosive damage, and decrease any sources of such magical damage they take by five points per level of Pray you have."
      },
      {
        "name": "God Wills It",
        "text": "Commit Effort for the day as an Instant action and loudly call down your god’s blessing on your comrades. For the rest of the scene, up to six allies per character level in earshot gain an effective Morale of 12 and a +1 bonus to hit and damage rolls, including any Shock that may be inflicted. At fifth level this becomes a +2 bonus, and at tenth level it becomes a +3 bonus."
      },
      {
        "name": "Merciful Healing",
        "text": "Commit Effort for the day as a Main Action and touch a target within melee range. The target receives 1d6+2 points of magical healing. If done in combat or used to revive a Mortally Wounded subject, the rushed haste of the healing adds 1 System Strain to the target, but no System Strain is added if it is applied outside of combat. At fourth level the healing done increases to 2d6+4 and at eighth level it becomes 4d6+8."
      },
      {
        "name": "Sanctified Ward",
        "text": "Commit Effort as an On Turn action. While the Effort is maintained and until you take some hostile action against a creature, you are immune to Shock damage and gain a +4 bonus to your Armor Class and all saving throws. Enemies must pass an Instinct check each round to target you with attacks; on a failure, they may take some other action instead. Once this art is ended it cannot be reactivated for the rest of the scene. Healing and other indirect support of fighting comrades does not count as a hostile action."
      },
      {
        "name": "Smite the Wicked",
        "text": "Commit Effort for the day as a On Turn action whenever you attack or take some damaging action toward a single target. You gain a +4 bonus to any hit roll, you inflict your character level as automatic damage, and you can roll any damage dice twice and take the higher result. This ability can only be used once per scene on a given target."
      },
      {
        "name": "The Light of Faith",
        "text": "Commit Effort as an On Turn action; while it re mains Committed, you can cast a clear, bright radiance that extends up to thirty feet away from you. At your discretion, this light is visible only to you and your comrades, including up to a dozen allies."
      },
      {
        "name": "Transubstantiation",
        "text": "Commit Effort for the day as a Main Action to transform up to a gallon of any liquid into sacred blood. A draught of this holy liquid is sufficient to sustain a drinker for a day without further food or drink and will heal 1d6 plus the user’s Pray skill in lost hit points. A gallon of blood is sufficient to help a half-dozen people. The benefits of this art can be enjoyed only once per day, and any undrunk blood sublimates away within a minute."
      },
      {
        "name": "Turn False Life",
        "text": "Commit Effort for the day as a Main Action and make the sign of your god before one or more visible targets within sixty feet. Roll 2d6 and add your character level; that many hit dice of undead, automatons, or other synthetic, extraplanar, or unnatural life forms must make Mental saving throws or cower for the rest of the scene or until they or their comrades are attacked. Cowering enemies will take no hostile action and may flee unless bound to their location. This power does not affect foes with twice as many hit dice as the blood priest has levels. If the rolled hit die total isn’t enough to fully affect a creature, it is unaffected."
      },
      {
        "name": "Words of Mercy",
        "text": "Commit Effort for the day as an Instant action to reroll any failed social skill check related to maintaining peace, granting help, or encouraging virtuous acts of compassion, mercy, or truthfulness. This art can be used only once on any given skill check."
      },
      {
        "name": "Wrath of the Most High",
        "text": "Commit Effort for the scene as a Main Action while you rebuke a visible target. The first time the target takes damage before the end of the next round, it suffers automatic additional damage equal to 1d8 plus your level."
      }
    ]
  },
  "Duelist": {
    "kind": "mage",
    "skill": "Stab",
    "attribute": "DEX/INT",
    "armor": "Duelist arts do not function in medium or heavy armor or with a large shield.",
    "progression": [
      2,
      3,
      3,
      4,
      5,
      6,
      6,
      7,
      7,
      8
    ],
    "forcedArts": [
      "Favored Weapon"
    ],
    "arts": [
      {
        "name": "Favored Weapon",
        "text": "Choose one specific type of non-unarmed me lee weapon. You begin play with such a weapon, and when using this type you may use the Favored Weapon attack bonus column on the Duelist table to determine your base hit bonus, unless it’s already better for some other reason. If your second partial class is Partial Warrior, your class’ base hit bonus with the weapon is instead equal to your level. You cannot apply this or other Duelist arts to thrown weapons."
      },
      {
        "name": "Blood for Blood",
        "text": "Commit Effort for the scene as an Instant action when an enemy hits you with a physical attack. If you attack that enemy with your favored weapon before the end of the next round, the first blow hits automatically and can do no less damage than was done to you, up to the weapon’s maximum."
      },
      {
        "name": "Burst of Speed",
        "text": "Commit Effort for the day as an On Turn action. You may move your full normal movement rate as an On Turn action. This art can be used only once per round."
      },
      {
        "name": "Code Duello",
        "text": "Commit Effort for the day as an On Turn action when engaged with a single foe. So long as no other combatant attacks either your target or you, and you attack no one but your target, you gain a +4 bonus to your Armor Class and can roll your hit rolls twice, taking the better result. Once the Code Duello has been disrupted or ended, it cannot be invoked again during that scene."
      },
      {
        "name": "Crushing Superiority",
        "text": "Your favored weapon gains the Less Lethal quality if it doesn’t already have it. Commit Effort for the scene as an Instant action when you hit a target; they must immediately make an Instinct check. This ability can be used only once per scene on any given target."
      },
      {
        "name": "Dauntless Step",
        "text": "Commit Effort for the scene as an On Turn action. The Move actions you make for the rest of the round can cross vertical surfaces or difficult terrain at your full normal movement rate, provided you end the round standing upright on a surface that can bear your weight."
      },
      {
        "name": "Dodge Doom",
        "text": "Commit Effort for the day as an Instant action when caught in some explosion or other burst effect. You take half dam age, or no damage if the effect allows a save and you succeed at it. You can move yourself up to ten feet away from your original location, provided the new location is behind cover or away from the blast’s point of origin."
      },
      {
        "name": "Forced Engagement",
        "text": "Commit Effort for the scene as an Instant action when making an attack with your favored weapon; you may ignore one foe’s Screen Ally action for that attack."
      },
      {
        "name": "Gentleman’s Withdrawal",
        "text": "Commit Effort for the scene as a Move action. As part of this, you may move at your full movement rate without being hindered by armed foes unless they completely block your path. You count as having made a Fighting Withdrawal against any enemies engaged with you at the time."
      },
      {
        "name": "Graceful Leap",
        "text": "Commit Effort for the scene as an On Turn action to immediately leap up to ten feet horizontally or vertically, counting it as a Fighting Withdrawal. You can’t use this art more than once per round or after you’ve attacked. You are immune to falling damage from plunges of less than 30 feet."
      },
      {
        "name": "Lightning Draw",
        "text": "Commit Effort for the day as an Instant action at the start of hostilities; you win initiative against anyone without a similar ability to act first and may ready a Stowed favored weapon Instantly."
      },
      {
        "name": "Piercing Strike",
        "text": "Commit Effort for the scene as an On Turn action and choose a visible target. For the rest of the scene, their AC is treated as 10 for purposes of resisting the Shock of your favored weapon."
      },
      {
        "name": "Spiritual Weapon",
        "text": "You are able to translate examples of your favored weapon into a spiritual template that you may manifest as you wish. Any favored weapon can be turned into such a template, including a magical weapon, but the process destroys the object’s physical form. To manifest a template, Commit Effort as an Instant action; a ghostly copy of the weapon appears Readied in hand for you until you release the Effort or stop touching the weapon. Dual-wielders can summon the same weapon into both hands with one use of this art."
      },
      {
        "name": "Unbindable",
        "text": "Commit Effort for the day as an On Turn action when ever you wish to escape chains, grapples, shackles, ropes, or even a magical spell of physical binding. You automatically wriggle free from mundane restraints and gain an Evasion saving throw to instantly end a physical magical binding of some sort. You can use this art only once per round."
      },
      {
        "name": "Unworthy Rabble",
        "text": "Commit Effort for the day as an On Turn action. For the rest of the scene, when using your favored weapon, reroll any failed hit roll against foes with one hit die. At eighth level, this ability applies to foes with two hit dice."
      },
      {
        "name": "Whirling Evasion",
        "text": "Your base Armor Class becomes equal to 13 plus half your level, rounded up. This AC can be modified by small shields and your Dexterity modifier, but not by armor or large shields."
      }
    ]
  },
  "Mageslayer": {
    "kind": "warrior",
    "skill": "Magic",
    "attribute": "INT/CON",
    "armor": "Mageslayer arts may be used in or out of armor.",
    "progression": [
      2,
      3,
      3,
      4,
      5,
      6,
      6,
      7,
      7,
      8
    ],
    "forcedArts": [],
    "arts": [
      {
        "name": "Absolute Negation",
        "text": "As an Instant action, Commit Effort for the day when you are about to be affected or impeded by an unwanted spell or a standing magical effect created by a spell. You may ignore the magic."
      },
      {
        "name": "Antimage",
        "text": "Get one level of the Nullifier Focus for free, or a free Foci if you somehow have both levels."
      },
      {
        "name": "Dispel Enchantment",
        "text": "As a Main Action, touch an ally and Commit Effort for the day. Your touch acts as an Extirpate Arcana spell. This art can only be applied to creatures, not objects, and can be applied to yourself or a given target only once per day."
      },
      {
        "name": "Disrupt Sorcery",
        "text": "As an On Turn action, Commit Effort for the scene. The next attack you make that round will leave the target unable to cast spells or trigger Mage arts for the rest of the round, even if the attack misses. Currently-active arts are not disrupted. If the attack is successfully Screened by an ally, however, the target is unaffected."
      },
      {
        "name": "Immaculate Body",
        "text": "Magical transformations, curses, or lingering negative magical penalties last a maximum of one scene on you. Such malisons cannot kill you, reducing you to 1 HP at worst. This applies to all magical effects, and not only to hostile spells."
      },
      {
        "name": "Immaculate Mind",
        "text": "You are impervious to unwanted mind-affecting or mind-reading spells or magical effects, and you automatically see through illusions and magical invisibility. Note that this applies to all such magical effects, not merely spells."
      },
      {
        "name": "Know Your Prey",
        "text": "Your Magic skill is treated as one point higher than it is, up to a maximum of level-4 skill. This benefit adds to your Effort as usual, and may allow you to have a higher Magic skill than your character level would usually allow."
      },
      {
        "name": "Magebane",
        "text": "You add half your level, rounded up, to all damage you inflict on casters from any source, be it by weapon, Shock, or violent action. This does not stack with a Warrior’s Killing Blow class ability."
      },
      {
        "name": "Share the Pain",
        "text": "As an Instant action, Commit Effort for the day when you are targeted by a hostile spell or are in its area of effect. Make a Mental saving throw; on a success, the spell’s caster is treated as also having affected by the spell that just targeted you. This art can be used only once per round."
      },
      {
        "name": "Spellshield",
        "text": "When a spell inflicts hit point damage on you, it’s automatically halved, rounded down, before any saves or resistances are applied."
      },
      {
        "name": "Ward Ally",
        "text": "As an Instant action, Commit Effort for the scene when an ally within thirty feet is affected by a spell; you are affected by the spell in place of your ally. If you are both in the same area of effect, the spell hits you twice. Any defenses or arts you have against sorcery may be applied as usual to this transferred effect."
      },
      {
        "name": "Witchfinder",
        "text": "As a Main Action, Commit Effort for the scene. For the rest of the scene, you gain the benefits of the Apprehend the Arcane Form spell, except for the spell’s dark-vision ability."
      }
    ]
  },
  "Skinshifter": {
    "kind": "mage",
    "skill": "Survive",
    "attribute": "CON/CHA",
    "armor": "Skinshifter arts may be used in or out of armor.",
    "progression": [
      2,
      3,
      3,
      4,
      5,
      6,
      6,
      7,
      7,
      8
    ],
    "forcedArts": [
      "Change Form"
    ],
    "arts": [
      {
        "name": "Change Form",
        "text": "Commit Effort for the day as a Main Action to transform into an available Alternate form. This shift persists until you die, shift to a new form, or end the transformation as an On Turn action. Your hit points, System Strain, and other scores remain the same in any new form, but in a non-humanoid form your class’ base attack bonus can be no worse than the one listed on the table. If your shape is quadrupedal, its Move is 10’ faster than your base."
      },
      {
        "name": "Eyes Of The Hawk",
        "text": "This Shape Has Remarkably Acute Senses. You Can Scent Trails And Objects Like a Dog, Hear Very Faint Noises, See Objects Clearly Enough To Identify Faces At a Thousand Feet Of Distance, And See Clearly In Anything Short Of Complete Darkness. You Gain a +2 bonus on all sensory Notice checks."
      },
      {
        "name": "Feline Leap",
        "text": "This form can vault great distances. You can jump your full Move rating as a Move action, crossing the full distance horizontally or up to half the distance vertically. You subtract your Move rating from fall distance for damage calculations."
      },
      {
        "name": "Feral Prowess",
        "text": "This form has an augmented degree of speed, strength, or hardiness. For this form, pick either Strength, Dexterity, or Constitution; that attribute modifier is improved by +1 in this form, to a maximum of +2. These alterations are obvious and extreme; it is impossible to masquerade as a normal baseline human if using this art. Hit points gained from Con improvements are lost when shifting back."
      },
      {
        "name": "Intrinsic Armor",
        "text": "This shape has tough scales, hide, shell, or other defensive integuments. Your base Armor Class is 14 plus half your character level, rounded down. This AC can be modified by your Dexterity modifier, and by shields if the shape can hold one."
      },
      {
        "name": "Manifest Wings",
        "text": "This shape can form usable wings. You can’t effectively attack while concentrating on remaining aloft, but you can fly at your normal movement rate +10’ per action. If unhindered and flying overland you can travel up to ten miles an hour and fly up to five hours a day."
      },
      {
        "name": "Octopus’ Embrace",
        "text": "This shape can have more than four usable limbs. These additional tentacles, arms, legs, or grippers can hold and manipulate things; up to four Stowed objects can be held Ready by these limbs without counting against your Readied Encumbrance limit. These extra limbs cannot effectively employ extra shields, perform additional attacks or actions, or do other things that require significant focus beyond your current action."
      },
      {
        "name": "Perfect Mimicry",
        "text": "This alternate form can exactly duplicate another creature, provided you either have a lock of their hair, a still-liquid drop of their blood, or ten minutes of observation of them from within five feet. Once learned, you need no further samples."
      },
      {
        "name": "Pliant Flesh",
        "text": "You’ve mastered your shapeshifting skills, and Change Form can be used as an On Turn action, albeit only once per round. Alternately, it can take as long as a minute but cost no Effort. When ever you spend Effort to shift shape, you heal lost hit points equal to 1d6 plus your level; this does not apply when merely reverting a form’s change. This art is intrinsic to you, and doesn’t count against the total number of arts allowed to apply to a form."
      },
      {
        "name": "Savage Talons",
        "text": "This shape has extremely dangerous claws, fangs, pincers, or other body weapons. At first level these weapons do 1d8 damage, use either Str or Dex as the modifying attribute, Punch as the combat skill, and have a Shock value of 2/AC 13. At level 3 the damage and Shock increase by +1, at level 6 they increase to +2, and at level 9 they increase to +3. These weapons can harm even creatures immune to non-magical weaponry."
      },
      {
        "name": "Sculptor’s Beauty",
        "text": "You’ve developed a refined aesthetic sense that can directly appeal to the subconscious beauty preferences of viewers. This shape improves your Charisma modifier by +1, to a maximum of +2. There is always something alien about this beauty, and such forms can never be mistaken for an entirely normal human or animal, though they may be taken for some exotic demihuman or altered baseline."
      },
      {
        "name": "Serpent’s Kiss",
        "text": "This shape can exude a venom on its claws or fangs. Successful hits allow you to Commit Effort for the scene as an Instant action to inflict an additional 1d8 damage plus your Survive skill. You can elect to make the toxin paralytic rather than fatal; foes reduced to zero hit points by such a blow are paralyzed and helpless for an hour rather than mortally wounded."
      },
      {
        "name": "The Monkey’s Road",
        "text": "This shape has an arboreal agility when it comes to climbing. You can travel up sheer surfaces at your usual movement rate provided at least three limbs are available for use and the surface is not glassily smooth. If you fall, you can halt your plunge without damage so long as a serviceable surface to cling to is within ten feet of you."
      },
      {
        "name": "Warform",
        "text": "You gain a flat +2 bonus to all melee hit rolls in this shape and can use your form hit bonus even in a humanoid body. This shape is blatantly martial in appearance, however, and cannot pass as anything harmless or wholly human."
      },
      {
        "name": "Wisdom of Fin and Scale",
        "text": "This shape can breathe water, swim at double your usual Move rate, and is impervious to any normal climatic extreme of cold or undersea pressure. It can see up to sixty feet while underwater even in the absence of normal light."
      }
    ]
  },
  "Thought Noble": {
    "kind": "mage",
    "skill": "Notice",
    "attribute": "INT/WIS",
    "armor": "Thought Noble arts are invisible mental effects and may be used in armor.",
    "progression": [
      2,
      3,
      3,
      4,
      5,
      6,
      6,
      7,
      7,
      8
    ],
    "forcedArts": [
      "Open Mind"
    ],
    "arts": [
      {
        "name": "Open Mind",
        "text": "Commit Effort as an On Turn action. While Effort remains Committed, you may detect the current emotional state of a visible living creature as a Main Action. This discernment isn’t fine enough to identify the object of their emotions unless it’s obvious from the context."
      },
      {
        "name": "Block Memory",
        "text": "Target a Visible Living Creature And Commit Effort For The Day As a Main Action While Specifying a Particular Event Or Situation That Didn’t Extend Longer Than a Scene. The Target Gets a Mental Saving Throw; On a Failure, They Simply Cannot Remember The Event And Will Construct a Plausible False Memory To Paper Over The Gap. The Memory Can Be Restored By Use Of This Power Once More Or a Magical Dispelling Ability, But Detecting The Alteration Is Difficult; any power that detects enchantments on a target does so with a +2 difficulty penalty to any skill check made to discern the ban."
      },
      {
        "name": "Elicitation of Truth",
        "text": "This art can only be taken by those who have mastered Surface Apprehension. It can only be used on a helpless or cooperative target; the Thought Noble may Commit Effort for the day and ask the target a question that takes no more than two sentences to ask. If the target fails a Mental saving throw, they must fully and completely answer the question. They need not exercise any personal judgment or speculation, but they must answer directly and without conscious deception."
      },
      {
        "name": "Facile Speech",
        "text": "An improvement to the Far Speech art, you may now nominate up to a half-dozen companions to be favored targets for Far Speech. You may link with a favored target as an On Turn action without Committing Effort. The range to contact a favored target is one mile per Thought Noble level. You can change your nominated companions with an hour’s meditation in the new companion’s presence."
      },
      {
        "name": "Far Speech",
        "text": "Commit Effort for the scene as an On Turn action and target an intelligent creature known to you that is within two hundred feet per level. If they consent, you forge a telepathic link with them that can convey thoughts, speech, and images even without a common language. The link lasts for the rest of the scene. While linked with someone, both of you may reroll failed Mental saving throws and neither of you can be surprised unless both are."
      },
      {
        "name": "Hypercognition",
        "text": "You can drive your mind to tremendous feats of calculation, estimation, and recall. You have an eidetic memory and can perform extremely advanced calculations in your head. As an Instant action, Commit Effort for the day and reroll any failed Int-based skill check. This ability can be used only once on any given check."
      },
      {
        "name": "Iconograph",
        "text": "Commit Effort for the scene as a Main Action and tar get a visible written text, piece of sculpture, iconographic symbol, or other visible artifact. You receive a short description of the message or idea the maker was trying to convey with the object. Optionally, you may use this art when making a sigil, art object, or text of your own; any valid target will automatically understand your intended message when they see the item. You may restrict your audience to particular people or types if you wish."
      },
      {
        "name": "Impress Imperative",
        "text": "Commit Effort for the day as a Main Action while targeting a visible living creature. You may give it an over whelming urge to perform some action that takes no longer than a round and is not completely contrary to its nature or wishes. It can make a Mental save to resist, but on a failure it spends its next action carrying out the imperative."
      },
      {
        "name": "Mind Light",
        "text": "Your Open Mind art is enhanced. While active, you become aware of the location of all living minds within sixty feet of you provided there isn’t a physical barrier between you and the subject and they are not actively hiding from you. You can identify the species of these minds, if the species is known to you, any strong emotional states, and can recognize known individuals. While Open Mind is active you cannot be surprised by a living creature."
      },
      {
        "name": "Mind Over Matter",
        "text": "Your mental control over your physical process es is considerable. Commit Effort for the day as an Instant action to gain one of the following benefits: automatically stabilize if Mortally Wounded, go without sleep for twenty-four hours, heal 1d6 hit points of damage you’ve suffered, or completely ignore normal climatic extremes of heat or cold for one day. Similar tricks of bodily control may be allowed at the GM’s discretion."
      },
      {
        "name": "Mirror Mask",
        "text": "You become instantly aware of any mind-affecting power directed at you and can identify the user if they’re within your current sensory range. You may reroll any Mental saving throw the attacking ability allows you; if it doesn’t allow a save, you get a single Mental save to resist anyway. If you succeed, you may Commit Effort for the day as an Instant action to give the power false information of your choice or a false impression of success."
      },
      {
        "name": "Positive Association",
        "text": "As a Main Action, Commit Effort for the day and target a visible sentient creature. It gets a Mental saving throw to resist; on a failure, any thought of you or your actions is suffused by a glow of benign happiness and admiration. They will treat you as an admired friend and find all your actions to be eminently reasonable and wise until you or your allies attack them, bring harm to something they love, or leave their presence for more than an hour. Affected creatures that were not misused are unlikely to think themselves bespelled when this power ends unless given reason to. This ability can affect only one target at a time."
      },
      {
        "name": "Read Intent",
        "text": "As an Instant action, Commit Effort for the scene and target a visible living creature. It gets a Mental saving throw to resist; on a failure, the GM will tell you exactly what it is currently intending to do on its next turn, or its next relevant action if used out of combat. If you perform a Total Defense action this round, your insight into its motions ensures that no attack it makes that you could theoretically physically avoid can hit you for the rest of the round."
      },
      {
        "name": "Surface Apprehension",
        "text": "Commit Effort for the scene as a Main Action while targeting a visible living creature. If it fails a Mental saving throw, you become aware of its immediate surface thoughts for the rest of the round. If you ask specific questions of the creature during this round it will instinctively think of the answers, though the detail of these surface thoughts is generally limited to one or two sentences of information."
      },
      {
        "name": "Thoughts Like Razors",
        "text": "As a Main Action, Commit Effort for the day to launch a psychic assault on any visible living creature within sixty feet. The target gets a Mental saving throw to resist; on a failure, it takes 1d8 damage per level of the Thought Noble. The damage can knock it unconscious but cannot kill. On a successful save, the Thought Noble is stunned by the backlash, taking one quarter of the damage, rounded down, and losing their next turn’s actions. This ability can be used only once per scene."
      },
      {
        "name": "Unthinkable Thought",
        "text": "Target a visible living creature and Commit Effort for the day as a Main Action while specifying a particular person, object, or situation that is currently ongoing in their presence. The target may make a Mental save to resist; on a failure, they simply cannot consciously acknowledge the existence of the subject or its actions unless ignoring it would obviously put their life at risk. This forced ignorance lasts for up to a scene; at its end, the target will have no memory of the subject."
      }
    ]
  },
  "Wise": {
    "kind": "expert",
    "skill": "",
    "attribute": "",
    "armor": "Wise arts do not use Effort and may be used in armor.",
    "progression": [
      2,
      3,
      3,
      4,
      4,
      5,
      5,
      6,
      6,
      7
    ],
    "forcedArts": [],
    "arts": [
      {
        "name": "Dread Awe",
        "text": "Your Kind Are Figures Of Fear And Mistrust. Gain a +1 bonus on all skill checks related to intimidation or threat. You can spend a Main Action cursing your foes in battle; those who hear suffer a -1 penalty to their next Morale check. You can do this only once per scene."
      },
      {
        "name": "Elite Ties",
        "text": "You have ties with figures of societal importance. You can get audiences with them with minimal effort. Once per game session, get a favor from them that would not particularly inconvenience them to grant."
      },
      {
        "name": "Erudite",
        "text": "You are uncommonly learned. Once per day, reroll a failed skill check related to intellectual pursuits or things a scholar would know about."
      },
      {
        "name": "Folk-Friend",
        "text": "Commoners and other lower-class natives consider you a useful healer and helper. Once per day, get a modest favor from a commoner who doesn’t hate you in exchange for a blessing or bit of advice."
      },
      {
        "name": "Healer",
        "text": "You are a trained and capable healer. Gain a +1 on all Heal skill checks; once per day, as an On Turn action, automatically succeed at a skill check to stabilize a Mortally Wounded subject."
      },
      {
        "name": "Holy Sanctity",
        "text": "You are honored and respected by most in this region. Gain a +1 bonus on social skill checks with locals who are not naturally opposed to your religion or social institution."
      },
      {
        "name": "Personal Impunity",
        "text": "You bear signs of sanctity, and physically harming you is considered taboo in this region. Only the most vicious or desperate humans will initiate violence against you, though any will fight if you attack them. Hostile groups will hesitate to attack your companions unless provoked."
      },
      {
        "name": "Skilled",
        "text": "Gain three skill points to spend on any non-combat skills, up to the maximum skill level allowed by your character level. This art may be taken more than once."
      },
      {
        "name": "Compel Truth",
        "text": "The Diviner Compels a Person To Drink a Particular Brew, Participate In a Specific Ritual, Or Otherwise Undergo a Scene Long Ordeal. Afterwards, The Diviner May Ask The Target a Single Question And The Gm Secretly Rolls a Cha/Magic Skill Check Against a Difficulty Of The Target’s Morale+1, Or Level+6 For PCs. On a Success, The Subject Must Answer The Question Truthfully And Fully. On a Failure, They May Give Any Answer They Wish. The Same Or Substantially Same Question May Not Be Asked Twice With This Art."
      },
      {
        "name": "Deliver Oracle",
        "text": "A petitioner asks about the outcome of a particular course of action. The diviner then spends a day in various rituals, seeking an oracular answer. At the end, the GM makes a secret Wis/ Magic skill check. If the skill check beats difficulty 8, an oracular sentence with some truth in it is produced. If the skill check beats difficulty 12, a direct and obvious oracle is produced. If the skill check is 7 or less, a hopelessly ambiguous oracle is produced, and if the dice roll a natural 2 an intentionally misleading oracle is delivered. Oracles are usually delivered as metaphors, poetry, or visions. The GM should ensure that some element of a true oracle actually does come to pass."
      },
      {
        "name": "Find Object",
        "text": "The diviner spends a scene performing a ritual to locate a particular animal, object or type of substance known to them, be it gold, water, or a specific stolen cow. People cannot be found with this art. The GM makes a secret Wis/Magic skill check against a difficulty of 8 to 11, depending on how close the nearest suitable object is; something in the same village is 8, something a mile or more away is 11, and something more than five miles away is undetectable. If the check is successful, the diviner gets an impression of the direction the object is in. On a failure, roll 1d12 and use it as a clock face to give a random direction. This art can be used once per day."
      },
      {
        "name": "Read Omens",
        "text": "A petitioner proposes a course of action to the PC. After a scene-long ritual involving at least 10 sp worth of livestock or sacrificial material, the GM makes a secret Wis/Magic skill check against difficulty 10. On a success, the PC gets an impression of whether the course of action will lead to success or failure, as the GM thinks most likely. On a failure, the GM gives a random result. Multiplying the ritual costs by 10 adds +1 to the skill check, thus, a sacrifice of 1,000 sp worth of livestock gets a +2 on the check. The same course of action cannot be divined more than once a month."
      },
      {
        "name": "Auspicious Undertaking",
        "text": "As a Main Action, bless a particular plan or undertaking currently sought by the target. During the plan’s execution or while seeking the desired end, the blessed subject can reroll one failed skill check or one missed hit roll. The blessing lasts until it is used, the plan is finished, or one day per caster level has passed. Only one plan can be blessed at a time."
      },
      {
        "name": "Evil Eye",
        "text": "This art improves your curse and blessing arts. You can now use these arts as an Instant action, albeit still only one such art per round, and you need do no more than look at the target rather than vocalizing any particular curse or blessing."
      },
      {
        "name": "Ill Fate",
        "text": "As a Main Action, curse a visible target. You may specify a particular kind of undertaking or apply the curse to anything they may do. The next pertinent skill check they make is made at a -1 penalty. If their raw die roll is equal or less than the PC’s Magic skill plus one their effort goes disastrously wrong. The curse lasts until the next relevant skill check."
      },
      {
        "name": "Luck Blessing",
        "text": "As a Main Action, confer a blessing on a visible target. The next skill check they make that day will have a +1 bonus. Only one luck blessing can be in place for a creature at a time."
      },
      {
        "name": "War Curse",
        "text": "As a Main Action, curse a visible enemy. They suffer a -2 penalty to hit rolls, damage rolls, and Shock damage for the rest of the scene. If they miss an attack with a raw to-hit die roll less than the Wise’s Magic skill, they accidentally hurt themselves for normal damage. Only one war curse can be applied at a time."
      }
    ]
  }
} as const;
