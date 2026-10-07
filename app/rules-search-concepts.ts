export type RuleConcept = {
  id: string;
  phrases: string[];
  terms: string[];
  controllingTitles: string[];
  relatedTitles?: string[];
};

// Concepts translate the language a player is likely to use at the table into
// the section that actually controls the rule. Keep these focused on rules
// intent rather than trying to duplicate the SRD as a second rules database.
export const ruleConcepts: RuleConcept[] = [
  {
    id: "zero-hp",
    phrases: ["0 hp", "zero hp", "drop to 0", "reduced to 0", "mortally wounded"],
    terms: ["zero", "hp", "die", "mortal", "wound"],
    controllingTitles: ["Dropping to 0 Hit Points"],
    relatedTitles: ["Stabilizing a Mortally Wounded Character", "First Aid"],
  },
  {
    id: "stabilizing",
    phrases: ["stabilize", "stabilise", "save from death", "save someone dying", "heal dying", "stop someone dying"],
    terms: ["save", "stabilize", "stabilise", "die", "mortal", "wound"],
    controllingTitles: ["Stabilizing a Mortally Wounded Character"],
    relatedTitles: ["Dropping to 0 Hit Points", "First Aid"],
  },
  {
    id: "falling",
    phrases: ["fall damage", "falling damage", "damage from a fall", "fell", "fallen", "plunge"],
    terms: ["fall", "damage", "feet", "drop", "plunge"],
    controllingTitles: ["Falling"],
  },
  {
    id: "suffocation",
    phrases: ["hold my breath", "hold breath", "without air", "underwater", "drowning"],
    terms: ["breath", "air", "underwater", "drown", "suffocate"],
    controllingTitles: ["Suffocation"],
  },
  {
    id: "natural-healing",
    phrases: ["natural healing", "natural recovery", "heal after sleeping", "heal after sleep", "night rest", "rest healing"],
    terms: ["heal", "sleep", "rest", "night", "recover", "hp"],
    controllingTitles: ["Natural Healing"],
    relatedTitles: ["System Strain", "First Aid"],
  },
  {
    id: "first-aid",
    phrases: ["first aid", "bandage", "treat wounds", "mundane healing", "medical attention"],
    terms: ["bandage", "treat", "heal", "wound", "restore", "hp"],
    controllingTitles: ["First Aid"],
    relatedTitles: ["System Strain", "Natural Healing"],
  },
  {
    id: "system-strain",
    phrases: ["system strain", "healing limit", "strain maximum", "too much healing"],
    terms: ["system", "strain", "healing", "limit", "constitution"],
    controllingTitles: ["System Strain"],
    relatedTitles: ["First Aid", "Natural Healing"],
  },
  {
    id: "shock",
    phrases: ["shock damage", "damage on a miss", "damage when they miss", "melee miss"],
    terms: ["melee", "weapon", "miss", "damage", "shock"],
    controllingTitles: ["Shock Damage"],
  },
  {
    id: "fighting-withdrawal",
    phrases: ["fighting withdrawal", "leave melee", "disengage", "free attack", "parting attack", "run away", "move away from melee"],
    terms: ["leave", "melee", "free", "attack", "retreat", "disengage", "run", "away", "fight"],
    controllingTitles: ["Fighting Withdrawal"],
  },
  {
    id: "combat-actions",
    phrases: ["what can i do on my turn", "main action", "move action", "instant action", "on turn action"],
    terms: ["turn", "combat", "action", "main", "move", "instant"],
    controllingTitles: ["Actions in Combat"],
  },
  {
    id: "initiative",
    phrases: ["initiative", "turn order", "who goes first", "combat order"],
    terms: ["initiative", "turn", "order", "first", "combat"],
    controllingTitles: ["Initiative"],
  },
  {
    id: "armor-casting",
    phrases: ["cast in armor", "cast a spell in armor", "cast while wearing armor", "mage armor", "spellcasting and armor"],
    terms: ["cast", "spell", "mage", "armor", "armour", "shield"],
    controllingTitles: ["Spellcasting and Armor"],
    relatedTitles: ["Armored Magic"],
  },
  {
    id: "effort-commitment",
    phrases: ["commit effort", "committing effort", "effort for the scene", "effort for the day", "when does effort come back", "recover effort"],
    terms: ["effort", "commit", "scene", "day", "return", "recover", "refresh"],
    controllingTitles: ["Committing Effort"],
    relatedTitles: ["Effort", "Classes and Effort"],
  },
  {
    id: "partial-class-effort",
    phrases: ["partial class effort", "effort for a partial class", "how much effort does a partial class get"],
    terms: ["partial", "class", "effort", "maximum", "pool"],
    controllingTitles: ["Classes and Effort"],
    relatedTitles: ["Committing Effort", "Effort"],
  },
  {
    id: "background-any-combat",
    phrases: ["any combat", "background says any combat", "any combat skill"],
    terms: ["background", "any", "combat", "choose", "skill"],
    controllingTitles: ["Background Skills"],
    relatedTitles: ["Backgrounds", "The Skill List"],
  },
  {
    id: "attribute-modifiers",
    phrases: ["attribute modifier", "attribute modifiers", "stat modifier", "ability modifier"],
    terms: ["attribute", "stat", "modifier", "bonus", "penalty"],
    controllingTitles: ["Attribute Modifiers"],
    relatedTitles: ["Generating Attributes"],
  },
  {
    id: "starting-skills",
    phrases: ["starting skills", "skills in character creation", "skill in character creation", "begin play with skills"],
    terms: ["start", "skill", "level", "character", "creation", "begin"],
    controllingTitles: ["Gaining Skills in Character Creation"],
    relatedTitles: ["Skill Levels", "Background Skills"],
  },
  {
    id: "full-partial-classes",
    phrases: ["full class and partial class", "full vs partial", "full or partial class", "difference between a full class and a partial class"],
    terms: ["full", "partial", "class", "difference", "adventurer"],
    controllingTitles: ["Full and Partial Classes"],
    relatedTitles: ["The Adventurer Class", "Classes and Effort"],
  },
  {
    id: "skill-checks",
    phrases: ["skill check", "ability check", "task check", "what do i roll", "untrained skill"],
    terms: ["skill", "check", "roll", "2d6", "difficulty", "untrained"],
    controllingTitles: ["Skill Checks"],
  },
  {
    id: "poison",
    phrases: ["poison", "poisoned", "antidote", "toxin", "venom"],
    terms: ["poison", "toxin", "venom", "antidote", "save"],
    controllingTitles: ["Poisons"],
  },
  {
    id: "execution-attack",
    phrases: ["execution attack", "assassination", "helpless target", "execute someone"],
    terms: ["execution", "assassination", "helpless", "target", "attack"],
    controllingTitles: ["Execution Attacks"],
  },
  {
    id: "total-defense",
    phrases: ["total defense", "defensive action", "just defend", "dodge everything"],
    terms: ["total", "defense", "defend", "dodge", "action"],
    controllingTitles: ["Total Defense"],
  },
];
